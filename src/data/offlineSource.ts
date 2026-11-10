// ─────────────────────────────────────────────────────────────
//  Offline režim: cijeli tok na jednom uređaju, iz localStorage.
//  Prati SQL funkcije iz supabase/migrations (iste poruke, isti
//  oblik odgovora) i koristi src/lib/matching.ts za spajanje.
// ─────────────────────────────────────────────────────────────
import { matchProfile, matchProject, freeSpots, type MState, type TagKind } from '../lib/matching'
import { nickProblem, normalizeNick } from '../lib/nick'
import { CLASSES, TAGS } from '../config/school'
import { SEED } from './seed.generated'
import type {
  AppNotification, Change, ChangeHandler, DataSource, LocalAccount, Me, MentorDashboard,
  ProjectDetail, ProjectItem, Role,
} from './types'

const KEY = 'ce-offline-v1'
const DAY = 86400_000
const OFFLINE_MENTOR_ID = 'c0000000-0000-4000-8000-000000000001'

interface OProfile { id: string; nick: string; nick_norm: string; role: Role; class_id: string | null; onboarded: boolean; is_seed: boolean; created_at: string }
interface OProject { id: string; title: string; goal: string; deadline: string | null; spots: number; icon: string; status: ProjectItem['status']; leader_id: string; result_text: string | null; created_at: string; approved_at: string | null; completed_at: string | null }
interface OState {
  codes: { code: string; role: Role; class_id: string | null; used_at: string | null }[]
  accounts: { profile_id: string; password: string }[]
  current: string | null
  profiles: OProfile[]
  profileTags: { profile_id: string; tag: string; kind: TagKind }[]
  projects: OProject[]
  projectTags: { project_id: string; tag: string }[]
  members: { project_id: string; profile_id: string; joined_at: string; left_at: string | null }[]
  invites: { id: string; project_id: string; profile_id: string; reason_tag: string; reason_kind: TagKind; status: string; created_at: string; responded_at: string | null }[]
  wall: { id: string; project_id: string; author_id: string | null; kind: 'post' | 'system'; body: string; created_at: string }[]
  notifications: { id: string; profile_id: string; kind: string; project_id: string | null; body: string; read_at: string | null; created_at: string }[]
  help: { id: string; profile_id: string; note: string | null; created_at: string; handled_at: string | null }[]
  firstGroupEvents: { profile_id: string; at: string }[]
}

const now = () => new Date().toISOString()
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString()
const dateIn = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10)
const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))

function seedState(keep?: OState): OState {
  const s: OState = {
    codes: SEED.codes.map((c) => ({ ...c, used_at: null })),
    accounts: [{ profile_id: OFFLINE_MENTOR_ID, password: '' }],
    current: null,
    profiles: [
      ...SEED.profiles.map((p) => ({
        id: p.id, nick: p.nick, nick_norm: normalizeNick(p.nick), role: 'student' as Role,
        class_id: p.class_id, onboarded: true, is_seed: true, created_at: ago(70),
      })),
      { id: OFFLINE_MENTOR_ID, nick: 'Profesorka', nick_norm: 'profesorka', role: 'mentor', class_id: null, onboarded: true, is_seed: true, created_at: ago(70) },
    ],
    profileTags: SEED.profiles.flatMap((p) => p.tags.map((t) => ({ profile_id: p.id, ...t }))),
    projects: SEED.projects.map((p) => ({
      id: p.id, title: p.title, goal: p.goal, icon: p.icon, spots: p.spots, status: p.status,
      leader_id: p.leader_id, result_text: p.result_text ?? null, created_at: ago(p.created),
      approved_at: ago(p.approved), completed_at: p.completed != null ? ago(p.completed) : null,
      deadline: dateIn(p.deadline),
    })),
    projectTags: SEED.projects.flatMap((p) => p.tags.map((tag) => ({ project_id: p.id, tag }))),
    members: SEED.members.map((m) => ({ project_id: m.project_id, profile_id: m.profile_id, joined_at: ago(m.joined), left_at: null })),
    invites: [],
    wall: SEED.wall.map((w) => ({ id: uuid(), project_id: w.project_id, author_id: w.author_id, kind: w.kind, body: w.body, created_at: ago(w.ago) })),
    notifications: [],
    help: [],
    firstGroupEvents: SEED.firstGroupEvents.map((e) => ({ profile_id: e.profile_id, at: ago(e.ago) })),
  }
  if (keep) {
    // Reset čuva mentorske/pedagoške naloge napravljene na ovom uređaju (kao online).
    const staff = keep.profiles.filter((p) => p.role !== 'student' && !s.profiles.some((x) => x.id === p.id))
    s.profiles.push(...staff)
    s.accounts = keep.accounts.filter((a) => s.profiles.some((p) => p.id === a.profile_id))
    for (const c of s.codes) {
      const old = keep.codes.find((k) => k.code === c.code)
      if (old && c.role !== 'student') c.used_at = old.used_at
    }
    s.current = s.profiles.some((p) => p.id === keep.current) ? keep.current : null
  }
  return s
}

let state: OState = load()
function load(): OState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as OState
  } catch {
    /* prazno */
  }
  return seedState()
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* pun ili blokiran storage: radi u memoriji */
  }
}

const listeners = new Set<ChangeHandler>()
function emit(...changes: Change[]) {
  for (const c of changes) for (const l of listeners) l(c)
}
if (typeof window !== 'undefined') {
  // Dva taba na istom uređaju se sinhronizuju.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    state = load()
    emit('feed', 'invites', 'notifications', 'wall', 'mentor')
  })
}

function mutate<T>(fn: () => T, ...changes: Change[]): T {
  const r = fn()
  save()
  emit(...changes)
  return r
}

// ─── Pomoćne (prate SQL) ─────────────────────────────────────
const mstate = (): MState => ({
  profiles: state.profiles, profileTags: state.profileTags, projects: state.projects,
  projectTags: state.projectTags, members: state.members, invites: state.invites,
})
const classLabel = (id: string | null) => CLASSES.find((c) => c.id === id)?.label ?? null
const prof = (id: string) => state.profiles.find((p) => p.id === id)
function me(): OProfile {
  const p = state.current ? prof(state.current) : undefined
  if (!p) throw new Error('Nalog nije pronađen. Prijavi se ponovo.')
  return p
}
const isStaff = (p: OProfile) => p.role === 'mentor' || p.role === 'pedagog'
function requireStaff() {
  const m = me()
  if (!isStaff(m)) throw new Error('Samo za mentore.')
  return m
}
const meJson = (p: OProfile): Me => ({
  id: p.id, nick: p.nick, role: p.role, class_id: p.class_id, class_label: classLabel(p.class_id), onboarded: p.onboarded,
})
const activeMember = (project: string, profile: string) =>
  state.members.some((m) => m.project_id === project && m.profile_id === profile && m.left_at === null)
const tagSort = (t: string) => TAGS.findIndex((x) => x.slug === t)

function projectJson(p: OProject, meId: string): ProjectItem {
  const mem = state.members
    .filter((m) => m.project_id === p.id && m.left_at === null)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
  const inv = state.invites.find((i) => i.project_id === p.id && i.profile_id === meId && i.status === 'pending')
  return {
    id: p.id, title: p.title, goal: p.goal, deadline: p.deadline, spots: p.spots, free: freeSpots(mstate(), p.id),
    icon: p.icon, status: p.status, created_at: p.created_at, approved_at: p.approved_at,
    completed_at: p.completed_at, result_text: p.result_text,
    tags: state.projectTags.filter((t) => t.project_id === p.id).map((t) => t.tag).sort((a, b) => tagSort(a) - tagSort(b)),
    leader_nick: prof(p.leader_id)?.nick ?? '',
    members: mem.map((m) => {
      const u = prof(m.profile_id)!
      return { nick: u.nick, class_label: classLabel(u.class_id), is_leader: u.id === p.leader_id }
    }),
    class_count: new Set(mem.map((m) => prof(m.profile_id)?.class_id).filter(Boolean)).size,
    is_member: activeMember(p.id, meId),
    is_leader: p.leader_id === meId,
    invite: inv ? { id: inv.id, reason_tag: inv.reason_tag, reason_kind: inv.reason_kind } : null,
  }
}
const sortFeed = (a: OProject, b: OProject) =>
  Number(a.status === 'done') - Number(b.status === 'done') ||
  (b.completed_at ?? b.approved_at ?? b.created_at).localeCompare(a.completed_at ?? a.approved_at ?? a.created_at)

function notify(profile_id: string, kind: string, project_id: string | null, body: string) {
  state.notifications.push({ id: uuid(), profile_id, kind, project_id, body, read_at: null, created_at: now() })
}
function insertInvites(rs: ReturnType<typeof matchProject>) {
  for (const r of rs)
    if (!state.invites.some((i) => i.project_id === r.project_id && i.profile_id === r.profile_id))
      state.invites.push({ id: uuid(), ...r, status: 'pending', created_at: now(), responded_at: null })
}
const runProjectMatching = (id: string) => insertInvites(matchProject(mstate(), id, new Date()))
const runProfileMatching = (id: string) => insertInvites(matchProfile(mstate(), id, new Date()))

function joinInternal(projectId: string, u: OProfile): string {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p || p.status !== 'open') throw new Error('Ovaj projekat trenutno ne prima nove članove.')
  if (activeMember(projectId, u.id)) return 'already'
  if (freeSpots(mstate(), projectId) <= 0) return 'full'
  const wasWithout = !state.members.some((m) => m.profile_id === u.id && m.left_at === null)
  const ex = state.members.find((m) => m.project_id === projectId && m.profile_id === u.id)
  if (ex) {
    ex.left_at = null
    ex.joined_at = now()
  } else state.members.push({ project_id: projectId, profile_id: u.id, joined_at: now(), left_at: null })
  for (const i of state.invites)
    if (i.project_id === projectId && i.profile_id === u.id && i.status === 'pending') {
      i.status = 'accepted'
      i.responded_at = now()
    }
  state.wall.push({ id: uuid(), project_id: projectId, author_id: u.id, kind: 'system', body: `${u.nick} se pridružio/la timu 🎉`, created_at: now() })
  if (p.leader_id !== u.id) notify(p.leader_id, 'new_member', projectId, `${u.nick} se pridružio/la timu „${p.title}“ 🎉`)
  if (wasWithout) state.firstGroupEvents.push({ profile_id: u.id, at: now() })
  if (freeSpots(mstate(), projectId) <= 0)
    for (const i of state.invites) if (i.project_id === projectId && i.status === 'pending') i.status = 'expired'
  return 'ok'
}

function metrics() {
  const students = state.profiles.filter((p) => p.role === 'student')
  const okProjects = new Set(state.projects.filter((p) => p.status === 'open' || p.status === 'done').map((p) => p.id))
  const inGroup = new Set(
    state.members.filter((m) => m.left_at === null && okProjects.has(m.project_id) && prof(m.profile_id)?.role === 'student').map((m) => m.profile_id),
  )
  return {
    students: students.length,
    in_group_pct: students.length ? Math.round((100 * inGroup.size) / students.length) : 0,
    zero_to_one: state.firstGroupEvents.length,
    done: state.projects.filter((p) => p.status === 'done').length,
    mixed_groups: [...okProjects].filter(
      (id) => new Set(state.members.filter((m) => m.project_id === id && m.left_at === null).map((m) => prof(m.profile_id)?.class_id).filter(Boolean)).size >= 2,
    ).length,
  }
}

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 0))
const run = <T>(fn: () => T): Promise<T> => {
  try {
    return delay(fn())
  } catch (e) {
    return Promise.reject(e)
  }
}

// ─── Izvor ───────────────────────────────────────────────────
export const offlineSource: DataSource = {
  mode: 'offline',

  currentUser: () => run(() => (state.current && prof(state.current) ? meJson(prof(state.current)!) : null)),

  checkCode: (code) =>
    run(() => {
      const c = state.codes.find((x) => x.code === code.trim().toUpperCase() && !x.used_at)
      return c ? { ok: true, role: c.role, class_label: classLabel(c.class_id) } : { ok: false }
    }),

  nickStatus: (nick) =>
    run(() => {
      let problem = nickProblem(nick)
      if (!problem && state.profiles.some((p) => p.nick_norm === normalizeNick(nick))) problem = 'Taj nik je zauzet. Probaj drugi.'
      return { ok: !problem, problem }
    }),

  register: (code, nick, password) =>
    run(() =>
      mutate(() => {
        if (password.length < 6) throw new Error('Lozinka treba da ima bar 6 znakova.')
        const problem = nickProblem(nick)
        if (problem) throw new Error(problem)
        const c = state.codes.find((x) => x.code === code.trim().toUpperCase())
        if (!c || c.used_at) throw new Error('Kod nije važeći ili je već iskorišćen.')
        if (state.profiles.some((p) => p.nick_norm === normalizeNick(nick))) throw new Error('Taj nik je zauzet. Probaj drugi.')
        const p: OProfile = {
          id: uuid(), nick: nick.trim(), nick_norm: normalizeNick(nick), role: c.role, class_id: c.class_id,
          onboarded: c.role !== 'student', is_seed: false, created_at: now(),
        }
        state.profiles.push(p)
        c.used_at = now()
        state.accounts.push({ profile_id: p.id, password })
        state.current = p.id
        return meJson(p)
      }, 'mentor'),
    ),

  login: (nick, password) =>
    run(() =>
      mutate(() => {
        const p = state.profiles.find((x) => x.nick_norm === normalizeNick(nick))
        const a = p && state.accounts.find((x) => x.profile_id === p.id)
        if (!p || !a || (a.password && a.password !== password)) throw new Error('Nik ili lozinka nisu tačni.')
        state.current = p.id
        return meJson(p)
      }),
    ),

  logout: () => run(() => mutate(() => void (state.current = null))),

  listAccounts: (): LocalAccount[] =>
    state.accounts
      .map((a) => prof(a.profile_id))
      .filter((p): p is OProfile => !!p)
      .map((p) => ({ profile_id: p.id, nick: p.nick, role: p.role })),

  switchAccount: (profileId) =>
    run(() =>
      mutate(() => {
        const p = prof(profileId)
        if (!p || !state.accounts.some((a) => a.profile_id === profileId)) throw new Error('Nalog nije pronađen.')
        state.current = p.id
        return meJson(p)
      }),
    ),

  getMyTags: () => run(() => state.profileTags.filter((t) => t.profile_id === me().id).map(({ tag, kind }) => ({ tag, kind }))),

  saveTags: (tags) =>
    run(() =>
      mutate(() => {
        const u = me()
        if (!tags.length) throw new Error('Izaberi bar jednu oznaku.')
        state.profileTags = state.profileTags.filter((t) => t.profile_id !== u.id)
        const seen = new Set<string>()
        for (const t of tags)
          if (!seen.has(t.tag) && TAGS.some((x) => x.slug === t.tag)) {
            seen.add(t.tag)
            state.profileTags.push({ profile_id: u.id, tag: t.tag, kind: t.kind })
          }
        u.onboarded = true
        if (u.role === 'student') runProfileMatching(u.id) // trigger „novi nalog“
      }, 'invites'),
    ),

  getFeed: () =>
    run(() => {
      const u = me()
      return state.projects
        .filter((p) => p.status === 'open' || p.status === 'done' || (p.status === 'pending' && p.leader_id === u.id))
        .sort(sortFeed)
        .map((p) => projectJson(p, u.id))
    }),

  getMyGroups: () =>
    run(() => {
      const u = me()
      return state.projects
        .filter((p) =>
          ((p.status === 'open' || p.status === 'done') && activeMember(p.id, u.id)) ||
          ((p.status === 'pending' || p.status === 'rejected') && p.leader_id === u.id))
        .sort(sortFeed)
        .map((p) => projectJson(p, u.id))
    }),

  getMyInvites: () =>
    run(() => {
      const u = me()
      return state.invites
        .filter((i) => i.profile_id === u.id && i.status === 'pending' && state.projects.find((p) => p.id === i.project_id)?.status === 'open')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((i) => projectJson(state.projects.find((p) => p.id === i.project_id)!, u.id))
    }),

  getProject: (id) =>
    run((): ProjectDetail | null => {
      const u = me()
      const p = state.projects.find((x) => x.id === id)
      if (!p) return null
      if (!(p.status === 'open' || p.status === 'done' || p.leader_id === u.id || isStaff(u))) return null
      const wall = isStaff(u) || activeMember(id, u.id)
      return {
        ...projectJson(p, u.id),
        can_see_wall: wall,
        can_post: wall && u.role === 'student' && p.status === 'open',
        wall: wall
          ? state.wall
              .filter((w) => w.project_id === id)
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((w) => ({ id: w.id, kind: w.kind, body: w.body, author_nick: w.author_id ? prof(w.author_id)?.nick ?? null : null, created_at: w.created_at }))
          : [],
      }
    }),

  createProject: (np) =>
    run(() =>
      mutate(() => {
        const u = me()
        if (u.role !== 'student') throw new Error('Projekte pokreću učenici.')
        if (state.projects.filter((p) => p.leader_id === u.id && p.status === 'pending').length >= 3)
          throw new Error('Već imaš 3 projekta koja čekaju odobrenje.')
        if (!np.tags.length) throw new Error('Izaberi bar jednu oznaku.')
        const id = uuid()
        state.projects.push({
          id, title: np.title.trim(), goal: np.goal.trim(), deadline: np.deadline, spots: np.spots || 2,
          icon: np.icon || '✨', status: 'pending', leader_id: u.id, result_text: null, created_at: now(),
          approved_at: null, completed_at: null,
        })
        for (const tag of new Set(np.tags)) state.projectTags.push({ project_id: id, tag })
        return id
      }, 'feed', 'mentor'),
    ),

  respondInvite: (id, accept) =>
    run(() =>
      mutate(() => {
        const u = me()
        const i = state.invites.find((x) => x.id === id && x.profile_id === u.id)
        if (!i || i.status !== 'pending') return 'gone'
        if (!accept) {
          i.status = 'declined' // „Ne sada“: bez posljedica
          i.responded_at = now()
          return 'ok'
        }
        return joinInternal(i.project_id, u)
      }, 'invites', 'feed', 'wall', 'notifications', 'mentor'),
    ),

  joinProject: (id) =>
    run(() =>
      mutate(() => {
        const u = me()
        if (u.role !== 'student') throw new Error('Samo učenici ulaze u timove.')
        return joinInternal(id, u)
      }, 'invites', 'feed', 'wall', 'notifications', 'mentor'),
    ),

  leaveProject: (id) =>
    run(() =>
      mutate(() => {
        const u = me()
        if (state.projects.some((p) => p.id === id && p.leader_id === u.id)) throw new Error('Vođa projekta ne može napustiti tim.')
        const m = state.members.find((x) => x.project_id === id && x.profile_id === u.id && x.left_at === null)
        if (!m) return
        m.left_at = now()
        state.wall.push({ id: uuid(), project_id: id, author_id: u.id, kind: 'system', body: `${u.nick} više nije u timu. Hvala na pomoći! 💜`, created_at: now() })
        runProjectMatching(id) // trigger „neko napustio grupu“
        runProfileMatching(u.id)
      }, 'feed', 'wall', 'invites', 'mentor'),
    ),

  postWall: (id, body) =>
    run(() =>
      mutate(() => {
        const u = me()
        if (!activeMember(id, u.id) || state.projects.find((p) => p.id === id)?.status !== 'open')
          throw new Error('Na zid pišu članovi tima.')
        if (!body.trim()) return
        state.wall.push({ id: uuid(), project_id: id, author_id: u.id, kind: 'post', body: body.trim().slice(0, 500), created_at: now() })
      }, 'wall'),
    ),

  completeProject: (id, result) =>
    run(() =>
      mutate(() => {
        const u = me()
        const p = state.projects.find((x) => x.id === id)
        if (!p || p.status !== 'open') throw new Error('Projekat nije u toku.')
        if (!activeMember(id, u.id)) throw new Error('Projekat završavaju članovi tima.')
        if (result.trim().length < 3) throw new Error('Napiši kratko šta ste uradili.')
        p.status = 'done'
        p.result_text = result.trim().slice(0, 400)
        p.completed_at = now()
        for (const i of state.invites) if (i.project_id === id && i.status === 'pending') i.status = 'expired'
        state.wall.push({ id: uuid(), project_id: id, author_id: u.id, kind: 'system', body: 'Projekat je završen! Rezultat je sada u feedu škole. 🎉', created_at: now() })
        for (const m of state.members)
          if (m.project_id === id && m.left_at === null && m.profile_id !== u.id)
            notify(m.profile_id, 'done', id, `Projekat „${p.title}“ je završen. Bravo, tim! 🎉`)
      }, 'feed', 'wall', 'notifications', 'mentor', 'invites'),
    ),

  getNotifications: () =>
    run((): AppNotification[] => {
      const u = me()
      return state.notifications
        .filter((n) => n.profile_id === u.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 30)
        .map((n) => ({ id: n.id, kind: n.kind, project_id: n.project_id, body: n.body, read: !!n.read_at, created_at: n.created_at }))
    }),

  markNotificationsRead: () =>
    run(() =>
      mutate(() => {
        const u = me()
        for (const n of state.notifications) if (n.profile_id === u.id && !n.read_at) n.read_at = now()
      }),
    ),

  requestHelp: (note) =>
    run(() =>
      mutate(() => {
        const u = me()
        state.help.push({ id: uuid(), profile_id: u.id, note: note?.trim().slice(0, 300) || null, created_at: now(), handled_at: null })
      }, 'mentor'),
    ),

  getMentorDashboard: () =>
    run((): MentorDashboard => {
      const u = requireStaff()
      return {
        pending: state.projects.filter((p) => p.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => projectJson(p, u.id)),
        groups: state.projects.filter((p) => p.status === 'open').sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? '')).map((p) => projectJson(p, u.id)),
        codes: state.codes.filter((c) => !c.used_at).map((c) => ({ code: c.code, role: c.role, class_label: classLabel(c.class_id) })),
        help: state.help
          .filter((h) => !h.handled_at)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((h) => ({ id: h.id, nick: prof(h.profile_id)?.nick ?? '', class_label: classLabel(prof(h.profile_id)?.class_id ?? null), note: h.note, created_at: h.created_at })),
        metrics: metrics(),
      }
    }),

  approveProject: (id, approve) =>
    run(() =>
      mutate(() => {
        requireStaff()
        const p = state.projects.find((x) => x.id === id)
        if (!p || p.status !== 'pending') return
        if (approve) {
          if (!state.members.some((m) => m.project_id === id && m.profile_id === p.leader_id))
            state.members.push({ project_id: id, profile_id: p.leader_id, joined_at: now(), left_at: null })
          if (!state.members.some((m) => m.profile_id === p.leader_id && m.left_at === null && m.project_id !== id))
            state.firstGroupEvents.push({ profile_id: p.leader_id, at: now() })
          state.wall.push({ id: uuid(), project_id: id, author_id: null, kind: 'system', body: 'Projekat je odobren. Srećno, tim! 🚀', created_at: now() })
          p.status = 'open'
          p.approved_at = now()
          runProjectMatching(id) // trigger „projekat odobren“
          notify(p.leader_id, 'approved', id, `Tvoj projekat „${p.title}“ je odobren. Pozivi su poslati! 🚀`)
        } else {
          p.status = 'rejected'
          notify(p.leader_id, 'rejected', id, `Projekat „${p.title}“ ovaj put nije odobren. Mentor će ti se javiti.`)
        }
      }, 'feed', 'mentor', 'invites', 'notifications'),
    ),

  resolveHelp: (id) =>
    run(() =>
      mutate(() => {
        requireStaff()
        const h = state.help.find((x) => x.id === id)
        if (h) h.handled_at = now()
      }, 'mentor'),
    ),

  resetDemo: () =>
    run(() =>
      mutate(() => {
        requireStaff()
        state = seedState(state)
      }, 'reset'),
    ),

  subscribe(_me, cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },
}

/** Samo za testove/razvoj. */
export function __resetOfflineStore() {
  state = seedState()
  save()
}
