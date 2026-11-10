// Generiše supabase/seed.sql i src/data/seed.generated.ts iz istog izvora.
//   npm run gen:seed
import { writeFileSync } from 'node:fs'
import { CLASSES, TAGS } from '../src/config/school'
import { SEED } from './seed-data'

const q = (s: string | null | undefined) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`)
const ago = (d: number) => `now() - interval '${d} days'`
const lines: string[] = []
const L = (s: string) => lines.push(s)

L('-- ═════════════════════════════════════════════════════════════')
L('--  ConnectEd · seed (GENERISANO: npm run gen:seed — ne mijenjati ručno)')
L('--  Svi učenici su izmišljeni. private.load_seed() poziva i reset_demo().')
L('-- ═════════════════════════════════════════════════════════════')
L('')
L('create or replace function private.load_seed()')
L("returns void language plpgsql security definer set search_path = '' as $seed$")
L('begin')
L('  insert into public.classes (id, razred, smjer, label) values')
L(CLASSES.map((c) => `    (${q(c.id)}, ${c.razred}, ${q(c.smjer)}, ${q(c.label)})`).join(',\n'))
L('  on conflict (id) do update set razred = excluded.razred, smjer = excluded.smjer, label = excluded.label;')
L('')
L('  insert into public.tags (slug, label, icon, sort) values')
L(TAGS.map((t, i) => `    (${q(t.slug)}, ${q(t.label)}, ${q(t.icon)}, ${i})`).join(',\n'))
L('  on conflict (slug) do update set label = excluded.label, icon = excluded.icon, sort = excluded.sort;')
L('')
L('  insert into public.access_codes (code, role, class_id) values')
L(SEED.codes.map((c) => `    (${q(c.code)}, ${q(c.role)}, ${q(c.class_id)})`).join(',\n'))
L('  on conflict (code) do nothing;')
L('')
L('  insert into public.profiles (id, nick, nick_norm, role, class_id, onboarded, is_seed, created_at) values')
L(SEED.profiles.map((p) => `    (${q(p.id)}, ${q(p.nick)}, private.normalize_nick(${q(p.nick)}), 'student', ${q(p.class_id)}, true, true, ${ago(70)})`).join(',\n'))
L('  on conflict (id) do nothing;')
L('')
L('  insert into public.profile_tags (profile_id, tag, kind) values')
L(SEED.profiles.flatMap((p) => p.tags.map((t) => `    (${q(p.id)}, ${q(t.tag)}, ${q(t.kind)})`)).join(',\n'))
L('  on conflict do nothing;')
L('')
L('  insert into public.projects (id, title, goal, icon, spots, status, leader_id, created_at, approved_at, completed_at, deadline, result_text) values')
L(SEED.projects.map((p) => `    (${q(p.id)}, ${q(p.title)}, ${q(p.goal)}, ${q(p.icon)}, ${p.spots}, ${q(p.status)}, ${q(p.leader_id)}, ${ago(p.created)}, ${ago(p.approved)}, ${p.completed != null ? ago(p.completed) : 'null'}, current_date + ${p.deadline}, ${q(p.result_text)})`).join(',\n'))
L('  on conflict (id) do nothing;')
L('')
L('  insert into public.project_tags (project_id, tag) values')
L(SEED.projects.flatMap((p) => p.tags.map((t) => `    (${q(p.id)}, ${q(t)})`)).join(',\n'))
L('  on conflict do nothing;')
L('')
L('  insert into public.group_members (project_id, profile_id, joined_at) values')
L(SEED.members.map((m) => `    (${q(m.project_id)}, ${q(m.profile_id)}, ${ago(m.joined)})`).join(',\n'))
L('  on conflict do nothing;')
L('')
L('  insert into public.wall_posts (project_id, author_id, kind, body, created_at) values')
L(SEED.wall.map((w) => `    (${q(w.project_id)}, ${q(w.author_id)}, ${q(w.kind)}, ${q(w.body)}, ${ago(w.ago)})`).join(',\n'))
L(';')
L('')
L('  insert into private.first_group_events (profile_id, at) values')
L(SEED.firstGroupEvents.map((e) => `    (${q(e.profile_id)}, ${ago(e.ago)})`).join(',\n'))
L(';')
L('end $seed$;')
L('')
L('revoke all on function private.load_seed() from public, anon, authenticated;')
L('')
L('select private.load_seed();')

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), lines.join('\n') + '\n')
writeFileSync(
  new URL('../src/data/seed.generated.ts', import.meta.url),
  '// GENERISANO: npm run gen:seed — ne mijenjati ručno.\n' +
    "import type { SeedData } from '../../scripts/seed-data'\n" +
    `export const SEED: SeedData = ${JSON.stringify(SEED, null, 1)}\n`,
)
const grouped = new Set(SEED.members.map((m) => m.profile_id))
console.log(
  `seed: ${SEED.profiles.length} učenika (${SEED.profiles.length - grouped.size} bez grupe), ` +
    `${SEED.projects.length} projekata, ${SEED.codes.length} kodova`,
)
