import type { TagKind } from '../lib/matching'
export type { TagKind }

export type Role = 'student' | 'mentor' | 'pedagog'

export interface Me {
  id: string
  nick: string
  role: Role
  class_id: string | null
  class_label: string | null
  onboarded: boolean
}

export interface Member {
  nick: string
  class_label: string | null
  is_leader: boolean
}

export interface InviteRef {
  id: string
  reason_tag: string
  reason_kind: TagKind
}

export interface ProjectItem {
  id: string
  title: string
  goal: string
  deadline: string | null
  spots: number
  free: number
  icon: string
  status: 'pending' | 'open' | 'done' | 'rejected'
  created_at: string
  approved_at: string | null
  completed_at: string | null
  result_text: string | null
  tags: string[]
  leader_nick: string
  members: Member[]
  class_count: number
  is_member: boolean
  is_leader: boolean
  invite: InviteRef | null
}

export interface WallPost {
  id: string
  kind: 'post' | 'system'
  body: string
  author_nick: string | null
  created_at: string
}

export interface ProjectDetail extends ProjectItem {
  can_see_wall: boolean
  can_post: boolean
  wall: WallPost[]
}

export interface AppNotification {
  id: string
  kind: string
  project_id: string | null
  body: string
  read: boolean
  created_at: string
}

export interface Metrics {
  students: number
  in_group_pct: number
  zero_to_one: number
  done: number
  mixed_groups: number
}

export interface MentorDashboard {
  pending: ProjectItem[]
  groups: ProjectItem[]
  codes: { code: string; role: Role; class_label: string | null }[]
  help: { id: string; nick: string; class_label: string | null; note: string | null; created_at: string }[]
  metrics: Metrics
}

export interface NewProject {
  title: string
  goal: string
  deadline: string | null
  spots: number
  tags: string[]
  icon: string
}

export type Change = 'invites' | 'notifications' | 'feed' | 'wall' | 'mentor' | 'reset'
export type ChangeHandler = (c: Change, payload?: { project_id?: string }) => void

export interface LocalAccount {
  profile_id: string
  nick: string
  role: Role
}

export interface DataSource {
  mode: 'online' | 'offline'
  currentUser(): Promise<Me | null>
  checkCode(code: string): Promise<{ ok: boolean; role?: Role; class_label?: string | null }>
  nickStatus(nick: string): Promise<{ ok: boolean; problem: string | null }>
  register(code: string, nick: string, password: string): Promise<Me>
  login(nick: string, password: string): Promise<Me>
  logout(): Promise<void>
  getMyTags(): Promise<{ tag: string; kind: TagKind }[]>
  saveTags(tags: { tag: string; kind: TagKind }[]): Promise<void>
  getFeed(): Promise<ProjectItem[]>
  getMyGroups(): Promise<ProjectItem[]>
  getMyInvites(): Promise<ProjectItem[]>
  getProject(id: string): Promise<ProjectDetail | null>
  createProject(p: NewProject): Promise<string>
  respondInvite(id: string, accept: boolean): Promise<string>
  joinProject(id: string): Promise<string>
  leaveProject(id: string): Promise<void>
  postWall(id: string, body: string): Promise<void>
  completeProject(id: string, result: string): Promise<void>
  getNotifications(): Promise<AppNotification[]>
  markNotificationsRead(): Promise<void>
  requestHelp(note?: string): Promise<void>
  getMentorDashboard(): Promise<MentorDashboard>
  approveProject(id: string, approve: boolean): Promise<void>
  resolveHelp(id: string): Promise<void>
  resetDemo(): Promise<void>
  subscribe(me: Me, cb: ChangeHandler): () => void
  // samo offline
  listAccounts?(): LocalAccount[]
  switchAccount?(profileId: string): Promise<Me>
}
