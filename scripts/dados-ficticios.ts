/**
 * Dados ficticios para olhar a grade do mes com conteudo realista.
 *
 * NAO sao os numeros reais do casal: e tudo inventado, de proposito, para que
 * nada financeiro de verdade fique fora do .env e do banco de producao.
 *
 *   npx tsx scripts/dados-ficticios.ts criar
 *   npx tsx scripts/dados-ficticios.ts limpar
 *
 * O "criar" grava pelo repositorio real, entao as parcelas e o rateio saem do
 * mesmo caminho que a aplicacao usa. Os ids ficam em um arquivo ao lado; o
 * "limpar" apaga exatamente esses ids e nada mais.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../src/server/db';
import { criarLancamento, type EntradaLancamento } from '../src/server/repositorios/lancamento';

const ARQUIVO_IDS = join(import.meta.dirname, '.dados-ficticios-ids.json');

const C6 = 'conta-c6';
const EXTERNA = 'conta-externa';

/** Compra ate o dia 4 cai na fatura do proprio mes; depois, na seguinte. */
type Semente = Omit<EntradaLancamento, 'contaId' | 'categoriaId' | 'membroId'> & {
  conta: string;
  categoria: string;
  dono: 'A' | 'B' | 'CONJUNTO';
  reembolso?: string;
};

const SEMENTES: Semente[] = [
  // A vista, para ver a linha simples
  { descricao: 'livraria online', valorCentavos: 8990, origemValor: 'POR_PARCELA', dataCompra: '2026-07-12', numeroParcelas: 1, escopo: 'PESSOAL', dono: 'A', conta: C6, categoria: 'Compra Online' },
  { descricao: 'salao', valorCentavos: 12000, origemValor: 'POR_PARCELA', dataCompra: '2026-07-20', numeroParcelas: 1, escopo: 'PESSOAL', dono: 'A', conta: C6, categoria: 'Beleza' },
  { descricao: 'assinatura streaming', valorCentavos: 5590, origemValor: 'POR_PARCELA', dataCompra: '2026-08-01', numeroParcelas: 1, escopo: 'PESSOAL', dono: 'B', conta: C6, categoria: 'Assinatura' },

  // Parcelados, para ver o rotulo x/y e a projecao dos meses seguintes
  { descricao: 'fone bluetooth', valorCentavos: 34990, origemValor: 'TOTAL', dataCompra: '2026-07-08', numeroParcelas: 5, escopo: 'PESSOAL', dono: 'A', conta: C6, categoria: 'Compra Online' },
  { descricao: 'pneu dianteiro', valorCentavos: 78000, origemValor: 'TOTAL', dataCompra: '2026-07-15', numeroParcelas: 6, escopo: 'PESSOAL', dono: 'B', conta: C6, categoria: 'Veiculo' },
  { descricao: 'jogo novo', valorCentavos: 24900, origemValor: 'TOTAL', dataCompra: '2026-07-25', numeroParcelas: 3, escopo: 'PESSOAL', dono: 'B', conta: C6, categoria: 'Jogo' },

  // Conjunto parcelado: o rateio tem que dividir o valor DA PARCELA, nao o total
  { descricao: 'cadeira de escritorio', valorCentavos: 119900, origemValor: 'TOTAL', dataCompra: '2026-07-10', numeroParcelas: 10, escopo: 'CONJUNTO', dono: 'CONJUNTO', conta: C6, categoria: 'Compra Online' },

  // Reembolso de terceiro: entra na fatura, sai do gasto do casal
  { descricao: 'remedio de terceiro', valorCentavos: 21000, origemValor: 'POR_PARCELA', dataCompra: '2026-07-18', numeroParcelas: 1, escopo: 'PESSOAL', dono: 'A', conta: C6, categoria: 'Medicacao', reembolso: 'Tia Cida' },

  // Conta externa: nao entra em fatura, serve para testar o filtro dos chips
  { descricao: 'boleto do condominio', valorCentavos: 64000, origemValor: 'POR_PARCELA', dataCompra: '2026-08-03', numeroParcelas: 1, escopo: 'CONJUNTO', dono: 'CONJUNTO', conta: EXTERNA, categoria: 'Compra Online' },

  // Estorno: valor negativo, para a fatura fechar quando houve devolucao
  { descricao: 'estorno livraria', valorCentavos: -8990, origemValor: 'POR_PARCELA', dataCompra: '2026-07-28', numeroParcelas: 1, escopo: 'PESSOAL', dono: 'A', conta: C6, categoria: 'Compra Online' },
];

/** Casa o nome da categoria ignorando acento, porque o seed usa "Veículo". */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function criar(): Promise<void> {
  if (existsSync(ARQUIVO_IDS)) {
    console.error('Ja existem dados ficticios gravados. Rode "limpar" antes de criar de novo.');
    process.exit(1);
  }

  const membros = await prisma.membro.findMany({ orderBy: { criadoEm: 'asc' } });
  if (membros.length < 2) throw new Error('Seed nao rodou: menos de dois membros no banco.');
  const [membroA, membroB] = membros;
  if (!membroA || !membroB) throw new Error('Seed nao rodou: membros faltando.');

  const categorias = await prisma.categoria.findMany();
  const acharCategoria = (nome: string): string => {
    const achada = categorias.find((c) => semAcento(c.nome) === semAcento(nome));
    if (!achada) throw new Error(`Categoria nao encontrada: ${nome}`);
    return achada.id;
  };

  const ids: string[] = [];

  for (const s of SEMENTES) {
    const entrada: EntradaLancamento = {
      descricao: s.descricao,
      valorCentavos: s.valorCentavos,
      origemValor: s.origemValor,
      dataCompra: s.dataCompra,
      numeroParcelas: s.numeroParcelas,
      escopo: s.escopo,
      contaId: s.conta,
      categoriaId: acharCategoria(s.categoria),
      ...(s.dono === 'CONJUNTO' ? {} : { membroId: s.dono === 'A' ? membroA.id : membroB.id }),
    };

    const resultado = await criarLancamento(entrada);
    if (!resultado.ok) {
      console.error(`Recusado (${resultado.motivo}): ${s.descricao}`);
      continue;
    }
    ids.push(resultado.id);

    if (s.reembolso) {
      await prisma.lancamento.update({
        where: { id: resultado.id },
        data: { devedorNome: s.reembolso, statusReembolso: 'PENDENTE' },
      });
    }
  }

  writeFileSync(ARQUIVO_IDS, JSON.stringify(ids, null, 2));

  const parcelas = await prisma.parcela.count({ where: { lancamentoId: { in: ids } } });
  console.log(`Criados ${ids.length} lancamentos e ${parcelas} parcelas.`);
  console.log(`Membro A = ${membroA.nome} | Membro B = ${membroB.nome}`);
  console.log('Olhe em http://localhost:3000/despesas?competencia=2026-08');
  console.log('Para apagar: npx tsx scripts/dados-ficticios.ts limpar');
}

async function limpar(): Promise<void> {
  if (!existsSync(ARQUIVO_IDS)) {
    console.error('Nao ha registro de dados ficticios. Nada foi apagado, de proposito:');
    console.error('sem a lista de ids eu nao sei o que e ficticio e o que e seu.');
    process.exit(1);
  }

  const ids: string[] = JSON.parse(readFileSync(ARQUIVO_IDS, 'utf8'));
  const apagados = await prisma.lancamento.deleteMany({ where: { id: { in: ids } } });
  unlinkSync(ARQUIVO_IDS);
  console.log(`Apagados ${apagados.count} lancamentos ficticios (parcelas e rateios em cascata).`);
}

const comando = process.argv[2];
const acoes: Record<string, () => Promise<void>> = { criar, limpar };
const acao = comando ? acoes[comando] : undefined;

if (!acao) {
  console.error('Uso: npx tsx scripts/dados-ficticios.ts [criar|limpar]');
  process.exit(1);
}

acao()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
