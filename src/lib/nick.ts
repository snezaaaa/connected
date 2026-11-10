// Validacija nika. Ista pravila važe u SQL-u (private.nick_problem u 0001_schema.sql).

/** Riječi koje nik ne smije sadržati (provjera nad normalizovanim nikom). */
export const BLOCKED_WORDS = [
  'kurac', 'kurc', 'picka', 'pizda', 'jeb', 'govno', 'sranje', 'kurva', 'peder',
  'drolj', 'smrad', 'debil', 'kreten', 'retard', 'idiot', 'mrtav', 'ubij', 'nazi', 'hitler',
  'fuck', 'shit', 'bitch', 'dick', 'cock', 'pussy', 'porn', 'sex', 'seks', 'nigg',
  'admin', 'moderator', 'mentor', 'pedagog', 'connected', 'skola',
]

const MAP: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' }

/** Nik → ASCII oblik (za email i jedinstvenost). */
export function normalizeNick(nick: string): string {
  return nick
    .trim()
    .toLowerCase()
    .replace(/[čćšžđ]/g, (c) => MAP[c])
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a' }

export function nickProblem(nick: string): string | null {
  const n = nick.trim()
  if (n.length < 3) return 'Nik treba da ima bar 3 znaka.'
  if (n.length > 20) return 'Nik može imati najviše 20 znakova.'
  if (!/^[A-Za-z0-9čćšžđČĆŠŽĐ._-]+$/.test(n))
    return 'Koristi slova, brojeve, tačku, crticu ili donju crtu.'
  const flat = normalizeNick(n)
    .replace(/[0-9@]/g, (c) => LEET[c] ?? c)
    .replace(/[._-]/g, '')
  if (BLOCKED_WORDS.some((w) => flat.includes(w))) return 'Taj nik nije dozvoljen. Probaj drugi.'
  return null
}

export const AUTH_EMAIL_DOMAIN =
  (import.meta as { env?: Record<string, string> }).env?.VITE_AUTH_EMAIL_DOMAIN || 'connected.demo'

export const nickToEmail = (nick: string) => `${normalizeNick(nick)}@${AUTH_EMAIL_DOMAIN}`
