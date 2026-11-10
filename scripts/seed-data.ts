// ─────────────────────────────────────────────────────────────
//  Seed podaci. SVI učenici su IZMIŠLJENI (samo nikovi).
//  Nakon izmjene: npm run gen:seed
// ─────────────────────────────────────────────────────────────
import { CLASSES } from '../src/config/school'
import type { TagKind } from '../src/lib/matching'

export interface SeedProfile { id: string; nick: string; class_id: string; tags: { tag: string; kind: TagKind }[] }
export interface SeedProject {
  id: string; title: string; goal: string; icon: string; spots: number; status: 'open' | 'done'
  leader_id: string; tags: string[]; created: number; approved: number; completed?: number
  deadline: number; result_text?: string
}
export interface SeedData {
  codes: { code: string; role: 'student' | 'mentor' | 'pedagog'; class_id: string | null }[]
  profiles: SeedProfile[]
  projects: SeedProject[]
  members: { project_id: string; profile_id: string; joined: number }[]
  wall: { project_id: string; author_id: string | null; kind: 'post' | 'system'; body: string; ago: number }[]
  firstGroupEvents: { profile_id: string; ago: number }[]
}
// Vrijeme: `created`, `approved`, `completed`, `joined`, `ago` = prije koliko DANA; `deadline` = za koliko dana.

const pid = (n: number) => `a0000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const prj = (n: number) => `b0000000-0000-4000-8000-${n.toString().padStart(12, '0')}`

// [nik, odjeljenje, oznake "slug:vrsta,…"]   vrsta: z = znam, v = volim, u = želim da naučim
const RAW: [string, string, string][] = [
  ['luna.k', '1-1', 'crtanje:z,fotografija:v'],
  ['marko_99', '1-1', 'sport:z,gaming:v'],
  ['tea.art', '1-2', 'crtanje:z,ples:v'],
  ['nikola7', '1-2', 'turizam:v,jezici:z'],
  ['sara.slatko', '1-3', 'poslasticarstvo:z,kuvanje:v'],
  ['vuk', '1-3', 'kuvanje:z,sport:v'],
  ['mia_mix', '1-4', 'barmen:z,muzika:v'],
  ['dejo', '1-4', 'barmen:v,sport:z'],
  ['ana.vodi', '2-2', 'turizam:z,jezici:z,fotografija:v'],
  ['bojan.b', '2-1', 'preduzetnistvo:z,programiranje:v'],
  ['lena', '2-1', 'pisanje:z,podcast:v'],
  ['stefan.ritam', '2-2', 'bubnjevi:v,muzika:z'],
  ['jana_torte', '2-3', 'poslasticarstvo:z,crtanje:v'],
  ['petar.chef', '2-3', 'kuvanje:z,preduzetnistvo:u'],
  ['iva.shake', '2-4', 'barmen:z,ples:v'],
  ['milos', '2-4', 'sport:z,muzika:u'],
  ['kaća', '3-1', 'preduzetnistvo:z,jezici:v'],
  ['dusan.foto', '3-1', 'fotografija:z,video:v'],
  ['eli.ples', '3-2', 'ples:z,muzika:v'],
  ['andrej.gg', '3-2', 'gaming:z,programiranje:z'],
  ['maja.mural', '3-3', 'crtanje:z,poslasticarstvo:v'],
  ['ognjen', '3-3', 'kuvanje:v,bubnjevi:u'],
  ['tamara', '3-4', 'barmen:z,jezici:v'],
  ['luka.bas', '3-4', 'muzika:z,sport:v'],
  ['mina.pise', '4-1', 'pisanje:z,podcast:z'],
  ['filip.cut', '4-1', 'video:z,fotografija:v'],
  ['nina', '4-2', 'turizam:z,ples:v'],
  ['relja', '4-2', 'sport:z,turizam:u'],
  ['zara', '4-3', 'poslasticarstvo:v,kuvanje:z'],
  ['bane.drums', '4-4', 'bubnjevi:z,muzika:v'],
  // ↓ trenutno nisu ni u jednoj grupi (~1/4)
  ['ena.crta', '1-1', 'crtanje:v,pisanje:u'],
  ['igor', '1-3', 'kuvanje:v,gaming:z'],
  ['sofija.en', '1-2', 'jezici:z,turizam:u'],
  ['dario', '2-4', 'barmen:v,sport:v'],
  ['kiki', '2-3', 'poslasticarstvo:v,fotografija:u'],
  ['lazar.beat', '3-4', 'bubnjevi:v,gaming:v'],
  ['hana', '3-2', 'ples:v,muzika:u'],
  ['teo', '4-3', 'programiranje:v,preduzetnistvo:u'],
  ['mila.m', '4-1', 'pisanje:v,crtanje:u'],
  ['pavle', '4-4', 'sport:v,kuvanje:u'],
]

const KIND: Record<string, TagKind> = { z: 'znam', v: 'volim', u: 'ucim' }
const profiles: SeedProfile[] = RAW.map(([nick, class_id, tags], i) => ({
  id: pid(i + 1),
  nick,
  class_id,
  tags: tags.split(',').map((t) => {
    const [tag, k] = t.split(':')
    return { tag, kind: KIND[k] }
  }),
}))
const P = (nick: string) => {
  const p = profiles.find((x) => x.nick === nick)
  if (!p) throw new Error('Nema nika ' + nick)
  return p.id
}

// Projekti u toku (nijedan ne traži video montažu: taj poziv u demonstraciji dolazi od podcasta).
const projects: SeedProject[] = [
  { id: prj(1), icon: '🧁', title: 'Ketering za školsku proslavu traži poslastičara', goal: 'Slatki sto za 150 gostiju na proslavi Dana škole.', spots: 3, status: 'open', leader_id: P('petar.chef'), tags: ['poslasticarstvo', 'kuvanje'], created: 9, approved: 8, deadline: 18 },
  { id: prj(2), icon: '🧭', title: 'Tura kroz Stari Bar traži vodiča na engleskom', goal: 'Šetnja za goste iz partnerske škole iz Italije.', spots: 2, status: 'open', leader_id: P('ana.vodi'), tags: ['turizam', 'jezici'], created: 8, approved: 7, deadline: 21 },
  { id: prj(3), icon: '🎨', title: 'Školski mural traži nekoga ko crta', goal: 'Mural na zidu kod sale: „Naša škola, naš sto“.', spots: 3, status: 'open', leader_id: P('maja.mural'), tags: ['crtanje'], created: 14, approved: 13, deadline: 14 },
  { id: prj(4), icon: '🥁', title: 'Bendu fali bubnjar', goal: 'Tri pjesme za školsku žurku na kraju polugodišta.', spots: 2, status: 'open', leader_id: P('luka.bas'), tags: ['bubnjevi', 'muzika'], created: 6, approved: 5, deadline: 30 },
  { id: prj(5), icon: '🍹', title: 'Bezalkoholni kokteli za Dan škole traže barmena', goal: 'Meni od pet mocktaila i posluženje za goste.', spots: 2, status: 'open', leader_id: P('tamara'), tags: ['barmen'], created: 5, approved: 4, deadline: 18 },
  { id: prj(6), icon: '🏐', title: 'Turnir u odbojci traži organizatore', goal: 'Međuodjeljenski turnir: raspored, sudije, medalje.', spots: 3, status: 'open', leader_id: P('relja'), tags: ['sport', 'preduzetnistvo'], created: 10, approved: 9, deadline: 25 },
  { id: prj(7), icon: '💼', title: 'Mini sajam učeničke zadruge traži prodavce', goal: 'Štand sa domaćim proizvodima i cjenovnikom na dva jezika.', spots: 3, status: 'open', leader_id: P('kaća'), tags: ['preduzetnistvo', 'jezici'], created: 7, approved: 6, deadline: 20 },
  { id: prj(8), icon: '📷', title: 'Foto-priča „Ljudi naše škole“ traži fotografa', goal: 'Deset portreta i kratkih priča za hodnik prvog sprata.', spots: 2, status: 'open', leader_id: P('lena'), tags: ['fotografija', 'pisanje'], created: 4, approved: 3, deadline: 28 },
  { id: prj(9), icon: '💃', title: 'Plesna tačka za maturu traži plesače', goal: 'Koreografija od tri minuta za maturski program.', spots: 4, status: 'open', leader_id: P('eli.ples'), tags: ['ples', 'muzika'], created: 3, approved: 2, deadline: 40 },
  // Završeni
  { id: prj(11), icon: '🎙️', title: 'Školski podcast: 1. epizoda je vani', goal: 'Prva epizoda o praksi u hotelima.', spots: 3, status: 'done', leader_id: P('mina.pise'), tags: ['podcast', 'video'], created: 40, approved: 39, completed: 6, deadline: -5, result_text: 'Snimili smo 25 minuta razgovora sa učenicima sa prakse u Budvi. Epizoda je na školskom sajtu!' },
  { id: prj(12), icon: '👩‍🍳', title: 'Kuvar za jedan dan: radionica za osnovce', goal: 'Radionica pravljenja palačinki za 30 osnovaca.', spots: 3, status: 'done', leader_id: P('zara'), tags: ['kuvanje', 'poslasticarstvo'], created: 35, approved: 34, completed: 10, deadline: -9, result_text: '30 osnovaca, 200 palačinki i nijedna izgorjela. Recepte smo podijelili roditeljima.' },
  { id: prj(13), icon: '🎮', title: 'Mini igra o istoriji škole', goal: 'Kviz-igra za Dan otvorenih vrata.', spots: 2, status: 'done', leader_id: P('andrej.gg'), tags: ['programiranje', 'gaming', 'pisanje'], created: 50, approved: 49, completed: 15, deadline: -14, result_text: 'Igru je na Danu otvorenih vrata odigralo 120 posjetilaca. Kod je otvoren za sljedeću generaciju.' },
  { id: prj(14), icon: '🎄', title: 'Novogodišnji štand učeničke zadruge', goal: 'Prodaja kolača i čestitki za humanitarnu akciju.', spots: 3, status: 'done', leader_id: P('bojan.b'), tags: ['preduzetnistvo', 'poslasticarstvo', 'crtanje'], created: 60, approved: 59, completed: 20, deadline: -19, result_text: 'Prikupili smo 640 € za opremu dječjeg odjeljenja bolnice.' },
]

// Članovi (vođa se dodaje automatski).
const extra: [number, string[]][] = [
  [1, ['sara.slatko', 'jana_torte']],
  [2, ['nikola7']],
  [3, ['tea.art', 'luna.k']],
  [4, ['stefan.ritam']],
  [5, ['mia_mix']],
  [6, ['marko_99', 'milos']],
  [7, ['dejo']],
  [8, ['dusan.foto']],
  [9, ['iva.shake', 'nina']],
  [11, ['filip.cut', 'lena']],
  [12, ['vuk', 'ognjen']],
  [13, ['andrej.gg']],
  [14, ['jana_torte', 'kaća', 'bane.drums']],
]
const members: SeedData['members'] = []
for (const p of projects) members.push({ project_id: p.id, profile_id: p.leader_id, joined: p.approved })
for (const [n, nicks] of extra) {
  const p = projects.find((x) => x.id === prj(n))!
  for (const nick of nicks) {
    const id = P(nick)
    if (!members.some((m) => m.project_id === p.id && m.profile_id === id))
      members.push({ project_id: p.id, profile_id: id, joined: Math.max(p.approved - 1, 0) })
  }
}

const wall: SeedData['wall'] = [
  { project_id: prj(3), author_id: null, kind: 'system', body: 'Projekat je odobren. Srećno, tim! 🚀', ago: 13 },
  { project_id: prj(3), author_id: P('maja.mural'), kind: 'post', body: 'Skica je odobrena! Boje stižu u petak.', ago: 6 },
  { project_id: prj(3), author_id: P('tea.art'), kind: 'post', body: 'Ja donosim šablone za sunce 🌞', ago: 2 },
  { project_id: prj(1), author_id: null, kind: 'system', body: 'Projekat je odobren. Srećno, tim! 🚀', ago: 8 },
  { project_id: prj(1), author_id: P('petar.chef'), kind: 'post', body: 'Probni dan u kuhinji: srijeda, 7. čas.', ago: 3 },
  { project_id: prj(2), author_id: P('ana.vodi'), kind: 'post', body: 'Ruta: Kapija → Akvadukt → Sahat-kula. Treba nam još neko za engleski!', ago: 4 },
  { project_id: prj(4), author_id: P('luka.bas'), kind: 'post', body: 'Proba u muzičkom kabinetu, petak poslije škole.', ago: 2 },
  { project_id: prj(11), author_id: null, kind: 'system', body: 'Projekat je završen! Rezultat je sada u feedu škole. 🎉', ago: 6 },
]

const firstGroupEvents = [
  { profile_id: P('tea.art'), ago: 12 },
  { profile_id: P('nikola7'), ago: 6 },
  { profile_id: P('dejo'), ago: 5 },
  { profile_id: P('dusan.foto'), ago: 2 },
  { profile_id: P('nina'), ago: 1 },
]

// ─── Pristupni kodovi ───────────────────────────────────────
// Deterministički (isti pri svakom generisanju).
let seed = 20261110
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const four = () => Array.from({ length: 4 }, () => ALPH[Math.floor(rnd() * ALPH.length)]).join('')

const codes: SeedData['codes'] = [
  // Lako pamtljivi kodovi za prezentaciju (vidi README):
  { code: 'CE-3B-7K2Q', role: 'student', class_id: '3-2' },
  { code: 'CE-2A-5M8P', role: 'student', class_id: '2-1' },
  { code: 'CE-MT-2026', role: 'mentor', class_id: null },
]
for (const c of CLASSES) for (let k = 0; k < 2; k++) codes.push({ code: `CE-${c.codePrefix}-${four()}`, role: 'student', class_id: c.id })
codes.push({ code: `CE-MT-${four()}`, role: 'mentor', class_id: null })
codes.push({ code: `CE-MT-${four()}`, role: 'mentor', class_id: null })
codes.push({ code: `CE-PG-${four()}`, role: 'pedagog', class_id: null })

export const SEED: SeedData = { codes, profiles, projects, members, wall, firstGroupEvents }
