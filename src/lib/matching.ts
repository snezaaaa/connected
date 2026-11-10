// ─────────────────────────────────────────────────────────────
//  Spajanje učenika i projekata — TypeScript verzija.
//  MORA davati isti rezultat kao SQL funkcije u
//  supabase/migrations/0003_matching.sql (provjerava
//  tests/matching.parity.test.ts). Koristi se samo u offline režimu.
//
//  Skor se nikad ne prikazuje u interfejsu.
// ─────────────────────────────────────────────────────────────

import { TAGS } from '../config/school'

export type TagKind = 'volim' | 'znam' | 'ucim'

export const KIND_WEIGHT: Record<TagKind, number> = { znam: 30, volim: 20, ucim: 10 }
/** Učenik grupi donosi novo odjeljenje/razred. */
export const DIVERSITY_BONUS = 8
/** Učenik trenutno nije ni u jednoj aktivnoj grupi. Uvijek manje od jedne poklopljene oznake. */
export const PRIORITY_BONUS = 6
export const WEEKLY_INVITE_CAP = 2
export const INVITES_PER_FREE_SPOT = 2
const WEEK_MS = 7 * 24 * 3600 * 1000

export interface MProfile {
  id: string
  role: 'student' | 'mentor' | 'pedagog'
  class_id: string | null
  onboarded: boolean
}
export interface MState {
  profiles: MProfile[]
  profileTags: { profile_id: string; tag: string; kind: TagKind }[]
  projects: { id: string; status: string; leader_id: string; spots: number }[]
  projectTags: { project_id: string; tag: string }[]
  members: { project_id: string; profile_id: string; left_at: string | null }[]
  invites: { project_id: string; profile_id: string; status: string; created_at: string }[]
}
export interface MatchResult {
  project_id: string
  profile_id: string
  reason_tag: string
  reason_kind: TagKind
}

const tagSort = (slug: string) => {
  const i = TAGS.findIndex((t) => t.slug === slug)
  return i < 0 ? 999 : i
}

export function freeSpots(s: MState, projectId: string): number {
  const p = s.projects.find((x) => x.id === projectId)
  if (!p) return 0
  const active = s.members.filter(
    (m) => m.project_id === projectId && m.left_at === null && m.profile_id !== p.leader_id,
  ).length
  return p.spots - active
}

export function isInActiveGroup(s: MState, profileId: string): boolean {
  return s.members.some(
    (m) =>
      m.profile_id === profileId &&
      m.left_at === null &&
      s.projects.find((p) => p.id === m.project_id)?.status === 'open',
  )
}

export function recentInviteCount(s: MState, profileId: string, now: Date): number {
  const since = now.getTime() - WEEK_MS
  return s.invites.filter(
    (i) => i.profile_id === profileId && new Date(i.created_at).getTime() > since,
  ).length
}

/** Skor kandidata za projekat, ili null ako nije kandidat. */
export function scoreCandidate(
  s: MState,
  projectId: string,
  profileId: string,
): { score: number; reason_tag: string; reason_kind: TagKind } | null {
  const p = s.projects.find((x) => x.id === projectId)
  const u = s.profiles.find((x) => x.id === profileId)
  if (!p || !u || u.role !== 'student' || !u.onboarded) return null
  if (p.leader_id === profileId) return null
  if (s.members.some((m) => m.project_id === projectId && m.profile_id === profileId)) return null
  if (s.invites.some((i) => i.project_id === projectId && i.profile_id === profileId)) return null

  const need = s.projectTags.filter((t) => t.project_id === projectId).map((t) => t.tag)
  let tagScore = 0
  let best: { tag: string; kind: TagKind; w: number } | null = null
  for (const tag of need) {
    const pt = s.profileTags.find((x) => x.profile_id === profileId && x.tag === tag)
    if (!pt) continue
    const w = KIND_WEIGHT[pt.kind]
    tagScore += w
    if (!best || w > best.w || (w === best.w && tagSort(tag) < tagSort(best.tag)))
      best = { tag, kind: pt.kind, w }
  }
  if (tagScore <= 0 || !best) return null

  const groupClasses = new Set(
    s.members
      .filter((m) => m.project_id === projectId && m.left_at === null)
      .map((m) => s.profiles.find((x) => x.id === m.profile_id)?.class_id)
      .filter((c): c is string => !!c),
  )
  let score = tagScore
  if (u.class_id && !groupClasses.has(u.class_id)) score += DIVERSITY_BONUS
  if (!isInActiveGroup(s, profileId)) score += PRIORITY_BONUS
  return { score, reason_tag: best.tag, reason_kind: best.kind }
}

const byScoreThenId = <T extends { score: number }>(key: (x: T) => string) => (a: T, b: T) =>
  b.score - a.score || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

/** Pokreće se kad je projekat odobren ili kad neko napusti grupu. */
export function matchProject(s: MState, projectId: string, now: Date): MatchResult[] {
  const p = s.projects.find((x) => x.id === projectId)
  if (!p || p.status !== 'open') return []
  const free = freeSpots(s, projectId)
  if (free <= 0) return []
  const pending = s.invites.filter((i) => i.project_id === projectId && i.status === 'pending').length
  const k = free * INVITES_PER_FREE_SPOT - pending
  if (k <= 0) return []
  const cands = s.profiles
    .filter((u) => recentInviteCount(s, u.id, now) < WEEKLY_INVITE_CAP)
    .map((u) => ({ id: u.id, r: scoreCandidate(s, projectId, u.id) }))
    .filter((x) => x.r !== null)
    .map((x) => ({ id: x.id, score: x.r!.score, r: x.r! }))
    .sort(byScoreThenId((x) => x.id))
    .slice(0, k)
  return cands.map((c) => ({
    project_id: projectId,
    profile_id: c.id,
    reason_tag: c.r.reason_tag,
    reason_kind: c.r.reason_kind,
  }))
}

/** Pokreće se kad učenik sačuva oznake (novi nalog) ili napusti grupu. */
export function matchProfile(s: MState, profileId: string, now: Date): MatchResult[] {
  const remaining = WEEKLY_INVITE_CAP - recentInviteCount(s, profileId, now)
  if (remaining <= 0) return []
  return s.projects
    .filter((p) => p.status === 'open' && freeSpots(s, p.id) > 0)
    .map((p) => ({ pid: p.id, r: scoreCandidate(s, p.id, profileId) }))
    .filter((x) => x.r !== null)
    .map((x) => ({ pid: x.pid, score: x.r!.score, r: x.r! }))
    .sort(byScoreThenId((x) => x.pid))
    .slice(0, remaining)
    .map((x) => ({
      project_id: x.pid,
      profile_id: profileId,
      reason_tag: x.r.reason_tag,
      reason_kind: x.r.reason_kind,
    }))
}
