import { defineConfig } from '@playwright/test';

/**
 * Configuração mínima para os testes de fluxo em `e2e/`.
 *
 * Não há `webServer` aqui de propósito: os testes que hoje dependem de sessão
 * autenticada estão marcados com `test.skip`, então não há necessidade de
 * subir o `next dev` (que exigiria banco configurado) só para pular testes.
 * Quando algum teste for habilitado com `storageState`, adicione o
 * `webServer` apontando para `npm run dev` e ajuste a `baseURL` se preciso.
 */
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
});
