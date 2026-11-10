// SQL (supabase/migrations/0003_matching.sql) i TypeScript (src/lib/matching.ts)
// moraju dati IDENTIČAN rezultat — isti učenici, isti projekti, isti redoslijed, isti razlog.
import { describe, expect, it, beforeAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { freshDb, loadState } from './helpers/db'
import { matchProfile, matchProject, type TagKind } from '../src/lib/matching'
import { TAGS } from '../src/config/school'

const NOW = new Date('2026-11-10T12:00:00.000Z')
type Row = { m_project: string; m_profile: string; m_tag: string; m_kind: string }
const norm = (r: Row[]) => r.map((x) => `${x.m_project}|${x.m_profile}|${x.m_tag}|${x.m_kind}`)
const normTs = (r: ReturnType<typeof matchProject>) =>
  r.map((x) => `${x.project_id}|${x.profile_id}|${x.reason_tag}|${x.reason_kind}`)

async function compareAll(db: PGlite) {
  const s = await loadState(db)
  let checked = 0
  for (const p of s.projects) {
    const sql = (await db.query<Row>(`select * from private.compute_project_matches($1, $2)`, [p.id, NOW.toISOString()])).rows
    expect(normTs(matchProject(s, p.id, NOW)), `projekat ${p.id}`).toEqual(norm(sql))
    checked += sql.length
  }
  for (const u of s.profiles) {
    const sql = (await db.query<Row>(`select * from private.compute_profile_matches($1, $2)`, [u.id, NOW.toISOString()])).rows
    expect(normTs(matchProfile(s, u.id, NOW)), `učenik ${u.id}`).toEqual(norm(sql))
    checked += sql.length
  }
  return checked
}

// Deterministički generator slučajnih brojeva
function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

describe('paritet spajanja SQL ↔ TS', () => {
  let db: PGlite
  beforeAll(async () => {
    db = await freshDb()
  }, 60_000)

  it('seed: isti rezultat za sve projekte i sve učenike', async () => {
    const n = await compareAll(db)
    expect(n).toBeGreaterThan(0)
  })

  it('20 nasumičnih stanja: isti rezultat', async () => {
    const r = rng(42)
    const kinds: TagKind[] = ['znam', 'volim', 'ucim']
    let total = 0
    for (let round = 0; round < 20; round++) {
      await db.exec('begin')
      const s = await loadState(db)
      const students = s.profiles.filter((p) => p.role === 'student')
      // promijeni oznake nekim učenicima
      for (const u of students) {
        if (r() < 0.4) {
          await db.query('delete from profile_tags where profile_id = $1', [u.id])
          const n = 1 + Math.floor(r() * 4)
          for (let k = 0; k < n; k++) {
            const tag = TAGS[Math.floor(r() * TAGS.length)].slug
            await db.query('insert into profile_tags values ($1, $2, $3) on conflict do nothing', [u.id, tag, kinds[Math.floor(r() * 3)]])
          }
        }
      }
      // nasumični pozivi u posljednje 2 nedjelje (utiče na nedjeljni limit)
      const open = s.projects.filter((p) => p.status === 'open')
      for (let k = 0; k < 15; k++) {
        const u = students[Math.floor(r() * students.length)]
        const p = open[Math.floor(r() * open.length)]
        const days = r() * 14
        const st = ['pending', 'declined', 'accepted'][Math.floor(r() * 3)]
        await db.query(
          `insert into invites (project_id, profile_id, reason_tag, reason_kind, status, created_at)
           values ($1, $2, 'sport', 'volim', $3, $4::timestamptz - make_interval(secs => $5)) on conflict do nothing`,
          [p.id, u.id, st, NOW.toISOString(), Math.round(days * 86400)],
        )
      }
      // neko napusti grupu, neko uđe
      for (let k = 0; k < 4; k++) {
        const m = s.members[Math.floor(r() * s.members.length)]
        await db.query('update group_members set left_at = now() where project_id = $1 and profile_id = $2 and left_at is null and profile_id <> (select leader_id from projects where id = $1)', [m.project_id, m.profile_id])
          .catch(() => {})
        const u = students[Math.floor(r() * students.length)]
        const p = open[Math.floor(r() * open.length)]
        await db.query('insert into group_members (project_id, profile_id) values ($1, $2) on conflict do nothing', [p.id, u.id])
      }
      // nasumično promijeni broj mjesta
      for (const p of open) if (r() < 0.3) await db.query('update projects set spots = $2 where id = $1', [p.id, 1 + Math.floor(r() * 5)])
      total += await compareAll(db)
      await db.exec('rollback')
    }
    expect(total).toBeGreaterThan(100)
  }, 120_000)
})
