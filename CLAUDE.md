# CLAUDE.md

Orientação para sessões novas. Leia isto antes de propor qualquer coisa.

## O que é

Sistema web para Nardy e Nick lançarem as despesas do casal, substituindo uma planilha do
Google Sheets com uma aba por mês. Duas pessoas, uso privado, desktop-first.

**Estado atual: design fechado, nenhum código de aplicação escrito.** O próximo passo é o
plano de implementação da Fase 1.

## Onde está cada coisa

| Documento | Para quê |
|---|---|
| [`docs/specs/2026-08-08-sistema-despesas-casal-design.md`](docs/specs/2026-08-08-sistema-despesas-casal-design.md) | Design: modelo, arquitetura, fases, e o histórico de revisão |
| [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md) | Comportamento detalhado e casos de borda |

A spec é a fonte da verdade para **o que** o sistema é. As regras de negócio são a fonte da
verdade para **como ele se comporta**. Divergiu, a spec vence e as regras se ajustam.

## Vocabulário do domínio

Termos em português, usados tanto na conversa quanto no código. Não traduza.

- **Competência** — o mês ao qual um lançamento pertence, no formato `AAAA-MM`. Para cartão é
  o mês do vencimento da fatura; para conta externa é o mês do pagamento.
- **Conta** — de onde saiu o dinheiro. Tipo `CARTAO` (tem fechamento, vencimento e fatura) ou
  `EXTERNA` (pix, débito, boleto, dinheiro; sem fatura).
- **Escopo** — de quem é o gasto: `PESSOAL` (Nardy ou Nick) ou `CONJUNTO`.
- **Rateio** — a divisão de um lançamento de escopo `CONJUNTO`, 50/50 por padrão.
- **Lançamento** — a compra ou despesa registrada, uma vez.
- **Parcela** — a fração de um lançamento que cai numa competência. Lançamento à vista tem
  uma parcela. É a parcela que aparece na grade do mês, nunca o lançamento.
- **Fatura** — a soma das parcelas de uma conta de cartão numa competência, conferida contra
  o valor real do extrato.
- **Reembolso** — lançamento que alguém de fora vai devolver. Está na fatura, mas fora dos
  relatórios de gasto do casal.

## Invariantes

Quebrar qualquer um destes é bug, não escolha de estilo.

1. **Dinheiro é inteiro em centavos.** Nenhum `float` em nenhuma camada, nunca.
2. **Datas são `date` sem hora**, timezone fixo `America/Sao_Paulo`.
3. **As regras de cálculo moram em `src/domain/`, como funções puras sem I/O.** Nada de
   Prisma, `fetch` ou `Date.now()` ali dentro. É o que torna cada caso de borda testável em
   milissegundos.
4. **A soma das parcelas é igual ao valor do lançamento**, e a soma das cotas de rateio é
   igual ao valor da parcela. O resto de centavos tem destino definido, nunca é descartado.
5. **Fatura travada é somente-leitura.** Destravar é ação explícita e auditada.
6. **Nada é apagado de verdade** — `deletadoEm`, com restauração pela lixeira.
7. **Toda gravação de lançamento passa por lock otimista** (`WHERE versao = ?`). São duas
   pessoas mexendo no mesmo mês; sobrescrita silenciosa é o pior bug possível aqui.

## Convenções

- **Idioma.** Vocabulário de domínio em português nos identificadores, sem acento
  (`competencia`, `rateio`, `lancamento`, `fatura`). Termos técnicos em inglês
  (`repository`, `handler`, `schema`). Comentários, commits e documentação em português.
- **Nunca commitar sem consultar o usuário.** Ele revisa o que entra em cada commit. Prepare
  as alterações, descreva o que mudou e qual seria a mensagem, e espere a autorização. Vale
  também para `push`, `--amend`, branch e PR. Editar arquivo e deixar sem commit está liberado.
- **Commits** em português, no imperativo, explicando o porquê e não o quê.
- **Testes** com Vitest no domínio, cobrindo os casos de borda de
  [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md). Playwright só nos fluxos críticos.
- **Nunca** commitar dado financeiro real: `.csv` e `/dados-privados/` estão no `.gitignore`.

## Stack

Next.js 15 App Router, TypeScript estrito, Postgres no Neon via Prisma, Auth.js v5 com Google
e allowlist fixa de dois e-mails, Tailwind e shadcn/ui, TanStack Table na grade, Recharts nos
gráficos, deploy na Vercel. Tema claro e escuro.

## Fora de escopo

Foram avaliados e descartados. **Não reintroduza sem o usuário pedir**, mesmo que pareçam
melhorias óbvias:

dívidas e acertos entre Nardy e Nick · etiquetas livres · convite de colaborador e
permissões · integração bancária · orçamento e metas · receitas e saldo de contas · anexo de
comprovante · importação de CSV/OFX da fatura · lançamento por texto livre · app nativo ·
multi-moeda

## Dados de referência

O apêndice da spec traz os números reais de agosto. **Use-os como fixture nos testes de
cálculo** — se os totais do sistema não reproduzirem `R$ 1.025,51` de fatura, `R$ 474,25` e
`R$ 551,26` de total geral, o cálculo está errado.

## Ambiente

Node 24.19 e npm 11.17 instalados; git 2.55; GitHub CLI 2.97 autenticado como `marcoshocampos`.
Repositório privado. Neon, Vercel e as credenciais OAuth do Google ainda não existem — são do
usuário criar, não faça no lugar dele.

Nesta máquina, `git` não está no PATH do PowerShell (só no Git Bash). Use a ferramenta Bash
para git, ou recarregue o PATH da máquina antes.
