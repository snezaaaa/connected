// Spaja sve migracije + seed u jedan fajl za Supabase SQL Editor:
//   npm run gen:setup   →   supabase/setup.sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = new URL('../supabase/migrations/', import.meta.url)
const parts = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => `-- >>> migrations/${f}\n` + readFileSync(new URL(f, dir), 'utf8'))
parts.push('-- >>> seed.sql\n' + readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8'))
writeFileSync(
  new URL('../supabase/setup.sql', import.meta.url),
  '-- ConnectEd: sve migracije + seed u jednom fajlu (GENERISANO: npm run gen:setup).\n' +
    '-- Zalijepite cijeli sadržaj u Supabase → SQL Editor → Run. Pokreće se JEDNOM na praznom projektu.\n\n' +
    parts.join('\n\n'),
)
console.log('supabase/setup.sql spreman')
