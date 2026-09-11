# Etapa 06 — Configurações

**A maior fatia do plano, e a menos visual.** É CRUD, com repositório e actions novos. Está aqui
para que ninguém a subestime: se o escopo apertar, é a etapa que se corta inteira sem prejudicar
nenhuma outra.

**Depende das Etapas 01 e 02.**

O que resolve: hoje **categoria nova só nasce pelo `prisma studio`**, e a invariante de
`Membro.absorveSobra` é conferida à mão.

---

## Tarefa 1 — Repositório

**Arquivos:**
- Cria: `src/server/repositorios/configuracao.ts`

**Produz:**

```ts
type Recusa = { ok: false; motivo: 'NOME_DUPLICADO' | 'NAO_ENCONTRADO' };
type Sucesso<T> = { ok: true; registro: T };
export type ResultadoConfiguracao<T> = Sucesso<T> | Recusa;

export async function criarCategoria(dados: { nome: string; cor: string }): Promise<ResultadoConfiguracao<Categoria>>;
export async function editarCategoria(id: string, dados: { nome: string; cor: string }): Promise<ResultadoConfiguracao<Categoria>>;
export async function arquivarCategoria(id: string, arquivada: boolean): Promise<ResultadoConfiguracao<Categoria>>;
export async function editarConta(id: string, dados: { nome: string; cor: string; diaFechamento: number | null; diaVencimento: number | null; ativa: boolean }): Promise<ResultadoConfiguracao<Conta>>;
export async function editarMembro(id: string, dados: { nome: string; cor: string }): Promise<ResultadoConfiguracao<Membro>>;
export async function definirQuemAbsorveSobra(membroId: string): Promise<ResultadoConfiguracao<Membro>>;
```

`Categoria`, `Conta` e `Membro` aqui são os tipos de modelo gerados pelo Prisma, importados de
`@prisma/client` — o mesmo que `repositorios/lancamento.ts` já devolve.

- [ ] **Passo 1: seguir o padrão da casa**

`docs/arquitetura.md`: as gravações **devolvem resultado tratável em vez de lançar**, e quem chama
tem que tratar. Recusa engolida como sucesso faz a pessoa achar que salvou.

`Categoria.nome` é `@unique` no schema. A colisão volta como
`{ ok: false, motivo: 'NOME_DUPLICADO' }`, **nunca como exceção do Prisma vazando para a tela**.
Capture o erro de constraint única e traduza.

- [ ] **Passo 2: `definirQuemAbsorveSobra` numa transação**

`docs/decisoes.md`: exatamente um membro deve ter `absorveSobra: true`, e hoje isso é invariante de
dado conferida à mão. A tela passa a impor — marcar um **desmarca os outros**:

```ts
await prisma.$transaction([
  prisma.membro.updateMany({ where: { NOT: { id: membroId } }, data: { absorveSobra: false } }),
  prisma.membro.update({ where: { id: membroId }, data: { absorveSobra: true } }),
]);
```

**A transação não é opcional.** Sem ela, uma falha entre as duas gravações deixa zero ou dois
membros absorvendo a sobra, e o rateio passa a depender do desempate por `criadoEm`. Esta base já
tem um problema conhecido de `gravarFilhos` fazer `deleteMany` e `createMany` sem transação; não
faz sentido repetir o erro em código novo.

- [ ] **Passo 3: arquivar não apaga**

`arquivarCategoria` só vira o booleano. **Não toca nos lançamentos que usam a categoria.** Categoria
arquivada some das opções de lançamento novo — o `where: { arquivada: false }` das páginas já cuida
disso — e continua aparecendo nos lançamentos antigos.

- [ ] **Passo 4: commitar**

```bash
git add src/server/repositorios/configuracao.ts
git commit -m "Abre contas, categorias e membros para gravacao pela tela"
```

---

## Tarefa 2 — Teste do repositório

**Arquivos:**
- Cria: `src/server/repositorios/configuracao.test.ts`

- [ ] **Passo 1: seguir o padrão dos que já existem**

Espelhe `src/server/repositorios/lancamento.test.ts`, inclusive a **guarda de `TESTE_DESTRUTIVO=1`**
e a recusa de rodar se houver lançamento no banco.

**Este teste toca o banco, então não roda no `npm test` do dia a dia.** É a sexta armadilha de
`docs/arquitetura.md`: o banco é o de produção do casal. Se precisar rodar, aponte `DATABASE_URL`
para um banco vazio.

O usuário está criando um banco vazio no Neon para esta finalidade. **Se a conexão ainda não
estiver disponível quando esta tarefa chegar, escreva o teste e pare** — reporte que ele não foi
executado, e não o marque como verde. Teste que ninguém rodou não é prova de nada.


- [ ] **Passo 2: cobrir os três casos que importam**

1. **Nome duplicado devolve recusa**, não exceção: criar "Veículo" quando já existe volta
   `{ ok: false, motivo: 'NOME_DUPLICADO' }`
2. **`definirQuemAbsorveSobra` deixa exatamente um `true`**: chame para o membro A, depois para o B,
   e confira que a contagem de `absorveSobra: true` é 1 nas duas vezes
3. **Arquivar não some com lançamento**: arquive uma categoria em uso e confira que os lançamentos
   que a referenciam continuam lá

- [ ] **Passo 2b: os dois casos que a revisão da Tarefa 1 pediu**

A revisão da Tarefa 1 entregou a lista do que **não dá para verificar sem banco**. Estes dois
saíram dela, e são justamente os que provam as afirmações que hoje só existem em comentário:

4. **`P2025` vira `NAO_ENCONTRADO`**: `editarCategoria` com um id que não existe volta
   `{ ok: false, motivo: 'NAO_ENCONTRADO' }`, e **não** lança. É a outra metade da tradução de
   erro; a Tarefa 1 só pôde afirmá-la pela documentação do Prisma.

5. **A transação reverte de verdade** — o caso mais valioso desta tarefa. Chame
   `definirQuemAbsorveSobra` com um `membroId` inexistente e confira **as duas coisas**:
   - o resultado é `{ ok: false, motivo: 'NAO_ENCONTRADO' }`
   - **quem tinha `absorveSobra: true` antes continua tendo**

   Sem a transação, o `updateMany` já teria desmarcado todo mundo antes de o `update` falhar, e
   o banco ficaria com **zero** membros absorvendo a sobra — o estado que a função existe para
   impedir. Este caso é a única prova de que o `$transaction` em forma de array faz o que o
   comentário diz.

- [ ] **Passo 3: rodar e commitar**

**O banco vazio precisa de schema e seed antes de rodar.** Criar o banco no Neon não basta:

```bash
npx prisma migrate deploy
npm run db:seed
```

Sem isso o teste quebra no `findFirstOrThrow` de categoria e membro, como o de lançamento já
quebraria.

```bash
TESTE_DESTRUTIVO=1 npx vitest run src/server/repositorios/configuracao.test.ts
git add src/server/repositorios/configuracao.test.ts
git commit -m "Prova que so um membro absorve a sobra depois de cada troca"
```

---

## Tarefa 3 — Actions

**Arquivos:**
- Cria: `src/server/actions/configuracao.ts`

- [ ] **Passo 1: validar e exigir sessão**

`docs/arquitetura.md`: toda action **valida com Zod e exige sessão** antes de qualquer gravação, e
**propaga o resultado do repositório sem engolir**. Espelhe `src/server/actions/lancamento.ts`,
inclusive o `exigirSessao()`.

Esquemas:

```ts
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB');
const nome = z.string().trim().min(1).max(40);
const diaDoMes = z.number().int().min(1).max(31).nullable();
```

- [ ] **Passo 1b: cartão sem dia de fechamento não pode ser gravado — obrigatório**

**Achado da revisão da Tarefa 1, e o conserto mora aqui.** `editarConta` aceita
`diaFechamento` e `diaVencimento` nulos e grava o que vier, sem olhar o `tipo` — que nem
está no objeto de dados. Só que uma conta `CARTAO` sem esses dias **quebra duro** em dois
lugares, os dois com `throw new Error` cru, não com recusa tratável:

| Onde | O que estoura |
|---|---|
| `lancamento.ts:30`, em `competenciaBaseDe` | criar **e** editar qualquer lançamento naquele cartão |
| `fatura.ts:34`, em `registrarValorReal` | conferir a fatura daquele cartão |

`competenciaBaseDe` é chamada por `criarLancamento` **e** por `editarLancamento`. Ou seja:
um campo deixado em branco nesta tela de configuração derruba o fluxo principal do sistema,
e o erro aparece longe da causa — a pessoa mexe em Configurações e a exceção estoura depois,
quando alguém tenta lançar uma compra.

Antes desta etapa esse estado só era alcançável pelo `prisma studio`. A tela o põe ao alcance
de um campo vazio.

**A validação vai na action**, com `superRefine` condicionado ao `tipo` **atual** da conta —
a tela de edição já carrega a conta para preencher o formulário, então o `tipo` está à mão.
Recuse `diaFechamento` ou `diaVencimento` nulos quando `tipo === 'CARTAO'`, com mensagem que
diga qual campo falta.

Por que na action e não no repositório: `docs/arquitetura.md` põe validação de payload na
fronteira, e o repositório não recebe `tipo`. Se um segundo chamador aparecer e pular o Zod,
aí o repositório ganha a defesa — hoje há um chamador só, que é a tela desta etapa.

- [ ] **Passo 2: revalidar o que muda**

Categoria e membro aparecem na grade e no resumo; conta aparece nos chips, na grade e no resumo.
Revalide `/despesas`, `/resumo` e `/configuracoes` depois de gravar.

- [ ] **Passo 3: commitar**

```bash
git add src/server/actions/configuracao.ts
git commit -m "Valida e protege as gravacoes de configuracao"
```

---

## Tarefa 4 — As três listas

**Arquivos:**
- Cria: `src/app/(app)/configuracoes/page.tsx`
- Cria: `src/components/configuracoes/lista-categorias.tsx`
- Cria: `src/components/configuracoes/lista-contas.tsx`
- Cria: `src/components/configuracoes/lista-membros.tsx`
- Modifica: `src/components/casco/barra-lateral.tsx`

- [ ] **Passo 1: a página**

Servidor. Carrega categorias (**incluindo as arquivadas**, ao contrário das outras telas), contas e
membros, e renderiza as três listas em seções empilhadas. Sem `searchParams`.

- [ ] **Passo 2: categorias**

A lista mais completa: criar, renomear, trocar cor, arquivar e desarquivar.

- Amostra da cor à esquerda, com `style` inline
- Arquivadas em bloco separado, esmaecidas, com ação de desarquivar
- `NOME_DUPLICADO` vira mensagem no campo, em `role="alert"` — **não** um erro genérico
- `Categoria.icone` **continua sem uso**; não invente seletor de ícone

- [ ] **Passo 3: contas**

Só editar: nome, cor, dia de fechamento, dia de vencimento, ativa.

**Não construa criar conta.** Conta nova tem consequência sobre faturas e sobre as colunas da
matriz do Resumo; é decisão de produto, não de configuração, e não foi pedida.

Dia de fechamento e vencimento só fazem sentido para `tipo === 'CARTAO'` — esconda os dois campos
para conta externa.

- [ ] **Passo 4: membros**

Nome e cor, mais `absorveSobra` como **escolha única** entre os membros — um grupo de rádio, não um
`Switch` por linha, porque dois `Switch` permitem marcar zero ou dois.

Use `<input type="radio">` nativo, estilizado com os tokens — o `radio-group` do shadcn **não** foi
instalado na Etapa 01 e não vale acrescentar um componente gerado por um único uso.

Acompanhe de uma frase explicando o que a escolha significa: *"quem fica com o centavo de sobra
quando o rateio 50/50 não divide exato"*. Sem isso, ninguém adivinha.

- [ ] **Passo 5: habilitar o destino na barra lateral**

Só agora. `docs/arquitetura.md`: acrescente o destino em navegação **depois que a página existir**.

- [ ] **Passo 6: verificar**

```bash
npm run build && npm run lint && npm test
```

No navegador:

1. Criar categoria com nome que já existe: mensagem no campo, nada gravado
2. Criar categoria nova: ela aparece no `select` do painel de lançamento
3. Arquivar categoria em uso: some do `select`, e **os lançamentos antigos continuam mostrando o
   nome dela** na grade
4. Trocar quem absorve a sobra: pelo `prisma studio`, confirmar que exatamente um membro tem `true`
5. Trocar a cor de um membro: a faixa muda na grade e no resumo

- [ ] **Passo 7: commitar**

```bash
git add -A src
git commit -m "Tira do prisma studio o cadastro de categoria e conta"
```

---

## Como saber que a etapa terminou

- Categoria nova nasce pela tela
- Exatamente um membro tem `absorveSobra: true` depois de qualquer sequência de trocas
- Nenhuma tela de criar conta foi construída
- `npm run build`, `npm run lint` e `npm test` limpos
