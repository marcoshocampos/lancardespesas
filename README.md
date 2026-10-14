# lancardespesas

Sistema web que um casal usa para lançar as despesas do mês, substituindo uma planilha do
Google Sheets com uma aba por mês. Está em produção e em uso real.

**[lancardespesas.vercel.app](https://lancardespesas.vercel.app)** · acesso restrito a dois
e-mails

A planilha resolvia o mês corrente e falhava no resto: parcelamento que atravessa meses,
rateio com sobra de centavos, conferência contra a fatura do cartão, e qualquer pergunta que
cruzasse abas. O sistema resolve isso e mantém o vocabulário da planilha — quem usava uma
reconhece o outro.

## O que ele faz

- **Lança despesa parcelada** e posiciona cada parcela na competência certa, pela regra de
  fechamento do cartão. Compra depois do dia de fechamento cai na fatura seguinte.
- **Rateia gasto conjunto** sem perder centavo. A sobra de uma divisão ímpar tem dono
  definido no banco, não decidido pela ordem de cadastro.
- **Confere a fatura** contra o valor do extrato e fecha o mês, deixando-o somente-leitura.
- **Separa reembolso de terceiro**: entra na fatura, porque o dinheiro saiu do cartão, e sai
  do gasto do casal, porque alguém vai devolver.
- **Lixeira** com restauração. Nada é apagado de verdade.
- Tema claro e escuro, seguindo o sistema ou forçado.

## Stack

Next.js 16 (App Router) · TypeScript estrito · PostgreSQL no Neon via Prisma 6 · Auth.js v5
com Google e allowlist fixa · Tailwind 4 e shadcn/ui · Vitest · Vercel

## O que talvez interesse a quem lê o código

**Dinheiro é inteiro em centavos, em todas as camadas.** Nenhum `float` em lugar nenhum. As
datas são `String` no formato `AAAA-MM-DD`, e não `DateTime` — com `DateTime`, alguma camada
aplica fuso e move a compra do dia 4 para o dia 3, jogando-a para a fatura do mês seguinte. O
casal só descobriria meses depois.

**As regras de cálculo são funções puras em `src/domain/`**, sem Prisma, sem `fetch`, sem
`Date.now()`. É o que torna cada caso de borda testável em milissegundos.

**Toda gravação passa por lock otimista** e roda dentro de uma transação. São duas pessoas
mexendo no mesmo mês; sobrescrita silenciosa seria o pior bug possível aqui.

**A documentação registra as decisões, não só o estado.**
[`docs/decisoes.md`](docs/decisoes.md) existe para as escolhas que parecem melhoráveis e não
são — cada uma com o motivo e o que acontece se alguém a desfizer. A seção *armadilhas* de
[`docs/arquitetura.md`](docs/arquitetura.md) tem 22 entradas, cada uma com o sintoma concreto
que ela custou.

| Documento | Para quê |
|---|---|
| [docs/estado.md](docs/estado.md) | Onde o projeto está, o que falta, como retomar |
| [docs/decisoes.md](docs/decisoes.md) | Escolhas que parecem melhoráveis e não são |
| [docs/arquitetura.md](docs/arquitetura.md) | Onde cada coisa mora, e as armadilhas conhecidas |
| [docs/regras-de-negocio.md](docs/regras-de-negocio.md) | Comportamento detalhado e casos de borda |
| [docs/verificacao-visual.md](docs/verificacao-visual.md) | O roteiro da conferência tela a tela |
| [docs/specs/](docs/specs/) | Os dois designs: o sistema e a camada visual |
| [CLAUDE.md](CLAUDE.md) | Orientação para sessões de IA que trabalhem no código |

## Rodando

```bash
npm install
npm test
```

São 118 testes em menos de um segundo, **sem banco e sem rede**.

Para subir a aplicação é preciso um `.env` na raiz, a partir do
[`.env.example`](.env.example), com a conexão do Postgres e as credenciais do Google.

```bash
npm run dev
```

```bash
npm run test:banco
```

Roda os 144, incluindo os que tocam banco. Exige `DATABASE_URL_TESTE` apontando para uma base
criada só para isso — **a suíte apaga todo lançamento que encontra**. O runner se recusa a
rodar se essa variável faltar ou se apontar para o mesmo endpoint da `DATABASE_URL`.

## Privacidade

Este repositório é público e **não contém dado financeiro real**. A fixture dos testes de
cálculo é inventada; `.csv`, `.xlsx` e a pasta `/dados-privados/` estão no `.gitignore`; e
nenhum `.env` jamais foi commitado.

Nem sempre foi assim. Enquanto o repositório era privado, a fixture guardou por meses a lista
de compras real do casal, e os totais de um mês ficaram espalhados por 22 arquivos. Ao abrir o
repositório, **o histórico foi reescrito** para remover os dois — editar o estado atual não
teria resolvido, porque `git log -p` mostra tudo o que já passou por ali.

Fica como lembrete do que é fácil errar: o dado entrou como "fixture de teste", que é
exatamente o disfarce que faz ninguém olhar duas vezes.

## Licença

Sem licença de uso. O código está público para leitura.
