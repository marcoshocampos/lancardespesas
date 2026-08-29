# Fase 1 — Paridade com a planilha

> **Para quem executa com agente:** use `superpowers:subagent-driven-development` (recomendado)
> ou `superpowers:executing-plans`, uma tarefa por vez. Os passos usam checkbox (`- [ ]`).
> Cada arquivo desta pasta é uma etapa; **nunca dê o plano inteiro a um subagente**, só a
> tarefa dele.

**Objetivo:** entregar um sistema em que Nardy e Nick consigam abandonar a planilha — lançar
despesas de cartão e de contas externas, com parcelas geradas sozinhas, rateio do conjunto,
a matriz de totais e a conferência da fatura contra o extrato.

**Arquitetura:** as regras de cálculo vivem em `src/domain/`, como funções puras sem nenhum
I/O, desenvolvidas por TDD antes de existir banco ou tela. Acima delas, `src/server/` faz a
ponte com o Prisma através de server actions validadas com Zod, e `src/app/` renderiza com
React Server Components. A ordem das etapas é deliberada: domínio primeiro, porque é onde
moram os bugs caros e onde o teste é mais barato.

Estado atual do projeto em [`docs/estado.md`](../../estado.md).
Decisões tomadas e o porquê em [`docs/decisoes.md`](../../decisoes.md).

## As etapas

| Etapa | Tarefas | Situação |
|---|---|---|
| [01 — Fundação](01-fundacao.md) | 1, 2 | Concluída |
| [02 — Domínio](02-dominio.md) | 3, 4, 5, 6 | Concluída |
| [03 — Persistência e acesso](03-persistencia.md) | 7, 8, 9 | Concluída |
| [04 — Telas](04-telas.md) | 10, 11, 12, 13, 15 | Concluída |
| [05 — Migração da planilha](05-migracao.md) | 14 | Concluída |

As tarefas já executadas estão **enxutas**: o código extenso saiu e no lugar ficou o que foi
feito, por que, e um ponteiro para os arquivos reais. O código de verdade está em `src/`,
revisado e coberto por testes — manter uma segunda cópia aqui só criaria duas versões
divergindo.

As tarefas pendentes mantêm o código completo, porque é o que os agentes transcrevem.

## Restrições globais

Valem para todas as tarefas, sem exceção.

- **Dinheiro é `number` inteiro em centavos.** Nenhum `float`, nenhum `Decimal`, em nenhuma
  camada. O tipo é `Centavos`, de `src/domain/money.ts`.
- **Datas no domínio são strings `AAAA-MM-DD`** (tipo `DataISO`). **Não use `Date` dentro de
  `src/domain/`** — é o que elimina a classe inteira de bugs de fuso horário. Timezone da
  aplicação: `America/Sao_Paulo`.
- **`src/domain/` não importa nada de `src/server/`, `src/app/`, Prisma, `fetch` ou
  `Date.now()`.** Funções puras: argumentos entram, valor sai.
- **Toda gravação de lançamento usa lock otimista** com `WHERE versao = ?`.
- **Nada é apagado**: `deletadoEm`, nunca `DELETE`.
- **Identificadores em português sem acento** para o domínio (`competencia`, `rateio`,
  `lancamento`, `parcela`, `fatura`, `conta`), inglês para termos técnicos (`repository`,
  `schema`, `handler`). Comentários e commits em português.
- **Nunca commitar sem autorização.** Exceção vigente: durante a execução deste plano, em
  branch de trabalho, os agentes commitam livremente; a consulta é obrigatória para `main` e
  para qualquer `push`.
- **Fixture obrigatória:** os números reais de agosto, em
  [`docs/regras-de-negocio.md`](../../regras-de-negocio.md#4-totais-do-mês). Se os totais não
  reproduzirem `R$ 1.025,51` de fatura, `R$ 474,25` e `R$ 551,26` de total geral, o
  cálculo está errado.
- **Segredos** vêm do `.env`, a partir do `.env.example`. Nunca escreva um valor real em
  arquivo versionado, em log ou em conversa.

## Estrutura de arquivos da Fase 1

```
src/domain/            regras puras, zero I/O — um .test.ts irmão por arquivo
  money.ts             tipo Centavos, conversão e formatação BRL
  data.ts              tipo DataISO, aritmética de datas sem fuso
  competencia.ts       data + conta → competência; avançar meses
  parcelamento.ts      geração de parcelas e arredondamento
  rateio.ts            divisão do conjunto e resto de centavos
  totais.ts            matriz pessoas × contas
  conferencia.ts       somado contra o valor real do extrato
  fixtures/            dados reais de agosto, usados nos testes
src/server/
  db.ts                cliente Prisma singleton
  auth.ts              Auth.js v5, provider Google
  auth-regras.ts       a regra de allowlist, pura e testável
  repositorios/        leitura e gravação
  actions/             server actions com validação Zod
src/app/
  (auth)/entrar/       tela de login
  despesas/            grade do mês
  resumo/              matriz pessoas × contas
prisma/
  schema.prisma        modelo físico
  seed.ts              membros da allowlist, C6, conta externa, 8 categorias
scripts/
  importar-planilha.ts uso único, CSV da aba do mês
```

## Cobertura e lacunas conhecidas

O que a Fase 1 entrega, por requisito da spec: auth e allowlist (tarefa 8); cadastros
(tarefa 7, via seed); grade do mês no layout B (tarefas 10 e 11); parcelamento (tarefa 4);
rateio (tarefa 5); totais (tarefas 6 e 12); estornos (tarefas 4, 5 e 6); contas externas
(tarefas 3, 7 e 10); faturas com conferência (tarefa 13); lock otimista (tarefa 9);
importação (tarefa 14); editar e excluir lançamento (tarefa 15, nascida da revisão final).

Lacunas assumidas, que **não** são esquecimento. As três primeiras foram decididas; as demais
foram encontradas na revisão final da branch e aceitas conscientemente:

- **Não há tela de cadastro de categoria.** O seed cria as oito; categoria nova sai pelo
  `prisma studio` até a Fase 2. Precisa existir antes do primeiro mês em que vocês quiserem
  uma categoria que não está na lista.
- **Não há tela de conflito de edição simultânea.** O repositório devolve
  `{ ok: false, motivo: 'CONFLITO', atual }` e a action propaga, mas nenhuma tela desenha o
  comparativo — o conflito aparece como mensagem. A proteção contra sobrescrita existe desde
  a Fase 1, que era o objetivo; a tela de resolução fica para a Fase 3, junto do histórico
  de alterações.
- **Não há tela para travar ou destravar fatura.** A maquinaria existe e é respeitada por
  criar, editar e excluir, mas só é acionável por SQL direto. A interface chega a dizer
  "destrave a fatura para lançar", apontando para algo que ainda não dá para fazer pela tela.
  É a lacuna mais incômoda das seis.
- **Não há tela de lixeira.** A exclusão marca `deletadoEm` e não apaga, mas sem tela de
  restauração o efeito para o casal é definitivo. A interface não promete o contrário.
- **Não há tela para marcar reembolso como recebido**, e `calcularResumo` ainda soma
  reembolso no gasto do casal, divergindo da seção 6 das regras de negócio.
- **O status `CONFERIDA` nunca é gravado.** A conferência aponta a diferença corretamente,
  mas toda fatura permanece `ABERTA`.

## Depois da Fase 1

As fases 2 e 3 estão descritas na
[spec](../../specs/2026-08-08-sistema-despesas-casal-design.md#9-fases-de-entrega) e **ganham
plano detalhado só quando a Fase 1 estiver rodando com dados reais**. Isso é decisão, não
pendência: metade das escolhas de layout A, de recorrentes e de busca vai mudar depois do
primeiro fechamento de mês de verdade, e escrever os passos agora seria adivinhação cara.

Antes de começar a Fase 2, revisite os **15 pontos `[a confirmar]`** de
[`docs/regras-de-negocio.md`](../../regras-de-negocio.md) — vários ficam óbvios depois de um
mês de uso. E avalie a migração para o Prisma 7, que é trabalho de fronteira de fase.
