# lancardespesas

Sistema web para o lançamento das despesas do casal, substituindo a planilha do Google Sheets
que hoje controla a fatura do cartão C6.

Registra despesas por pessoa e em conjunto, gera as parcelas automaticamente, calcula o
rateio, confere a fatura contra o extrato e responde perguntas que atravessam meses — coisas
que uma aba por mês não consegue fazer.

## Situação

Fase 1 em execução, na branch `fase-1`. O domínio de cálculo está pronto e testado; faltam
autenticação, gravação e as telas.

| Documento | Para quê |
|---|---|
| [docs/estado.md](docs/estado.md) | **Comece aqui.** Onde paramos, o que funciona, como retomar |
| [docs/decisoes.md](docs/decisoes.md) | Escolhas técnicas que parecem melhoráveis e não são |
| [docs/plans/fase-1/](docs/plans/fase-1/README.md) | O plano de execução, uma etapa por arquivo |
| [docs/specs/](docs/specs/2026-08-08-sistema-despesas-casal-design.md) | O design: modelo, arquitetura, fases |
| [docs/regras-de-negocio.md](docs/regras-de-negocio.md) | Comportamento detalhado e casos de borda |
| [docs/arquitetura.md](docs/arquitetura.md) | Onde cada coisa mora no código, camada por camada |
| [CLAUDE.md](CLAUDE.md) | Orientação para sessões do Claude Code |

Os mockups da proposta original estão publicados em
[claude.ai/code/artifact/542e24e6](https://claude.ai/code/artifact/542e24e6-fa0e-4d68-9f86-2d1c84db0c16)
— refletem a primeira versão do desenho; o que mudou depois está na seção 12 da spec.

## Rodando

```bash
npm install
npm test
```

Os testes de domínio não precisam de banco nem de rede. Para subir a aplicação é preciso um
`.env` na raiz, a partir do [`.env.example`](.env.example), com a conexão do Neon e as
credenciais do Google.

## Stack

Next.js 16 App Router, TypeScript estrito, React 19, Postgres no Neon via Prisma 6, Auth.js v5
com Google e allowlist de dois e-mails, Tailwind 4, Vitest no domínio e Playwright nos fluxos
críticos, deploy previsto na Vercel.

## Privacidade

Repositório privado, e não deve receber dados financeiros reais. Exportações da planilha,
arquivos `.csv` e todo `.env` estão no `.gitignore`.
