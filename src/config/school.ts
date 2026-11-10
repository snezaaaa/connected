// ─────────────────────────────────────────────────────────────
//  Konfiguracija škole. Ovdje mijenjajte smjerove, odjeljenja
//  i oznake. Nakon izmjene pokrenite:  npm run gen:seed
//  (regeneriše supabase/seed.sql i offline seed).
// ─────────────────────────────────────────────────────────────

export const SCHOOL = {
  name: 'JU Srednja ekonomsko-ugostiteljska škola',
  app: 'ConnectEd',
  slogan: 'Pronađi svoje ljude.',
}

/** Smjerovi. `letter` ide u pristupni kod (npr. CE-3B-…), `index` u oznaku odjeljenja (III-2). */
export const SMJEROVI = [
  { id: 'et', letter: 'A', index: 1, naziv: 'Ekonomski tehničar' },
  { id: 'tt', letter: 'B', index: 2, naziv: 'Turistički tehničar' },
  { id: 'ku', letter: 'C', index: 3, naziv: 'Kuvar' },
  { id: 'ko', letter: 'D', index: 4, naziv: 'Konobar' },
] as const

export const RAZREDI = [1, 2, 3, 4] as const

const RIMSKI = ['', 'I', 'II', 'III', 'IV']

export interface SchoolClass {
  id: string // npr. "3-2"
  razred: number
  smjer: string
  label: string // npr. "III-2"
  codePrefix: string // npr. "3B"
}

export const CLASSES: SchoolClass[] = RAZREDI.flatMap((r) =>
  SMJEROVI.map((s) => ({
    id: `${r}-${s.index}`,
    razred: r,
    smjer: s.naziv,
    label: `${RIMSKI[r]}-${s.index}`,
    codePrefix: `${r}${s.letter}`,
  })),
)

export const TAGS = [
  { slug: 'kuvanje', label: 'Kuvanje', icon: '🍳' },
  { slug: 'poslasticarstvo', label: 'Poslastičarstvo', icon: '🧁' },
  { slug: 'barmen', label: 'Barmen i posluženje', icon: '🍹' },
  { slug: 'turizam', label: 'Turizam i vođenje tura', icon: '🧭' },
  { slug: 'jezici', label: 'Strani jezici', icon: '🗣️' },
  { slug: 'preduzetnistvo', label: 'Preduzetništvo', icon: '💼' },
  { slug: 'crtanje', label: 'Crtanje i dizajn', icon: '🎨' },
  { slug: 'fotografija', label: 'Fotografija', icon: '📷' },
  { slug: 'video', label: 'Video montaža', icon: '🎬' },
  { slug: 'muzika', label: 'Muzika', icon: '🎵' },
  { slug: 'bubnjevi', label: 'Bubnjevi', icon: '🥁' },
  { slug: 'ples', label: 'Ples', icon: '💃' },
  { slug: 'sport', label: 'Sport', icon: '⚽' },
  { slug: 'pisanje', label: 'Pisanje', icon: '✍️' },
  { slug: 'podcast', label: 'Podcast', icon: '🎙️' },
  { slug: 'programiranje', label: 'Programiranje', icon: '💻' },
  { slug: 'gaming', label: 'Gaming', icon: '🎮' },
] as const

export type TagSlug = (typeof TAGS)[number]['slug']
export const TAG_BY_SLUG: Record<string, (typeof TAGS)[number]> = Object.fromEntries(
  TAGS.map((t) => [t.slug, t]),
)

export const classLabel = (id: string | null | undefined) =>
  CLASSES.find((c) => c.id === id)?.label ?? ''
