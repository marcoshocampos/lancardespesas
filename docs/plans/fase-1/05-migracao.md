# Etapa 05 — Migração da planilha

Tarefa 14, **pendente**, com o código completo.

Script de uso único: lê o CSV exportado da aba do mês e cria os lançamentos com as parcelas
restantes já posicionadas nas competências corretas. Não vira tela nem funcionalidade — roda
uma vez e morre.

Restrições globais em [README.md](README.md#restrições-globais).

Duas coisas que definem o sucesso desta etapa:

- **A interpretação da linha é testada sozinha**, sem banco. É ali que a importação erra:
  linha de total confundida com lançamento, parcela mal formada, valor com separador de
  milhar.
- **A conferência é o total.** Se a soma importada não bater com o `FATURA` da planilha, a
  importação falhou e deve ser refeita, não corrigida na mão.

O CSV com dados reais vai em `/dados-privados/`, que está no `.gitignore`. **Nunca versione
o arquivo.**

---

## Tarefa 14 — Importação da planilha

**Arquivos:**
- Criar: `scripts/importar-planilha.ts`, `scripts/importar-planilha.test.ts`

**Interfaces:**
- Consome: `reaisParaCentavos` de `@/domain/money`; `criarLancamento` do repositório
- Produz: `interpretarLinha(colunas: string[]): LinhaPlanilha | null`;
  `type LinhaPlanilha = { descricao: string; valorCentavos: number; parcelaAtual: number; totalParcelas: number; categoria: string }`

- [ ] **Passo 1: Escrever o teste da interpretação**

O parsing é puro e é onde a importação erra. Testado sozinho, sem banco.

`scripts/importar-planilha.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { interpretarLinha } from './importar-planilha';

describe('interpretarLinha', () => {
  it('interpreta uma linha parcelada', () => {
    expect(interpretarLinha(['aparelho', 'R$100,00', '6/12', 'Terceiros'])).toEqual({
      descricao: 'aparelho',
      valorCentavos: 10000,
      parcelaAtual: 6,
      totalParcelas: 12,
      categoria: 'Terceiros',
    });
  });

  it('interpreta uma linha a vista, sem parcela', () => {
    expect(interpretarLinha(['google', 'R$88,00', '', 'Assinatura'])).toEqual({
      descricao: 'google',
      valorCentavos: 8800,
      parcelaAtual: 1,
      totalParcelas: 1,
      categoria: 'Assinatura',
    });
  });

  it('interpreta valor com separador de milhar', () => {
    const linha = interpretarLinha(['moto', 'R$432,10', '2/12', 'Veículo']);
    expect(linha?.valorCentavos).toBe(43210);
    expect(linha?.totalParcelas).toBe(12);
  });

  it('ignora linha vazia da planilha', () => {
    expect(interpretarLinha(['', '', '', ''])).toBeNull();
    expect(interpretarLinha([])).toBeNull();
  });

  it('ignora as linhas de total', () => {
    expect(interpretarLinha(['TOTAL:', 'R$423,75', '', ''])).toBeNull();
    expect(interpretarLinha(['TOTAL GERAL:', 'R$474,25', '', ''])).toBeNull();
    expect(interpretarLinha(['FATURA:', 'R$1.025,51', '', ''])).toBeNull();
  });

  it('recusa parcela mal formada em vez de adivinhar', () => {
    expect(() => interpretarLinha(['x', 'R$10,00', '6-12', 'Jogo'])).toThrow('Parcela invalida');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run scripts/importar-planilha.test.ts
```

Esperado: FAIL, `Failed to resolve import "./importar-planilha"`.

- [ ] **Passo 3: Implementar a interpretação**

`scripts/importar-planilha.ts`:

```ts
import { reaisParaCentavos } from '@/domain/money';

export type LinhaPlanilha = {
  descricao: string;
  valorCentavos: number;
  parcelaAtual: number;
  totalParcelas: number;
  categoria: string;
};

const ROTULOS_DE_TOTAL = ['total:', 'total geral:', 'fatura:', 'metade:'];
const PARCELA = /^(\d+)\/(\d+)$/;

/** Interpreta uma linha do CSV da aba do mes. Devolve null para linha que nao e lancamento. */
export function interpretarLinha(colunas: string[]): LinhaPlanilha | null {
  const [descricaoBruta = '', valorBruto = '', parcelaBruta = '', categoria = ''] = colunas;
  const descricao = descricaoBruta.trim();

  if (descricao === '' || valorBruto.trim() === '') return null;
  if (ROTULOS_DE_TOTAL.includes(descricao.toLowerCase())) return null;

  const parcela = parcelaBruta.trim();
  let parcelaAtual = 1;
  let totalParcelas = 1;

  if (parcela !== '') {
    const casou = PARCELA.exec(parcela);
    if (!casou) throw new Error(`Parcela invalida: ${parcela}`);
    parcelaAtual = Number(casou[1]);
    totalParcelas = Number(casou[2]);
  }

  return {
    descricao,
    valorCentavos: reaisParaCentavos(valorBruto),
    parcelaAtual,
    totalParcelas,
    categoria: categoria.trim(),
  };
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run scripts/importar-planilha.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Passo 5: Escrever a rotina de importação**

Acrescente ao mesmo arquivo uma função `importar(caminhoCsv, competencia, contaId)` que:

1. lê o CSV com `node:fs`, separando por bloco de pessoa (Nardy, Nick, Conjunto);
2. chama `interpretarLinha` em cada linha, pulando os `null`;
3. converte `parcelaAtual`/`totalParcelas` na competência base — a competência da parcela 1 é
   `avancarCompetencia(competencia, -(parcelaAtual - 1))`;
4. chama `criarLancamento` com `origemValor: 'POR_PARCELA'`;
5. ao final, imprime a soma importada por bloco.

A conferência é o total: se a soma não bater com o `FATURA` da planilha, **apague tudo e
refaça**, não corrija na mão.

- [ ] **Passo 6: Rodar contra a aba real**

```bash
npx tsx scripts/importar-planilha.ts ./dados-privados/agosto.csv 2026-08 conta-c6
```

Esperado: soma impressa igual a `R$ 1.025,51`, e `/resumo?competencia=2026-08` reproduzindo
os sete números da planilha.

O arquivo fica em `/dados-privados/`, que está no `.gitignore`. **Não versione o CSV.**

- [ ] **Passo 7: Commit (pedir autorização antes)**

```
Importa o mes corrente e as parcelas em aberto da planilha

Script de uso unico. A interpretacao da linha e testada sozinha, porque e
onde a importacao erra; a conferencia final e o total bater com a fatura.
```

---


---

## Tarefa 16 — Reescrever o leitor para o formato real da planilha

A Tarefa 14 construiu o importador supondo **blocos empilhados**: uma linha com o nome do
bloco, depois as linhas de lançamento. O implementador registrou no relatório que o formato
era suposição dele e recomendou conferir contra o arquivo real antes de importar.

Conferido: **a planilha é colunar.** Os blocos ficam lado a lado, em faixas de colunas. O
leitor precisa ser trocado; o resto do importador continua valendo.

### O formato real

Arquivo em `dados-privados/`, 34 linhas, 19 a 23 colunas. **Contém as finanças reais do
casal — nunca versione, nunca imprima valores em relatório ou log.**

| Linha | Conteúdo |
|---|---|
| 1 | Título dos grupos: `C6` e `OUTROS`, cada um na coluna onde seu primeiro bloco começa |
| 3 | Cabeçalho dos blocos: `Nardy`, `Nick`, `Conjunto`, `Nardy > Nick`, `Nick > Nardy` |
| 5 | Cabeçalho das colunas de cada bloco |
| 6+ | Lançamentos, e no fim as linhas de total |

As faixas de coluna de cada bloco, em agosto:

| Grupo | Bloco | Colunas |
|---|---|---|
| C6 | Nardy | Descrição, Valor, Parcela, Categoria |
| C6 | Nick | Descrição, Valor, Parcela, Categoria |
| C6 | Conjunto | Descrição, Valor, Parcela, Categoria |
| OUTROS | Nardy > Nick | Descrição, Valor |
| OUTROS | Nick > Nardy | Descrição, Valor, Parcela |

**Não fixe as posições no código.** Derive tudo dos cabeçalhos: ache a linha dos blocos, ache
a linha das colunas, e para cada bloco leia da coluna dele até a coluna do bloco seguinte. A
planilha vai ganhar coluna e mudar de largura, e um leitor posicional quebra em silêncio.

O grupo de cada bloco sai da linha 1: o título mais próximo à esquerda, na mesma coluna ou
antes. Bloco sob `C6` vira lançamento de cartão; sob `OUTROS`, de conta externa.

### As três diferenças que o leitor antigo não previa

1. **Os sub-blocos do OUTROS têm formatos diferentes entre si.** `Nardy > Nick` tem só
   Descrição e Valor; `Nick > Nardy` tem também Parcela. Leia o que existe em cada um.
2. **Nenhum bloco do OUTROS tem Categoria.** Essas linhas recebem a categoria
   **`Sem categoria`**, criada pelo importador se ainda não existir. É decisão do casal: não
   inventar classificação que a planilha não tem, e deixar visível o que falta reclassificar.
3. **As linhas de total no rodapé mudam de coluna**, por causa de células mescladas. Não
   confie na posição: reconheça pelo texto (`TOTAL:`, `TOTAL GERAL:`, `METADE:`, `FATURA:`) em
   qualquer coluna, e ignore. O valor de `FATURA:` continua sendo a conferência do cartão.

### O que não muda

Continuam valendo, testados e revisados: a competência da parcela 1 a partir de `x/y`, o mapa
de donos dos sub-blocos do OUTROS, o aborto por cabeçalho desconhecido, a compensação que
desfaz tudo em caso de falha, a conferência contra `FATURA:` com código de saída diferente de
zero, e o total externo impresso em separado.

### Verificação

O teste de `interpretarLinha` some junto com o leitor antigo. No lugar, teste o leitor novo com
CSVs **fictícios** montados no formato colunar, cobrindo: bloco com e sem coluna de Parcela,
linha de total no meio das colunas, bloco vazio, e cabeçalho de bloco desconhecido abortando.

A prova final é rodar contra o arquivo real e a soma bater com `FATURA:`. **Reporte só se
bateu ou não** — nunca os valores.
