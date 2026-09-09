# Etapa 07 — Acabamento

A etapa que transforma "está bonito" em afirmação verificável, e deixa a documentação contando a
verdade para a próxima sessão.

**Depende de todas as anteriores.**

---

## Tarefa 1 — Varredura de cor literal

**A restrição global 1 do plano vale para tudo, e esta tarefa é onde ela deixa de ser promessa.**

- [ ] **Passo 1: rodar a varredura**

```bash
grep -rn "neutral-\|zinc-\|gray-\|slate-\|stone-" src/ --include=*.tsx --include=*.ts
grep -rn "#[0-9a-fA-F]\{6\}" src/components src/app --include=*.tsx
```

- [ ] **Passo 2: julgar cada ocorrência**

| O que apareceu | O que fazer |
|---|---|
| Classe de paleta do Tailwind | Trocar pelo token equivalente |
| `#RRGGBB` dentro de `style={{ }}` vindo do banco | **Deixar** — é dado: `Membro.cor`, `Conta.cor`, `Categoria.cor` |
| `#RRGGBB` escrito à mão no `className` | Trocar pelo token |
| Qualquer cor em `src/app/globals.css` | **Deixar** — é a definição dos tokens |

Ao fim, as duas varreduras devem voltar **apenas** com cor vinda do banco e com o `globals.css`.

- [ ] **Passo 3: commitar**

```bash
git add -A src
git commit -m "Tira as ultimas cores soltas do caminho dos tokens"
```

---

## Tarefa 2 — Verificação guiada, tela por tela

Não há teste automatizado desta camada, então a conferência é escrita para não depender de memória.

```bash
npx tsx scripts/dados-ficticios.ts criar
npm run dev
```

- [ ] **Passo 1: casco**

- [ ] Barra lateral com Despesas, Resumo e Configurações ativos; Gráficos e Lixeira desabilitados e
      não focáveis
- [ ] Trocar de tela preserva o mês
- [ ] Trocar de mês preserva o filtro de conta
- [ ] Sair encerra a sessão e cai em `/entrar`
- [ ] Em janela de 1100px, a barra vira só ícones e a página **não** rola na horizontal

- [ ] **Passo 2: despesas**

- [ ] Totais da faixa batem com os do Resumo do mesmo mês
- [ ] Com filtro de conta, a faixa continua no mês inteiro e diz isso
- [ ] Soma dos subtotais das seções bate com o total do rodapé
- [ ] Lançamento à vista não mostra `—` na coluna de parcela
- [ ] Data repetida na linha seguinte aparece esmaecida
- [ ] `Tab` alcança editar e excluir de cada linha
- [ ] Filtro de conta sem resultado mostra o estado vazio que fala do filtro

- [ ] **Passo 3: painel**

- [ ] Compra depois do dia de fechamento: a dica diz o mês seguinte, e a linha não aparece no mês
- [ ] Editar sem mudar nada não encolhe o valor
- [ ] Editar parcelado avisa antes de enviar
- [ ] Conflito em duas abas: recusa, mostra o gravado, não apaga o digitado
- [ ] `Esc` fecha o painel

- [ ] **Passo 4: resumo**

- [ ] Cartões e matriz nunca divergem
- [ ] As duas linhas de metade continuam separadas
- [ ] Zero aparece como `—`
- [ ] Selo da fatura muda ao digitar valor de extrato diferente do somado

- [ ] **Passo 5: configurações**

- [ ] Nome de categoria duplicado dá mensagem no campo
- [ ] Categoria arquivada some do painel e sobrevive nos lançamentos antigos
- [ ] Exatamente um membro com `absorveSobra` depois de trocar duas vezes

- [ ] **Passo 6: a prova de paridade**

Com os dados de agosto, `/resumo` mostra `R$ 1.025,51` de fatura, `R$ 474,25` e `R$ 551,26` de
total geral na coluna C6. **Se não bater, pare** — é o `CLAUDE.md` dizendo que o cálculo quebrou.

- [ ] **Passo 7: limpar**

```bash
npx tsx scripts/dados-ficticios.ts limpar
```

---

## Tarefa 3 — Documentação

Os documentos do projeto respondem "onde paramos" para a sessão seguinte. Se ficarem desatualizados
aqui, a próxima sessão trabalha em cima de mentira.

- [ ] **Passo 1: `docs/arquitetura.md`**

A tabela da Camada 3 lista `navegacao.tsx`, `linha-nova.tsx` e `linha-edicao.tsx`, **que não existem
mais**. Reescreva a seção de componentes com a estrutura em pastas (`casco/`, `despesas/`,
`resumo/`, `configuracoes/`, `ui/`), acrescente `agrupamento.ts` à tabela do domínio e
`configuracao.ts` à de repositórios, e registre o grupo de rota `(app)/`.

Acrescente às **armadilhas** a restrição que decidiu o desenho do casco: *layout do App Router não
recebe `searchParams`*, e por isso a barra lateral é de cliente com `Suspense` e a faixa de
competência é de servidor, alimentada por cada página.

- [ ] **Passo 2: `docs/decisoes.md`**

Duas entradas novas:

1. **"Seções por pessoa não são o layout A"** — a entrada existente "Layout B primeiro, layout A na
   Fase 2" vai parecer contrariada por esta etapa. Registre que continua sendo **um renderizador
   só**, com cabeçalhos de grupo, sem seletor de layout e sem a tabela `Preferencia`; o layout A,
   em painéis lado a lado, segue adiado
2. **"O escuro não foi construído, e o `prefers-color-scheme` foi removido de propósito"** —
   senão alguém recoloca achando que é regressão

- [ ] **Passo 3: `docs/estado.md`**

Atualize "onde estamos", mova para "o que já funciona" o que esta branch entregou, e **mantenha em
"o que ainda não existe"** o que continua faltando: tela de travar fatura, lixeira, resolução de
conflito lado a lado, marcar reembolso como recebido, `CONFERIDA` nunca gravado.

Acrescente às pendências as duas de dado do [README](README.md#pendências-que-precisam-do-usuário):
a colisão de cor entre membro e categoria, e o caso de "Sem categoria".

- [ ] **Passo 4: commitar**

```bash
git add docs
git commit -m "Conta nos documentos o que a camada visual mudou"
```

---

## Tarefa 4 — Fechamento

- [ ] **Passo 1: rodar tudo**

```bash
npm test && npm run lint && npm run build
```

- [ ] **Passo 2: revisar a faixa de commits**

```bash
git log --oneline main..HEAD
```

Cada commit deve explicar **por que**, não o quê. Use `superpowers:requesting-code-review` antes de
propor o merge.

- [ ] **Passo 3: parar e perguntar**

**`main` e `push` continuam exigindo a palavra do usuário** — a exceção de commit livre vale para
branch de trabalho, e o commit que o usuário revisa é o merge. Não mescle, não envie: apresente a
faixa de commits e espere.

---

## Como saber que o plano terminou

- As duas varreduras de cor voltam só com dado do banco e com o `globals.css`
- Toda a lista da Tarefa 2 marcada
- Os três números de agosto reproduzidos na tela
- `npm test`, `npm run lint` e `npm run build` limpos
- `arquitetura.md`, `decisoes.md` e `estado.md` contando a verdade
- Nada mesclado em `main` e nada enviado sem autorização
