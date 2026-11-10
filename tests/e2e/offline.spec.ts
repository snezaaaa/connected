// Scenario za prezentaciju u OFFLINE režimu: sve na jednom uređaju, uz „Prebaci nalog“.
import { expect, test, type Page } from '@playwright/test'
import { createProject, dismissInvitesExcept, metric0to1, register } from './helpers'

const TITLE = 'Podcast traži montažera'

async function switchTo(page: Page, nick: string) {
  await page.getByTestId('switch-account').click()
  await page.getByTestId('account-menu').getByRole('button', { name: new RegExp(nick) }).click()
}

test('offline: A pokreće projekat → mentor odobrava → B prihvata poziv → A vidi → reset', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('JU Srednja ekonomsko-ugostiteljska škola').first()).toBeVisible()
  await expect(page.getByText('Pronađi svoje ljude.')).toBeVisible()

  // 1. Učenica A: nalog + projekat
  await register(page, '3201', 'ucenicaA', ['podcast:znam', 'pisanje'])
  await dismissInvitesExcept(page)
  await createProject(page, TITLE, 'Druga epizoda školskog podcasta.', ['video', 'podcast'])
  await expect(page.getByText('Čeka mentora')).toBeVisible()

  // 2. Mentor odobrava
  await switchTo(page, 'Profesorka')
  await expect(page.getByRole('heading', { name: 'Mentor' })).toBeVisible()
  const before = await metric0to1(page)
  const pending = page.getByTestId('pending-project').filter({ hasText: TITLE })
  await pending.getByTestId('approve').click()
  await expect(pending).toBeHidden()

  // 3. Učenica B: novi nalog sa „video montaža“ → poziv stiže odmah → prihvata
  await page.getByTestId('switch-account').click()
  await page.getByRole('button', { name: /Novi nalog/ }).click()
  await expect(page.getByTestId('code')).toBeVisible()
  await register(page, '2101', 'ucenicaB', ['video:znam'], { goto: false })
  const card = page.getByTestId('invite-card')
  await expect(card).toBeVisible()
  await expect(card.getByText('Trebaš nam.')).toBeVisible()
  await expect(card.getByText(TITLE + '.')).toBeVisible()
  await expect(card.getByText(/Zašto ti: znaš · Video montaža/)).toBeVisible()
  await card.getByRole('button', { name: 'Pridružujem se' }).click()
  await expect(page.getByTestId('project-title')).toHaveText(TITLE)
  await expect(page.getByTestId('wall').getByText('ucenicaB se pridružio/la timu 🎉')).toBeVisible()

  // 4. A vidi obavještenje i B na zidu
  await switchTo(page, 'ucenicaA')
  await expect(page.getByTestId('bell-dot')).toBeVisible()
  await page.getByTestId('bell').click()
  await expect(page.getByText(`ucenicaB se pridružio/la timu „${TITLE}“ 🎉`)).toBeVisible()
  await page.getByText(`ucenicaB se pridružio/la timu „${TITLE}“ 🎉`).click()
  await expect(page.getByTestId('wall').getByText('ucenicaB se pridružio/la timu 🎉')).toBeVisible()
  await expect(page.getByTestId('members').getByText('ucenicaB')).toBeVisible()

  // „0 → 1“ je porastao
  await switchTo(page, 'Profesorka')
  await expect.poll(() => metric0to1(page)).toBeGreaterThan(before)

  // 5. Reset vraća sve
  await page.getByTestId('reset').click()
  await page.getByTestId('reset-confirm').click()
  await expect(page.getByText('Demo je vraćen na početak.')).toBeVisible()
  await expect(page.getByTestId('pending-project')).toHaveCount(0)
  await page.getByRole('button', { name: /Prikaži/ }).click()
  await expect(page.getByTestId('codes').getByText('3201', { exact: true })).toBeVisible()
  await expect(page.getByTestId('codes').getByText('2101', { exact: true })).toBeVisible()
  await expect.poll(() => metric0to1(page)).toBe(5)
})

test('offline: „Treba mi pomoć“ vidi samo mentor; pravila jezika', async ({ page }) => {
  await register(page, '3201', 'ucenica.c', ['crtanje'])
  await dismissInvitesExcept(page)
  await page.getByTestId('help-btn').click()
  await page.getByTestId('help-sheet').getByRole('button', { name: 'Pošalji diskretno' }).click()
  await expect(page.getByText('Poslato. 💜')).toBeVisible()
  await page.getByRole('button', { name: 'U redu' }).click()
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const bad of ['sam si', 'isključen', 'usamljen']) expect(text).not.toContain(bad)
  await page.getByTestId('switch-account').click()
  await page.getByTestId('account-menu').getByRole('button', { name: /Profesorka/ }).click()
  await expect(page.getByTestId('help-signal').getByText('ucenica.c')).toBeVisible()
})
