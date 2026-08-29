import { expect, test } from '@playwright/test';

// Pulado: `/despesas` exige login com Google (Auth.js v5 + allowlist), e este
// ambiente não consegue completar o OAuth interativo. Para habilitar,
// faça o login manualmente uma vez, salve a sessão com
// `npx playwright codegen --save-storage=e2e/.auth/nardy.json <url>` (ou
// `context.storageState({ path: ... })` depois de logar por `page`), aponte
// `use.storageState` (aqui ou por projeto, em `playwright.config.ts`) para
// esse arquivo e troque `test.skip` por `test` abaixo.
test.skip(
  'lanca uma compra parcelada e ela aparece nos meses seguintes',
  async ({ page }) => {
    await page.goto('/despesas?competencia=2026-08');

    await page.getByPlaceholder('Descrição').fill('fone bluetooth');
    await page.locator('input[name="dataCompra"]').fill('2026-08-01');
    await page.locator('input[name="numeroParcelas"]').fill('5');
    await page.getByPlaceholder('0,00').fill('327,87');
    await page.getByRole('button', { name: 'Adicionar' }).click();

    await expect(page.getByText('fone bluetooth')).toBeVisible();
    await expect(page.getByText('1/5')).toBeVisible();

    await page.goto('/despesas?competencia=2026-12');
    await expect(page.getByText('fone bluetooth')).toBeVisible();
    await expect(page.getByText('5/5')).toBeVisible();
  },
);
