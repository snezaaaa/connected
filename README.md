<p align="center"><img src="public/logo.png" alt="ConnectEd" width="360"></p>

<p align="center"><b>Pronađi svoje ljude.</b><br>
Živi feed škole koji učenike spaja po interesovanjima i talentima u mješovite timove koji zajedno nešto naprave.</p>

<p align="center"><b>JU Srednja ekonomsko-ugostiteljska škola</b> · demo za srednjoškolski hakaton <b>OpenHack</b> (Savjet Evrope + NTP Crne Gore)</p>

> **Demo.** Škola je prava, ali su **svi učenici u bazi izmišljeni** (samo nikovi). Nema stvarnih podataka o učenicima, nema analitike ni praćenja.

**Aplikacija:** `https://<vaš-github-nalog>.github.io/connected/`

---

## Šta radi

Uključenost se dešava kroz ono što učenik **voli i zna**, a ne kroz etiketu.

1. **Profil:** pristupni kod → nik → lozinka → oznake (*volim / znam / želim da naučim*). Ukupno ispod 30 sekundi, bez imena i emaila.
2. **Feed:** projekti u toku, pozivi „traži se“ i završeni rezultati. Bez lajkova, pratilaca i rang-lista. Jedina akcija je „Pridruži se“.
3. **Lični poziv:** stiže uživo: „**Trebaš nam.** Podcast traži montažera.“ Razlog je uvijek talenat ili interesovanje. Dugmad su „Pridružujem se“ i „Ne sada“. „Ne sada“ nema posljedica i ne pita za razlog.
4. **Tim:** cilj, rok, članovi i grupni zid (vidi ga i mentor). Nema privatnih četova.
5. **Rezultat:** tim označi projekat kao završen, a rezultat vide svi u feedu.

Spajanje tiho daje prednost učenicima koji trenutno nisu ni u jednoj grupi. To pravilo se ne vidi u interfejsu ni u odgovorima API-ja.

## Arhitektura

| Dio | Tehnologija |
|---|---|
| Frontend | Vite + React + TypeScript, mobile-first, `HashRouter`, GitHub Pages |
| Podaci | Supabase: Postgres + Auth + Realtime + Row Level Security na **svim** tabelama |
| Pisanje | Isključivo kroz RPC funkcije (`security definer`) koje provjeravaju prava |
| Spajanje | Postgres funkcije u šemi `private` (nije izložena API-ju) + triggeri |
| Offline | Isti tok iz `localStorage` na jednom uređaju (`src/lib/matching.ts`), uz service worker |

```
supabase/migrations/   0001 šema · 0002 RLS · 0003 spajanje · 0004 RPC · 0005 realtime
supabase/seed.sql      izmišljeni učenici, projekti, kodovi (generisano)
supabase/setup.sql     sve gore u jednom fajlu, za SQL Editor (generisano)
src/config/school.ts   škola, smjerovi, odjeljenja, oznake  ← ovdje mijenjate
scripts/seed-data.ts   seed podaci                         ← ovdje mijenjate
src/lib/matching.ts    spajanje za offline (mora se slagati sa SQL-om)
tests/                 paritet SQL↔TS (PGlite), nik, Playwright e2e
```

### Spajanje (`supabase/migrations/0003_matching.sql`)

Za svaki otvoren projekat rangira učenike po:

- **poklapanju oznaka** sa potrebama projekta (glavni faktor; *znam* > *volim* > *želim da naučim*). Bez poklapanja nema poziva.
- **bonusu** ako učenik timu donosi novo odjeljenje ili razred.
- **prednosti** za učenike koji trenutno nisu ni u jednoj aktivnoj grupi. Uvijek je manja od jedne poklopljene oznake.
- **ograničenju** od najviše 2 nova poziva u 7 dana po učeniku.

Pokreće se triggerom kad učenik sačuva oznake (novi nalog), kad mentor odobri projekat i kad neko napusti grupu. Skor se nigdje ne upisuje u javne tabele.

`tests/matching.parity.test.ts` pokreće iste SQL migracije u PGlite-u (Postgres u Node-u) i provjerava da SQL i `matching.ts` daju identičan rezultat. Test pokriva seed i 20 nasumičnih stanja.

### Privatnost i RLS (`0002_rls.sql`)

- Niko, pa ni mentor, ne može dobiti spisak svih učenika, pa ni izvesti listu učenika bez grupe. Mentor vidi samo članove timova.
- Poziv vidi samo pozvani. Vođa ne zna ko je rekao „Ne sada“.
- „Treba mi pomoć“ čitaju samo mentor i pedagog.
- Mjerila su samo zbirni brojevi (`get_metrics`).
- Pristupni kod se troši atomski (`redeem_code`, zaključavanje reda). Iskorišćen kod se ne povezuje sa nalogom.
- Auth koristi sintetički email `nik@connected.demo`, bez pravog emaila.

---

## Postavljanje, korak po korak

### 1. Supabase projekat
1. Na [supabase.com](https://supabase.com) → **New project**. Ime `connected`, region **Central EU (Frankfurt)**, sačuvajte lozinku baze.
2. Sačekajte da se projekat podigne (1–2 min).

### 2. Baza: migracije i seed
1. U projektu otvorite **SQL Editor** → **New query**.
2. Zalijepite **cijeli** sadržaj fajla [`supabase/setup.sql`](supabase/setup.sql) i kliknite **Run**. Pokreće se jednom, na praznom projektu.
3. Provjera: **Table Editor** treba da prikaže tabele `profiles` (40 redova), `projects` i ostale.

> Koristite li Supabase CLI: `supabase link` pa `supabase db push`, zatim pokrenite `supabase/seed.sql`.

### 3. Auth: isključite potvrdu emaila
**Authentication → Sign In / Providers → Email**: isključite **Confirm email** i sačuvajte.

Na takmičenju su svi telefoni na istom WiFi-ju (ista IP adresa). Zato u **Authentication → Rate Limits** podignite „sign-ups and sign-ins“ (npr. na 100 / 5 min).

### 4. Ključevi u GitHub Secrets
1. U Supabase: **Project Settings → API Keys**. Kopirajte **Project URL** i **Publishable key** (ili *anon public* ključ).
   Ovaj ključ je javan po dizajnu: završava u aplikaciji, a podatke štiti RLS. **Nikad** ne koristite `service_role` / secret ključ.
2. U GitHub repou: **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = Publishable/anon ključ

### 5. GitHub Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions.** Svaki push na `main` pokreće testove, build i deploy. Link se pojavi u kartici **Actions** i u **Settings → Pages**.

> Ako se repo ne zove `connected`, workflow sam podesi putanju (`VITE_BASE`).

### Lokalno
```bash
npm install
cp .env.example .env.local   # upišite URL i ključ (bez njih radi offline)
npm run dev
```

---

## Demo nalozi

Pristupni kodovi su u seedu. Svaki važi **jednom**. Mentor vidi sve neiskorišćene kodove na ekranu **Mentor**.

| Kod | Za |
|---|---|
| `CE-3B-7K2Q` | Učenica A (III-2) |
| `CE-2A-5M8P` | Učenica B (II-1) |
| `CE-MT-2026` | Mentor (prvi mentorski nalog) |

Po dva koda postoje za svako od 16 odjeljenja, plus još dva mentorska i jedan za pedagoga.

---

## Scenario prezentacije (≈ 3 minuta)

**Priprema:** mentor (laptop ili telefon 3) je prijavljen i klikne **Resetuj demo**. Telefoni 1 i 2 imaju otvorenu aplikaciju na početnom ekranu.

1. **Telefon 1, učenica A:** „Imam pristupni kod“ → `CE-3B-7K2Q` → nik → lozinka → oznake: *Znam* → Podcast; *Volim* → Pisanje → **Sačuvaj profil**.
   Ako stigne neki drugi poziv, klikne „Ne sada“ (pokazuje da nema posljedica).
   **Pokreni projekat:** „Podcast traži montažera“, cilj, oznake *Video montaža* + *Podcast* → **Pošalji na odobrenje**.
2. **Laptop, mentor:** projekat se sam pojavi pod „Na odobrenju“ → **✓ Odobri**.
3. **Telefon 2, učenica B:** `CE-2A-5M8P` → nik → lozinka → *Znam* → **Video montaža** → Sačuvaj.
   **Poziv stiže odmah:** „Trebaš nam. Podcast traži montažera. Zašto ti: znaš · Video montaža“ → **Pridružujem se** 🎉
4. **Telefon 1:** A odmah dobije obavještenje „… se pridružio/la timu 🎉“, a B je na zidu tima.
   **Laptop:** mjerilo „prešlo sa 0 na 1 grupu“ poraste uživo.
5. **Resetuj demo** vraća sve za sljedeću probu: kodovi su ponovo slobodni, a nalozi A i B se brišu.

### Ako nema interneta: Offline demo
Na početnom ekranu (ili u Profilu) uključite **Offline demo**. Isti scenario radi na **jednom** uređaju, a ikonica ⇄ u zaglavlju je **Prebaci nalog**:
A napravi nalog i projekat → ⇄ **Profesorka** (mentor) → Odobri → ⇄ **Novi nalog** → B → poziv → ⇄ A.

Aplikacija se otvara i bez interneta ako je na tom uređaju **bar jednom otvorena online** (service worker). Prije takmičenja otvorite link na svakom uređaju.

---

## Testovi

```bash
npm test                    # paritet spajanja SQL ↔ TS (PGlite), nik, zabranjene riječi
npm run test:e2e:offline    # Playwright: cijeli scenario offline (jedan browser kontekst)
E2E_SUPABASE_URL=… E2E_SUPABASE_ANON_KEY=… npm run test:e2e:online
                            # Playwright: dva odvojena konteksta (A, B) + mentor, preko Realtime.
                            # Koristi pravi Supabase i na početku i kraju RESETUJE demo.
```

## Prilagođavanje
- **Smjerovi, odjeljenja, oznake:** `src/config/school.ts`. Nakon izmjene pokrenite `npm run gen:seed && npm run gen:setup`.
- **Izmišljeni učenici i projekti:** `scripts/seed-data.ts`, pa iste komande.
- **Težine spajanja:** `src/lib/matching.ts` **i** `0003_matching.sql`. Test pariteta pada ako se razlikuju.

## Napomene
- Za offline režim aplikacija sadrži `matching.ts`, pa je pravilo prednosti vidljivo u izvornom kodu (repo je ionako javan). U interfejsu i u API odgovorima se ne pojavljuje.
- „Treba mi pomoć“ je u ovoj verziji demonstracija. U pravoj školi signal bi išao školskom pedagogu.

Licenca: MIT
