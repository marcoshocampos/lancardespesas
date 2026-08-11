# lancardespesas

Sistema web para o lançamento das despesas do casal, substituindo a planilha do Google Sheets
que hoje controla a fatura do cartão C6.

O objetivo é registrar despesas por pessoa e em conjunto, gerar as parcelas automaticamente,
calcular o rateio e o saldo entre as duas pessoas, conferir a fatura contra o extrato e emitir
relatórios que atravessem meses — coisas que uma aba por mês não consegue fazer.

## Situação

Design fechado, sem questões em aberto. Nenhum código de aplicação ainda.

- **Documento de design:** [docs/specs/2026-08-08-sistema-despesas-casal-design.md](docs/specs/2026-08-08-sistema-despesas-casal-design.md)
- **Regras de negócio e casos de borda:** [docs/regras-de-negocio.md](docs/regras-de-negocio.md)
- **Orientação para o Claude Code:** [CLAUDE.md](CLAUDE.md)
- **Proposta visual, com os mockups:** https://claude.ai/code/artifact/542e24e6-fa0e-4d68-9f86-2d1c84db0c16
  (reflete a primeira versão do desenho; ver o histórico de revisão na seção 12 da spec)

O próximo passo é o plano de implementação da Fase 1.

## Stack prevista

Next.js 15 e TypeScript, Postgres no Neon via Prisma, Auth.js com login Google restrito a uma
lista de e-mails, Tailwind e shadcn/ui, Vitest e Playwright nos testes, deploy na Vercel.

## Ambiente

Node.js 24 LTS e npm 11. Não há dependências instaladas ainda, porque o projeto ainda não foi
inicializado.

## Privacidade

Este repositório é privado e não deve receber dados financeiros reais. Exportações da planilha
e arquivos `.csv` estão no `.gitignore`.
