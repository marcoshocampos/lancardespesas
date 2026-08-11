# Sistema de lançamento de despesas do casal — documento de design

**Data:** 2026-08-08
**Revisado:** 2026-08-09, após a revisão do casal
**Status:** desenho aprovado, sem questões em aberto
**Proposta visual (desatualizada em parte, ver seção 12):** https://claude.ai/code/artifact/542e24e6-fa0e-4d68-9f86-2d1c84db0c16

---

## 1. Contexto

Nardy e Nick controlam as despesas do casal numa planilha do Google Sheets, com uma aba por
mês. Cada aba tem três blocos de lançamento — Nardy, Nick e Conjunto — com as colunas
`Descrição | Valor | Parcela | Categoria`, mais um bloco `OUTROS`.

A fatura de referência é o cartão **C6**, que **fecha dia 04 e vence dia 10**. A competência
é o mês do vencimento: compras de 05/07 a 04/08 fecham em 04/08, vencem em 10/08 e caem na
aba "Agosto".

Os totais derivados da planilha são, nesta ordem: `TOTAL` por bloco → `METADE` do conjunto →
`TOTAL GERAL` por pessoa (bloco pessoal + metade do conjunto) → `FATURA` (soma dos três blocos).

Categorias em uso: Terceiros, Veículo, Compra Online, Jogo, Beleza, Medicação, Presente,
Assinatura.

## 2. Problema

A planilha calcula certo. O que ela não faz:

1. **Redigitação de parcelas.** Cada parcela de cada compra é digitada à mão, todo mês.
   Uma compra em 12x custa doze digitações.
2. **Sem visão do futuro.** Não há como saber quanto um mês seguinte já tem comprometido
   antes de assumir mais um parcelado.
3. **Sem visão do passado.** Cada mês vive numa aba isolada; nenhuma pergunta que atravesse
   meses tem resposta sem abrir aba por aba.
4. **Conferência da fatura manual**, sem apontamento de diferença.
5. **Despesas fora do cartão sem lugar próprio** — boletos e pagamentos em pix ou débito não
   têm onde ser registrados de forma consistente.

## 3. Objetivos e não-objetivos

**Objetivos**

- Substituir integralmente a planilha, sem perder nenhum uso atual.
- Eliminar a redigitação de parcelas.
- Responder perguntas que atravessam meses.
- Registrar num mesmo lugar as despesas de cartão e as pagas fora dele.
- Tornar o fechamento mensal um fluxo guiado e verificável.
- Não perder nem corromper dado, nunca.

**Não-objetivos**

- Não é um gerenciador financeiro completo: sem receitas, saldo de conta ou investimentos.
- Não é ferramenta de orçamento: registra e mostra, não impõe metas.
- **Não controla dívidas entre Nardy e Nick.** Tudo sai de dinheiro comum; o rateio existe
  para consciência de gasto, não para cobrança.
- Não tem convite de colaborador nem papéis de acesso: são duas pessoas fixas.

## 4. Decisões de produto

| Tema | Decisão |
|---|---|
| Contas | Cadastráveis, em dois tipos: cartão (com fatura) e externa (sem fatura) |
| Cartões | Dia de fechamento e vencimento próprios; geram fatura conferível |
| Contas externas | Boleto, pix, débito, dinheiro; competência é o mês do pagamento |
| Parcelas | Geradas automaticamente na compra; cada parcela é editável ou cancelável |
| Escopo do gasto | Nardy, Nick ou Conjunto |
| Conjunto | Rateio 50/50 por padrão, ajustável por lançamento |
| Terceiros | Reembolso de pessoa de fora, com status pendente/recebido |
| Categorias | Começa com as 8 da planilha; criáveis, renomeáveis e arquiváveis na tela |
| Recorrentes | Despesas fixas geradas automaticamente a cada competência |
| Entrada de dados | Grade com digitação por teclado, autocomplete com memória, copiar do mês anterior |
| Estornos | Lançamento de valor negativo (devolução, cashback, desconto) |
| Conferência | Valor real da fatura digitado e comparado com a soma dos lançamentos |
| Fechamento | Fluxo guiado de 3 passos, terminando com a fatura travada |
| Robustez | Lixeira, histórico de alterações, proteção contra edição simultânea |
| Exportação | CSV/Excel a qualquer momento; PDF do relatório mensal com gráficos |
| Backup | Dump mensal automático, cifrado, fora do provedor do banco |
| Relatórios | Gasto por categoria no mês; evolução mês a mês; projeção de parcelas futuras |
| Alerta | Aviso quando um mês futuro ultrapassa **R$ 2.000** |
| Layout do mês | Dois layouts, A e B, alternáveis por preferência de cada pessoa |
| Migração | Mês corrente + todas as parcelas em aberto; histórico antigo fica na planilha |
| Plataforma | Web, desktop-first |
| Acesso | Login com Google, restrito a uma lista fixa de dois e-mails |

## 5. Modelo de domínio

### 5.1 O conceito central

Um lançamento responde a duas perguntas independentes:

- **De quem é o gasto** — `Nardy`, `Nick` ou `Conjunto`. Determina os totais e o rateio.
- **Por onde foi pago** — uma conta de cartão (entra numa fatura, pode ser parcelado) ou uma
  conta externa (entra direto na competência do pagamento).

Um terceiro atributo, opcional, cobre o caso das linhas vermelhas da planilha: o lançamento
pode ser **reembolsável por alguém de fora**.

Com isso, os quatro casos reais de agosto ficam assim:

| Caso real | De quem é | Conta | Consequência |
|---|---|---|---|
| `loja online R$ 25,00` | Nardy | C6 | Soma no total de Nardy |
| `fone + suporte R$ 101,01` | Conjunto | C6 | Divide 50/50; alimenta `METADE` |
| `aparelho R$ 100,00` | Nardy | C6 | Entra na fatura e vira "a receber" de terceiro |
| `manutenção da moto R$ 80,00` | Nick | Externa (pix) | Despesa de Nick fora do cartão |

### 5.2 Entidades

**Membro** — nome, e-mail Google, cor, ativo. Dois registros fixos.

**Conta** — nome, `tipo` (`CARTAO` ou `EXTERNA`), cor, ativa.
Para `CARTAO`: `diaFechamento`, `diaVencimento`.
Instâncias iniciais: C6 (cartão, fechamento 04, vencimento 10), Nu (cartão), Externa
(boleto, pix, débito).

**Categoria** — nome, cor, ícone, arquivada. Nasce com as 8 da planilha.

**Lançamento** — o núcleo:
- `descrição`, `valorCentavos`, `dataCompra`, `categoriaId`, `contaId`
- `escopo`: `PESSOAL` (com `membroId`) ou `CONJUNTO`
- `meioPagamento` para contas externas: `PIX` / `DEBITO` / `BOLETO` / `DINHEIRO`
- `numeroParcelas`, e a origem do valor digitado (`POR_PARCELA` ou `TOTAL`)
- `reembolso` opcional: `devedorNome`, `status` (`PENDENTE` / `RECEBIDO`)
- `versao` (lock otimista), `deletadoEm` (lixeira)

**Parcela** — filha do lançamento: `numero`, `valorCentavos`, `competencia` (`AAAA-MM`),
`cancelada`. É o que aparece na grade do mês. Lançamento à vista tem uma parcela.

**Rateio** — para lançamentos de escopo `CONJUNTO`: `membroId`, `percentual`. Sempre gravado
explicitamente, mesmo quando é o 50/50 padrão.

**Fatura** — apenas para contas do tipo `CARTAO`: `contaId`, `competencia`, `dataFechamento`,
`dataVencimento`, `valorRealCentavos` (digitado para conferência), `status`
(`ABERTA` / `CONFERIDA` / `TRAVADA`), `travadaEm`.

**Recorrente** — descrição, valor, categoria, escopo, conta, dia do mês, `dataInicio`,
`dataFim`, ativa.

**Preferência** — por membro: `layoutMes` (`PAINEIS` ou `LISTA`), `tema`.

**Auditoria** — `tabela`, `registroId`, `membroId`, `acao`, `diff` (JSON), `criadoEm`.

## 6. Regras de cálculo

Todas implementadas como funções puras, sem I/O, e testadas isoladamente.

1. **Competência.** Para conta do tipo cartão: `dataCompra` + `diaFechamento` → competência da
   fatura. Compra até o dia do fechamento entra na fatura que fecha naquele mês; depois disso,
   na seguinte. Para conta externa: a competência é o mês da data do pagamento. Em ambos os
   casos o resultado é editável pelo usuário.
2. **Parcelamento.** A parcela `n` cai em `competenciaBase + (n-1)` meses. Quando o valor
   digitado é o total, a divisão é em centavos e a diferença de arredondamento vai na
   **última** parcela.
3. **Rateio.** Lançamento `CONJUNTO` gera cotas por membro, 50/50 por padrão. A soma das cotas
   é sempre igual ao valor da parcela, com o resto de centavos em uma cota definida.
4. **Totais do mês.** Calculados como uma matriz de **pessoas por contas**: `TOTAL` por pessoa
   e para o conjunto → `METADE` → `TOTAL GERAL` por pessoa → `SOMADO`, cada um deles aberto
   por conta e com uma coluna de total. A coluna de uma conta de cartão é a `FATURA` daquela
   competência. Os números da coluna do C6 devem reproduzir exatamente os da planilha.
5. **Reembolso de terceiro.** Sai do total de gasto do casal nos relatórios, mas permanece na
   fatura — porque o dinheiro efetivamente saiu.
6. **Projeção.** Soma das parcelas em aberto por competência futura, com marcação das que
   ultrapassam R$ 2.000.

**Dinheiro é sempre inteiro em centavos.** Nenhum `float` em nenhuma camada.
**Datas são `date` sem hora**, com timezone fixo `America/Sao_Paulo`.

## 7. Arquitetura

### 7.1 Camadas

```
src/
  domain/          # regras puras, zero I/O
    money.ts       # centavos, formatação BRL
    competencia.ts # data + tipo de conta → qual competência
    parcelamento.ts# geração de parcelas e arredondamento
    rateio.ts      # divisão do conjunto
    totais.ts      # TOTAL / METADE / TOTAL GERAL / FATURA
    projecao.ts    # parcelas em aberto por mês futuro e alerta
  server/          # Prisma, repositórios, server actions, validação Zod
  app/             # rotas Next (App Router)
  components/      # UI
```

O motivo da separação: os bugs caros deste domínio são de cálculo e aparecem meses depois —
a parcela que caiu no mês errado, o centavo que sumiu, a compra do dia do fechamento que foi
para a fatura errada. Isolados em funções puras, cada um desses casos vira um teste rápido
sem banco e sem browser.

### 7.2 Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript estrito |
| Banco | Postgres no Neon + Prisma |
| Auth | Auth.js v5, provider Google, allowlist fixa de dois e-mails |
| UI | Tailwind + shadcn/ui + TanStack Table |
| Gráficos | Recharts |
| Testes | Vitest no domínio; Playwright em fluxos críticos |
| Hospedagem | Vercel |

Tema claro e escuro, ambos suportados, com preferência por pessoa.

### 7.3 Pontos de robustez

- **Edição simultânea.** `lancamento.versao` incrementa a cada gravação; a action grava com
  `WHERE versao = ?` e, ao falhar, apresenta o conflito com o valor atual em vez de sobrescrever.
- **Lixeira.** `deletadoEm` em vez de `DELETE`; restauração pela UI.
- **Auditoria.** Gravada na camada de repositório, com diff em JSON.
- **Trava de fatura.** Fatura `TRAVADA` é somente-leitura; destravar é uma ação explícita e
  auditada.
- **Backup.** GitHub Action mensal executando `pg_dump` e guardando o dump cifrado em
  repositório privado, independente do provedor do banco.

### 7.4 PDF

Página de relatório com CSS de impressão e um botão que dispara `window.print()`, gerando o
PDF pelo próprio navegador. Aproveita os gráficos Recharts reais, sem duplicar layout nem
adicionar dependência pesada de renderização no servidor.

Limitação aceita: não gera PDF agendado sem alguém clicar.

### 7.5 Migração da planilha

Script de uso único em `scripts/importar-planilha.ts`, lendo o CSV exportado da aba do mês e
criando as compras com as parcelas restantes já posicionadas nas competências corretas. Não
vira tela nem funcionalidade do produto.

## 8. Navegação e telas

Três destinos principais, mais um menu flutuante para o resto.

```
login
 ├── Despesas ......... chips de conta: [Todos] [C6] [Nu] [Externa]
 │                      grade do mês, em layout A ou B conforme a preferência
 ├── Resumo ........... matriz pessoas x contas, com extrato real e diferença
 └── Gráficos ......... ranking de categorias, categoria em rosca,
                        evolução mensal, projeção futura

menu flutuante
 ├── Fechar o mês ..... fluxo guiado de 3 passos
 ├── A receber ........ pendências de reembolso de terceiros
 ├── Buscar ........... descrição, valor, categoria, pessoa, período
 ├── Configurações .... contas, categorias, recorrentes, layout, tema
 └── Lixeira .......... restauração de lançamentos excluídos
```

**Despesas** é a tela onde o tempo é gasto. Os chips no topo filtram por conta, e `Todos`
mostra o mês inteiro — é assim que se percebe o que ficou faltando. Dois layouts:

- **A, três painéis** — Nardy, Nick e Conjunto lado a lado, fiel à planilha.
- **B, lista única** — uma linha por lançamento, com a pessoa como coluna, ordenável e
  filtrável por qualquer campo.

Os dois consomem os mesmos dados e chegam aos mesmos totais; muda apenas o componente que
desenha a grade. A escolha é preferência de cada pessoa, não configuração global.

**Resumo** é uma matriz de pessoas por contas: uma coluna por conta — os mesmos chips da tela
de Despesas — mais uma coluna de total. Nas linhas, `TOTAL` de cada pessoa e do conjunto,
`METADE`, `TOTAL GERAL` por pessoa e `SOMADO`. Abaixo, para cada coluna de cartão, o extrato
real e a diferença.

A leitura horizontal responde "quanto o Nick gastou no mês inteiro, dentro e fora da fatura"; a
vertical responde "quanto essa conta somou". Nenhum rótulo da planilha muda de significado, e
uma conta nova é só mais uma coluna.

**Fechamento do mês**, em três passos: revisar os fixos → conferir contra a fatura real →
travar o mês.

## 9. Fases de entrega

**Fase 1 — paridade com a planilha.** Sem isso a planilha não pode ser abandonada.
Auth e allowlist; cadastros de conta e categoria; grade do mês no layout B; parcelamento
automático; rateio; totais; estornos; contas externas; faturas com conferência; proteção
contra edição simultânea; importação do mês corrente e das parcelas em aberto.

Dois itens estão nesta fase por dependência, não por conveniência. **Estornos** entram aqui
porque sem valor negativo a conferência da fatura não fecha em nenhum mês que tenha tido
devolução, e conferência é requisito da Fase 1. **Proteção contra edição simultânea** entra
aqui porque custa uma coluna e uma cláusula `WHERE` durante a modelagem, e vira retrabalho
em toda action depois.

**Fase 2 — o que a planilha não faz.** Layout A e a preferência que alterna entre os dois;
recorrentes; a receber de terceiros; relatórios e gráficos; exportação PDF/CSV; busca global;
alerta de pico.

**Fase 3 — ritual e rede de segurança.** Fechamento guiado com trava de fatura; lixeira;
histórico de alterações; backup automático.

> Sobre a ordem dos layouts: a Fase 1 entrega apenas o layout B, que é o recomendado e o mais
> simples de construir. O layout A entra na Fase 2 junto do seletor. Assim a Fase 1 não paga
> o custo de dois renderizadores antes de alguém ter usado o sistema de verdade.

## 10. Fora de escopo

Decididos e descartados; todos podem voltar se virarem dor real:

- Controle de dívidas e acertos entre Nardy e Nick
- Etiquetas livres cruzando categorias
- Convite de colaborador, papéis e permissões
- Integração bancária / Open Finance
- Orçamento e metas por categoria
- Receitas, saldo de contas e investimentos
- Anexo de comprovante (exige armazenamento de arquivos)
- Importação de CSV/OFX da fatura
- Quitação antecipada de parcelamento com botão dedicado (dá para cancelar as parcelas
  futuras manualmente)
- Lançamento por interpretação de texto livre
- Aplicativo nativo e multi-moeda

## 11. Pré-requisitos de ambiente

- Node.js 24.19.0 LTS — instalado em 2026-08-08
- npm 11.17.0 — instalado em 2026-08-08
- git 2.55.0 — presente
- GitHub CLI 2.97.0 — instalado e autenticado em 2026-08-08
- Conta no Neon (Postgres) — pendente
- Conta na Vercel — pendente
- Credenciais OAuth do Google (client id e secret) — pendente

## 12. Histórico de revisão

**2026-08-09** — revisão do casal. Mudanças em relação à primeira versão:

- **Saldo entre Nardy e Nick removido.** Não há mais dívida de um para o outro: some a
  entidade de acerto, a tela de saldo e o terceiro passo do fechamento. O `manutenção da moto`
  deixa de ser dívida e passa a ser uma despesa de Nick numa conta externa.
- **O bloco `OUTROS` da planilha muda de significado**: deixa de ser transferências entre as
  duas pessoas e passa a ser despesas pagas fora do cartão.
- **Conceito de conta** introduzido, em dois tipos, substituindo a entidade cartão.
- **Etiquetas removidas** do escopo.
- **Alerta de mês futuro fixado em R$ 2.000.** Com as parcelas atuais nenhum mês futuro
  atinge esse valor: setembro é o pico, com R$ 1.100,00. O alerta nasce silencioso, por
  desenho.
- **Os dois layouts serão construídos**, alternáveis por preferência de cada pessoa, em vez
  de escolher um só.
- **Convite de colaborador descartado.** A allowlist de dois e-mails continua fixa.
- **Navegação redesenhada** a partir do diagrama de fluxo do casal: Despesas, Resumo e
  Gráficos como destinos principais, com menu flutuante para o restante.

A proposta visual publicada reflete a primeira versão e ainda mostra a tela de saldo e a
pergunta sobre etiquetas.

## Apêndice — dados de referência (agosto)

Números reais da planilha, usados para validar os cálculos na implementação.

**Totais:** Nardy `R$ 423,75` · Nick `R$ 500,75` · Conjunto `R$ 101,01` ·
Metade `R$ 50,50` · Total geral Nardy `R$ 474,25` · Total geral Nick `R$ 551,26` ·
Fatura `R$ 1.025,51`

**Por categoria:** Veículo `R$ 900,00` · Compra Online `R$ 300,00` · Terceiros `R$ 120,00` ·
Medicação `R$ 110,00` · Beleza `R$ 95,00` · Presente `R$ 90,00` · Assinatura `R$ 88,00` ·
Jogo `R$ 60,00` — soma `R$ 1.025,51`, igual à fatura.

**Parcelas em aberto após agosto:** setembro `R$ 1.100,00` · outubro a fevereiro
`R$ 600,00`/mês · março `R$ 432,10`. O parcelamento do moto responde por `R$ 432,10`
mensais até junho de 2027.
