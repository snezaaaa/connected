// Tekstovi na crnogorskom (latinica, ijekavica). Tople, kratke rečenice.
// Nikad: „sam si“, „isključen“, „usamljen“.
import type { TagKind } from '../lib/matching'
import { TAG_BY_SLUG } from '../config/school'

export const KIND_LABEL: Record<TagKind, string> = { volim: 'Volim', znam: 'Znam', ucim: 'Želim da naučim' }
export const KIND_SHORT: Record<TagKind, string> = { volim: 'voliš', znam: 'znaš', ucim: 'želiš da naučiš' }

export const tagLabel = (slug: string) => TAG_BY_SLUG[slug]?.label ?? slug
export const tagIcon = (slug: string) => TAG_BY_SLUG[slug]?.icon ?? '✨'

/** „Zašto ti: znaš · Video montaža“ — razlog je uvijek talenat ili interesovanje. */
export const inviteReason = (tag: string, kind: TagKind) => `${KIND_SHORT[kind]} · ${tagLabel(tag)}`

export const STATUS_LABEL = {
  pending: 'Čeka odobrenje',
  open: 'U toku',
  done: 'Urađeno',
  rejected: 'Nije odobreno',
} as const

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']
export function fmtDate(d: string | null): string {
  if (!d) return 'bez roka'
  const x = new Date(d.length === 10 ? d + 'T12:00:00' : d)
  return `${x.getDate()}. ${MONTHS[x.getMonth()]}`
}
export function fmtAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'upravo sada'
  if (s < 3600) return `prije ${Math.floor(s / 60)} min`
  if (s < 86400) return `prije ${Math.floor(s / 3600)} h`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'juče' : `prije ${d} dana`
}
