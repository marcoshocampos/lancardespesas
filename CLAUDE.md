# CLAUDE.md

Orientação para sessões novas. Leia isto antes de propor qualquer coisa.

## O que é

Sistema web para Nardy e Nick lançarem as despesas do casal, substituindo uma planilha do
Google Sheets com uma aba por mês. Duas pessoas, uso privado, desktop-first.

**Estado atual em [`docs/estado.md`](docs/estado.md). Leia primeiro** — é o arquivo que diz
onde paramos, o que já funciona e qual é a próxima tarefa.

## Onde está cada coisa

| Documento | Para quê |
|---|---|
| [`docs/estado.md`](docs/estado.md) | Onde paramos, o que funciona, o que falta, como retomar |
| [`docs/decisoes.md`](docs/decisoes.md) | Escolhas técnicas que parecem melhoráveis e não são |
| [`docs/specs/2026-08-08-sistema-despesas-casal-design.md`](docs/specs/2026-08-08-sistema-despesas-casal-design.md) | Design: modelo, arquitetura, fases, e o histórico de revisão |
| [`docs/specs/2026-09-07-redesenho-visual-e-navegacao-design.md`](docs/specs/2026-09-07-redesenho-visual-e-navegacao-design.md) | Design da camada visual: navegação, telas, tokens, e o que ficou de fora |
| [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md) | Comportamento detalhado e casos de borda |
| [`docs/arquitetura.md`](docs/arquitetura.md) | Onde cada coisa mora no código, camada por camada, e as armadilhas já conhecidas |
| [`docs/verificacao-visual.md`](docs/verificacao-visual.md) | O roteiro da conferência tela a tela, que só o usuário consegue fazer |
| [`docs/plans/fase-1/`](docs/plans/fase-1/README.md) | O plano de execução da Fase 1, uma etapa por arquivo |

A spec é a fonte da verdade para **o que** o sistema é. As regras de negócio são a fonte da
verdade para **como ele se comporta**. Divergiu, a spec vence e as regras se ajustam.

**Antes de mudar qualquer escolha estrutural, leia [`docs/decisoes.md`](docs/decisoes.md).**
Datas como `String`, Prisma fixado no 6, segredos em `.env` e não em `.env.local`, a sobra de
centavos indo sempre para o mesmo membro — todas têm motivo, e todas já foram quase desfeitas
por alguém achando que estava melhorando.

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
  **Exceção:** durante a execução de um plano, em branch de trabalho, os subagentes commitam
  livremente — a revisão compara faixas de commit. A consulta continua obrigatória para
  `main` e para qualquer `push`; o commit que o usuário revisa é o merge.
- **Commits** em português, no imperativo, explicando o porquê e não o quê.
- **Testes** com Vitest no domínio, cobrindo os casos de borda de
  [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md). Playwright só nos fluxos críticos.
- **Nunca** commitar dado financeiro real: `.csv` e `/dados-privados/` estão no `.gitignore`.

## Stack

Next.js 16 App Router, TypeScript estrito, Postgres no Neon via Prisma 6, Auth.js v5 com Google
e allowlist fixa de dois e-mails, Tailwind e shadcn/ui, TanStack Table na grade, Recharts nos
gráficos, deploy na Vercel. Tema claro e escuro.

## Fora de escopo

Foram avaliados e descartados. **Não reintroduza sem o usuário pedir**, mesmo que pareçam
melhorias óbvias:

dívidas e acertos entre Nardy e Nick · etiquetas livres · convite de colaborador e
permissões · integração bancária · orçamento e metas · receitas e saldo de contas · anexo de
comprovante · importação de CSV/OFX da fatura · lançamento por texto livre · app nativo ·
multi-moeda

**Neon Auth fica desativado.** A autenticação é Auth.js v5 com Google e allowlist fixa de dois
e-mails, com sessão em JWT — sem tabela de auth no banco. O Neon Auth resolve cadastro,
senha, organizações e administração de usuários, nada disso existe aqui, e ligá-lo criaria um
segundo dono da identidade e um schema `neon_auth` no meio das migrations do Prisma.

## Dados de referência

A fixture dos testes de cálculo é [`src/domain/fixtures/mes-de-referencia.ts`](src/domain/fixtures/mes-de-referencia.ts),
e os números dela são **inventados** — o repositório não recebe dado financeiro, nem como
fixture. Ela exercita o que importa: pessoal de cada um, conjunto de valor ímpar para a sobra
de centavos aparecer, e uma despesa fora do cartão.

**A conferência contra a planilha real é feita na tela, não em teste**, pelo roteiro em
[`docs/verificacao-visual.md`](docs/verificacao-visual.md). Se o `Somado` da coluna do cartão
não bater com a linha `FATURA:` da planilha, o cálculo está errado — mas o número que prova
isso mora na planilha do casal, e não aqui.

## Ambiente

Node 24.19 e npm 11.17 instalados; git 2.55; GitHub CLI 2.97 autenticado como `marcoshocampos`.
Repositório privado.

Neon e as credenciais OAuth do Google **já existem e estão configurados**; a Vercel ainda não,
e só é necessária para publicar. Segredos ficam em `.env` na raiz, a partir do `.env.example`
— **`.env`, e não `.env.local`**, porque o CLI do Prisma lê o primeiro e não lê o segundo.
Nunca peça um segredo em conversa nem o escreva em arquivo versionado. Conta em serviço
externo é o usuário que cria, não faça no lugar dele.

Nesta máquina, `git` não está no PATH do PowerShell (só no Git Bash). Use a ferramenta Bash
para git, ou recarregue o PATH da máquina antes.
