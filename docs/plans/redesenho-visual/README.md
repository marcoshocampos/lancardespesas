# Plano — redesenho visual e de navegação

> **Para quem executa:** use `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans` para tocar tarefa a tarefa. Os passos usam `- [ ]` para marcação.

**Objetivo:** construir a camada visual que a Fase 1 não construiu — barra lateral, grade em
seções por pessoa, painel de lançamento, resumo com cartões e a tela de Configurações — sem tocar
em nenhum cálculo.

**Fonte da verdade:** [`docs/specs/2026-09-07-redesenho-visual-e-navegacao-design.md`](../../specs/2026-09-07-redesenho-visual-e-navegacao-design.md).
Divergiu, a spec vence. Leia também [`docs/arquitetura.md`](../../arquitetura.md) e
[`docs/decisoes.md`](../../decisoes.md) antes da primeira tarefa.

**Arquitetura:** as telas passam para o grupo de rota `(app)/`, que carrega o casco; as URLs não
mudam porque grupo de rota não altera caminho. Uma função nova no domínio (`agrupamento.ts`) e um
repositório novo (`configuracao.ts`); nada mais nas camadas de baixo.

**Stack acrescentada:** shadcn/ui sobre o Tailwind 4 que já existe. Nenhuma outra.

---

## Restrições globais

Valem para **todas** as tarefas. Quebrar qualquer uma é motivo de recusa em revisão.

1. **Nenhum componente escreve cor literal.** Nem `text-neutral-500`, nem `bg-zinc-900`, nem
   `#RRGGBB` no `className`. Só os tokens da Etapa 01. A única exceção é cor vinda do banco
   (`Membro.cor`, `Conta.cor`, `Categoria.cor`), que entra por `style` inline porque é dado.
2. **Nada em `src/domain/` ganha I/O.** Sem Prisma, sem `fetch`, sem `Date.now()`, sem `new Date()`.
3. **Nenhum repositório ou action existente muda de assinatura.** Se parecer necessário, pare e
   pergunte — provavelmente há outro caminho.
4. **Nenhuma migration, nenhum campo novo no schema.**
5. **Nenhuma URL muda.** `/despesas`, `/resumo`, `/entrar` continuam iguais.
6. **`npm test` passa sem regressão** ao fim de cada tarefa. A branch tem hoje **100 passando e 7 pulados** — a contagem "96" que aparece em `docs/estado.md` está desatualizada e será corrigida na Etapa 07. Não trate 96 como alvo.
7. **Idioma:** identificadores de domínio em português sem acento; termos técnicos em inglês;
   comentários, commits e textos de tela em português.
8. **Dinheiro** sempre com `formatarBRL`, alinhado à direita, com `tabular-nums`.
9. **Commits** em português, no imperativo, explicando o porquê. Nesta branch de trabalho os
   commits são livres; `push` e `main` continuam exigindo a palavra do usuário.
10. **Ao mover um componente de pasta, atualize os imports e confirme com `grep`.** Várias etapas
    movem arquivos para `src/components/<área>/`; um import esquecido só aparece no `npm run build`,
    e às vezes nem lá, se outro arquivo ainda reexportar o caminho antigo.

## Como cada etapa é verificada

**A maior parte deste trabalho não tem teste automatizado, e o plano não finge que tem.** O projeto
não tem teste de componente — `docs/decisoes.md` explica por quê — e o único Playwright existente
está pulado por exigir login.

| Tipo de tarefa | Como se verifica |
|---|---|
| Domínio (`agrupamento.ts`) | Vitest, ciclo TDD completo, como todo o domínio |
| Repositório de configuração | Vitest de banco, atrás de `TESTE_DESTRUTIVO=1`, como os 6 que já existem |
| Tudo que é tela | `npm run build`, `npm run lint`, e conferência visual no navegador com passos escritos |

Para conferir tela com conteúdo:

```bash
npx tsx scripts/dados-ficticios.ts criar
```

E ao terminar, `... limpar` remove só o que ele criou. **O banco é o de produção do casal** — nunca
rode a suíte destrutiva apontando para ele.

## Etapas

| Etapa | Entrega | Depende de |
|---|---|---|
| [01 — Fundação](01-fundacao.md) | Tokens, fontes corrigidas, shadcn instalado e revestido, login | — |
| [02 — Casco](02-casco.md) | Grupo de rota, barra lateral, faixa de competência com totais | 01 |
| [03 — Grade](03-grade.md) | `agrupamento.ts` no domínio, seções por pessoa, chips, estados vazios | 01, 02 |
| [04 — Painel](04-painel.md) | Fusão de criar e editar, dica de competência, diálogo de exclusão | 01, 03 |
| [05 — Resumo](05-resumo.md) | Cartões, matriz em bandas, conferência, fronteira de erro | 01, 02 |
| [06 — Configurações](06-configuracoes.md) | Repositório, actions e as três listas | 01, 02 |
| [07 — Acabamento](07-acabamento.md) | Varredura de cor literal, verificação guiada, atualização dos docs | todas |



A **06** é a maior fatia e a menos visual — é CRUD. Se o escopo apertar, é a etapa que se corta
inteira sem prejudicar nenhuma outra.

## Decisões do usuário — resolvidas em 2026-09-08

As duas pendências de dado que este plano abriu foram respondidas.

1. **Cores.** Trocam-se as cores dos **membros**, não as de categoria — são dois registros
   contra oito, e a cor de membro aparece em menos lugares. **Os valores novos precisam ser
   propostos e aprovados pelo usuário antes de qualquer `UPDATE` no banco.** Até lá, a Etapa 03
   pode ser construída lendo `Membro.cor` normalmente; só a troca dos valores fica pendente.
2. **"Sem categoria" é uma categoria de verdade.** O usuário respondeu que seria texto de
   ausência, mas o schema desmente: `categoriaId` é `String` não-nulo com relação obrigatória
   (`prisma/schema.prisma:105` e `:109`), então **todo lançamento tem categoria** e ausência é
   impossível. O rótulo das capturas vem de um registro `Categoria` criado à mão, além das oito
   do seed. **Consequência: a grade não precisa de tratamento especial nenhum** — lê
   `Categoria.cor` como em qualquer outra linha.
3. **Banco de teste.** O usuário cria um banco vazio no Neon e põe a conexão no ambiente. A
   Etapa 06 Tarefa 2 depende disso para rodar. **Nunca peça a string de conexão em conversa** e
   nunca a escreva em arquivo versionado — ela vai no `.env`, pelo usuário.

## Lacunas que este plano deliberadamente não fecha

Estão na §12 da spec e são repetidas aqui porque quem executa vai topar com elas:

- **Travar e destravar fatura continua sem tela.** A mensagem "destrave a fatura" segue apontando
  para uma ação que só existe por SQL direto. Não invente a tela; não some com a mensagem.
- **Tema escuro não é construído.** Os tokens ficam prontos, o bloco escuro não é escrito.
- **`Categoria.icone` continua sem uso.**
- **Criar conta não entra em Configurações.**
