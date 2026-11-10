// Postgres u Node-u (PGlite) sa istim migracijama i seedom kao Supabase.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import type { MState } from '../../src/lib/matching'

const root = new URL('../../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), 'utf8')

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(read('tests/sql/supabase-stub.sql'))
  const files = readdirSync(new URL('supabase/migrations/', root)).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) await db.exec(read('supabase/migrations/' + f))
  await db.exec(read('supabase/seed.sql'))
  return db
}

export async function loadState(db: PGlite): Promise<MState> {
  const rows = async <T>(sql: string) => (await db.query<T>(sql)).rows
  return {
    profiles: await rows(`select id, role, class_id, onboarded from profiles`),
    profileTags: await rows(`select profile_id, tag, kind from profile_tags`),
    projects: await rows(`select id, status, leader_id, spots from projects`),
    projectTags: await rows(`select project_id, tag from project_tags`),
    members: await rows(`select project_id, profile_id, left_at::text as left_at from group_members`),
    invites: await rows(`select project_id, profile_id, status, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at from invites`),
  }
}
