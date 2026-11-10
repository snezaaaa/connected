// Online režim: Supabase (Postgres + Auth + Realtime). Sve izmjene idu kroz RPC.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { nickToEmail } from '../lib/nick'
import type { ChangeHandler, DataSource, Me } from './types'

import { SUPABASE_URL as URL, SUPABASE_ANON_KEY as KEY } from './env'

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!client) {
    if (!URL || !KEY) throw new Error('Supabase nije podešen. Uključi „Offline demo“.')
    client = createClient(URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ce-auth' },
    })
  }
  return client
}

function friendly(msg: string): string {
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg))
    return 'Nema veze sa serverom. Ako nema interneta, uključi „Offline demo“.'
  if (/Invalid login credentials/i.test(msg)) return 'Nik ili lozinka nisu tačni.'
  if (/Password should be/i.test(msg)) return 'Lozinka treba da ima bar 6 znakova.'
  if (/rate limit/i.test(msg)) return 'Previše pokušaja. Sačekaj minut pa probaj ponovo.'
  if (/Email address .* is invalid/i.test(msg))
    return 'Server ne prihvata demo email domen. Pogledaj README → VITE_AUTH_EMAIL_DOMAIN.'
  return msg
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args)
  if (error) throw new Error(friendly(error.message))
  return data as T
}

export const supabaseSource: DataSource = {
  mode: 'online',

  async currentUser() {
    const { data } = await sb().auth.getSession()
    if (!data.session) return null
    return rpc<Me | null>('get_me')
  },

  checkCode: (code) => rpc('check_code', { p_code: code }),
  nickStatus: (nick) => rpc('nick_status', { p_nick: nick }),

  async register(code, nick, password) {
    const email = nickToEmail(nick)
    const up = await sb().auth.signUp({ email, password })
    let session = up.data.session
    if (up.error && /already registered|already exists/i.test(up.error.message)) {
      // Nalog postoji, ali profil možda nije završen (npr. prekinuta registracija).
      const inn = await sb().auth.signInWithPassword({ email, password })
      if (inn.error) throw new Error('Taj nik je zauzet. Probaj drugi.')
      session = inn.data.session
    } else if (up.error) throw new Error(friendly(up.error.message))
    if (!session)
      throw new Error('Supabase traži potvrdu emaila. Isključi „Confirm email“ (vidi README, korak 3).')
    return rpc<Me>('redeem_code', { p_code: code, p_nick: nick })
  },

  async login(nick, password) {
    const { error } = await sb().auth.signInWithPassword({ email: nickToEmail(nick), password })
    if (error) throw new Error(friendly(error.message))
    const me = await rpc<Me | null>('get_me')
    if (!me) throw new Error('Registracija nije završena. Klikni „Imam kod“ i unesi isti nik i lozinku.')
    return me
  },

  async logout() {
    await sb().auth.signOut()
  },

  getMyTags: () => rpc('get_my_tags'),
  saveTags: (tags) => rpc('save_tags', { p_tags: tags }),
  getFeed: () => rpc('get_feed'),
  getMyGroups: () => rpc('get_my_groups'),
  getMyInvites: () => rpc('get_my_invites'),
  getProject: (id) => rpc('get_project', { p_id: id }),
  createProject: (p) =>
    rpc('create_project', {
      p_title: p.title, p_goal: p.goal, p_deadline: p.deadline, p_spots: p.spots, p_tags: p.tags, p_icon: p.icon,
    }),
  respondInvite: (id, accept) => rpc('respond_invite', { p_invite: id, p_accept: accept }),
  joinProject: (id) => rpc('join_project', { p_project: id }),
  leaveProject: (id) => rpc('leave_project', { p_project: id }),
  postWall: (id, body) => rpc('post_wall', { p_project: id, p_body: body }),
  completeProject: (id, result) => rpc('complete_project', { p_project: id, p_result: result }),
  getNotifications: () => rpc('get_notifications'),
  markNotificationsRead: () => rpc('mark_notifications_read'),
  requestHelp: (note) => rpc('request_help', { p_note: note ?? null }),
  getMentorDashboard: () => rpc('get_mentor_dashboard'),
  approveProject: (id, approve) => rpc('approve_project', { p_project: id, p_approve: approve }),
  resolveHelp: (id) => rpc('resolve_help', { p_id: id }),
  resetDemo: () => rpc('reset_demo'),

  // Realtime: bez pollinga. RLS određuje koje redove ko dobija.
  subscribe(me: Me, cb: ChangeHandler) {
    const ch = sb()
      .channel('ce-' + me.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invites', filter: `profile_id=eq.${me.id}` }, () => cb('invites'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profile_id=eq.${me.id}` }, () => cb('notifications'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { cb('feed'); cb('mentor') })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, (p) => {
        const row = (p.new && 'project_id' in p.new ? p.new : p.old) as { project_id?: string }
        cb('feed'); cb('mentor'); cb('wall', { project_id: row?.project_id })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wall_posts' }, (p) =>
        cb('wall', { project_id: (p.new as { project_id: string }).project_id }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_signals' }, () => cb('mentor'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'demo_meta' }, () => cb('reset'))
      .subscribe()
    return () => {
      void sb().removeChannel(ch)
    }
  },
}
