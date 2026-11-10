import { expect, type Page } from '@playwright/test'

export const PASS = 'demo1234'

/** Registracija: kod → nik → lozinka → oznake. */
export async function register(page: Page, code: string, nick: string, tags: string[], opts: { goto?: boolean } = {}) {
  if (opts.goto !== false) await page.goto('./#/registracija')
  await page.getByTestId('code').fill(code)
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByTestId('nick').fill(nick)
  await expect(page.getByText('Slobodno ✓')).toBeVisible()
  await page.getByRole('button', { name: 'Dalje' }).click()
  await page.getByTestId('password').fill(PASS)
  await page.getByRole('button', { name: 'Napravi nalog' }).click()
  if (tags.length) {
    // 'video:znam' → izaberi „Znam“ pa oznaku; bez vrste = „Volim“
    const tabs = { volim: 'Volim', znam: 'Znam', ucim: 'Želim da naučim' } as const
    for (const t of tags) {
      const [slug, kind = 'volim'] = t.split(':') as [string, keyof typeof tabs]
      await page.getByRole('tab', { name: tabs[kind] }).click()
      await page.getByTestId(`tag-${slug}`).click()
    }
    await page.getByTestId('save-tags').click()
  }
}

/** Zatvori eventualne pozive koji nisu dio scenarija („Ne sada“). */
export async function dismissInvitesExcept(page: Page, keepTitle?: string) {
  for (let i = 0; i < 3; i++) {
    const card = page.getByTestId('invite-card')
    if (!(await card.isVisible().catch(() => false))) {
      await page.waitForTimeout(1500)
      if (!(await card.isVisible().catch(() => false))) return
    }
    if (keepTitle && (await card.getByText(keepTitle).isVisible())) return
    await card.getByRole('button', { name: 'Ne sada' }).click()
    await expect(card).toBeHidden()
  }
}

export async function createProject(page: Page, title: string, goal: string, tags: string[]) {
  await page.goto('./#/')
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-title').fill(title)
  await page.getByTestId('np-goal').fill(goal)
  for (const t of tags) await page.getByTestId(`np-tag-${t}`).click()
  await page.getByTestId('np-submit').click()
  await expect(page.getByRole('heading', { name: 'Moji timovi' })).toBeVisible()
}

export async function metric0to1(page: Page) {
  return Number(await page.getByTestId('m-0to1').innerText())
}
