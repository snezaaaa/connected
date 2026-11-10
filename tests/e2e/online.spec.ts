// Scenario za prezentaciju ONLINE: dva telefona (odvojeni browser konteksti) + mentor.
// Treba pravi Supabase projekat: E2E_SUPABASE_URL i E2E_SUPABASE_ANON_KEY.
// Mentor: E2E_MENTOR_NICK / E2E_MENTOR_PASS (podrazumijevano prof.e2e / demo1234, kod CE-MT-2026 pri prvom pokretanju).
import { expect, test, type Browser, type Page } from '@playwright/test'
import { PASS, createProject, dismissInvitesExcept, metric0to1, register } from './helpers'

const TITLE = 'Podcast traži montažera'
const MENTOR_NICK = process.env.E2E_MENTOR_NICK ?? 'prof.e2e'
const MENTOR_PASS = process.env.E2E_MENTOR_PASS ?? PASS

async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ ...test.info().project.use })
  return ctx.newPage()
}

async function mentorLogin(page: Page) {
  await page.goto('./#/prijava')
  await page.getByLabel('Nik').fill(MENTOR_NICK)
  await page.getByLabel('Lozinka').fill(MENTOR_PASS)
  await page.getByRole('button', { name: 'Prijavi se' }).click()
  const ok = await page.getByRole('heading', { name: 'Mentor' }).isVisible({ timeout: 8000 }).catch(() => false)
  if (!ok) {
    // Prvo pokretanje: mentorski nalog preko koda
    await page.goto('./#/registracija')
    await page.getByTestId('code').fill('CE-MT-2026')
    await page.getByRole('button', { name: 'Dalje' }).click()
    await page.getByTestId('nick').fill(MENTOR_NICK)
    await page.getByRole('button', { name: 'Dalje' }).click()
    await page.getByTestId('password').fill(MENTOR_PASS)
    await page.getByRole('button', { name: 'Napravi nalog' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Mentor' })).toBeVisible()
}

async function reset(page: Page) {
  await page.getByTestId('reset').click()
  await page.getByTestId('reset-confirm').click()
  await expect(page.getByText('Demo je vraćen na početak.')).toBeVisible()
}

test('online: dva telefona + mentor, uživo preko Realtime', async ({ browser }) => {
  const mentor = await phone(browser)
  await mentorLogin(mentor)
  await reset(mentor) // čisto stanje

  // Telefon 1: A
  const a = await phone(browser)
  await register(a, 'CE-3B-7K2Q', 'ucenicaA', ['podcast:znam', 'pisanje'])
  await dismissInvitesExcept(a)
  await createProject(a, TITLE, 'Druga epizoda školskog podcasta.', ['video', 'podcast'])

  // Mentor vidi projekat uživo (Realtime) i odobrava
  const pending = mentor.getByTestId('pending-project').filter({ hasText: TITLE })
  await expect(pending).toBeVisible()
  const before = await metric0to1(mentor)
  await pending.getByTestId('approve').click()
  await expect(pending).toBeHidden()

  // Telefon 2: B — poziv stiže odmah
  const b = await phone(browser)
  await register(b, 'CE-2A-5M8P', 'ucenicaB', ['video:znam'])
  const card = b.getByTestId('invite-card')
  await expect(card).toBeVisible()
  await expect(card.getByText(TITLE + '.')).toBeVisible()
  await expect(card.getByText(/Zašto ti: znaš · Video montaža/)).toBeVisible()
  await card.getByRole('button', { name: 'Pridružujem se' }).click()
  await expect(b.getByTestId('wall').getByText('ucenicaB se pridružio/la timu 🎉')).toBeVisible()

  // Telefon 1: A odmah vidi obavještenje (bez osvježavanja stranice)
  await expect(a.locator('.toast').getByText(/ucenicaB se pridružio\/la timu/)).toBeVisible()
  await expect(a.getByTestId('bell-dot')).toBeVisible()
  await a.goto('./#/timovi')
  await a.getByText(TITLE).click()
  await expect(a.getByTestId('wall').getByText('ucenicaB se pridružio/la timu 🎉')).toBeVisible()

  // Mentor: „0 → 1“ raste uživo
  await expect.poll(() => metric0to1(mentor)).toBeGreaterThan(before)

  // Reset: A i B se odjavljuju, kodovi su ponovo slobodni
  await reset(mentor)
  await expect(a.getByText('Imam pristupni kod')).toBeVisible({ timeout: 20_000 })
  await mentor.getByRole('button', { name: /Prikaži/ }).click()
  await expect(mentor.getByTestId('codes').getByText('CE-3B-7K2Q')).toBeVisible()
})
