# lancardespesas

Sistema web para o lançamento das despesas do casal, substituindo a planilha do Google Sheets
que hoje controla a fatura do cartão C6.

O objetivo é registrar despesas por pessoa e em conjunto, gerar as parcelas automaticamente,
calcular o rateio e o saldo entre as duas pessoas, conferir a fatura contra o extrato e emitir
relatórios que atravessem meses — coisas que uma aba por mês não consegue fazer.

## Situação

Em desenho. Nenhum código de aplicação ainda.

- **Documento de design:** [docs/superpowers/specs/2026-08-08-sistema-despesas-casal-design.md](docs/superpowers/specs/2026-08-08-sistema-despesas-casal-design.md)
- **Proposta visual, com os mockups:** https://claude.ai/code/artifact/542e24e6-fa0e-4d68-9f86-2d1c84db0c16

Uma decisão continua em aberto — o layout da tela do mês — junto de outras quatro perguntas
listadas na seção 11 do documento de design.

## Stack prevista

Next.js 15 e TypeScript, Postgres no Neon via Prisma, Auth.js com login Google restrito a uma
lista de e-mails, Tailwind e shadcn/ui, Vitest e Playwright nos testes, deploy na Vercel.

## Ambiente

Node.js 24 LTS e npm 11. Não há dependências instaladas ainda, porque o projeto ainda não foi
inicializado.

## Privacidade

Este repositório é privado e não deve receber dados financeiros reais. Exportações da planilha
e arquivos `.csv` estão no `.gitignore`.
