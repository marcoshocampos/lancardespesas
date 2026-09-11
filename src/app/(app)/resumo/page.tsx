import { FaixaCompetencia } from '@/components/casco/faixa-competencia';
import { CartoesResumo } from '@/components/resumo/cartoes-resumo';
import { ConferenciaFatura } from '@/components/resumo/conferencia-fatura';
import { MatrizResumo } from '@/components/resumo/matriz-resumo';
import { calcularResumo } from '@/domain/totais';
import { prisma } from '@/server/db';
import { carregarFatura } from '@/server/repositorios/fatura';
import { carregarParcelasDaCompetencia } from '@/server/repositorios/resumo';
import { competenciaAtual } from '@/app/competencia-atual';

type Props = { searchParams: Promise<{ competencia?: string }> };

export default async function Resumo({ searchParams }: Props) {
  const { competencia = competenciaAtual() } = await searchParams;

  const [membros, todasAsContas, parcelas] = await Promise.all([
    prisma.membro.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
    // Sem `where: { ativa: true }`, pelo mesmo motivo de `despesas/page.tsx`:
    // uma conta desativada que ainda tem parcela nesta competencia precisa
    // estar no conjunto que alimenta `calcularResumo`, ou o mes nao abre.
    prisma.conta.findMany({ orderBy: { ordem: 'asc' } }),
    carregarParcelasDaCompetencia(competencia),
  ]);

  const membroIds = membros.map((m) => m.id);

  // Esta tela nao oferece nada para lancar, entao aqui existe uma lista so: a
  // do mes. `ativa` decide o que se pode gastar daqui pra frente, e nada nesta
  // pagina gasta — tudo aqui descreve o que ja aconteceu. Os ids saem das
  // parcelas ja carregadas, sem consulta nova. Efeito: uma conta aposentada
  // vira coluna nos meses em que teve movimento e some nos que nao teve.
  const comParcelaNoMes = new Set(parcelas.map((p) => p.contaId));
  const contasDoMes = todasAsContas.filter((c) => c.ativa || comParcelaNoMes.has(c.id));

  const resumo = calcularResumo(parcelas, membroIds, contasDoMes.map((c) => c.id));

  // Inclui cartao aposentado que ainda tem parcela no mes. Um parcelado nao
  // some junto com o cartao: a fatura continua chegando, e conferir contra o
  // extrato e justamente o que sobra pra fazer com ela. Sem isto, a matriz
  // mostraria a coluna e o Somado do cartao e a faixa de conferencia nao
  // existiria para explicar esse numero — a mesma pagina dizendo duas coisas.
  const contasCartao = contasDoMes.filter((c) => c.tipo === 'CARTAO');
  const faturasPorConta = Object.fromEntries(
    await Promise.all(
      contasCartao.map(async (c) => [c.id, await carregarFatura(c.id, competencia)] as const),
    ),
  );

  // Os cartoes so precisam do numero do extrato; a faixa de conferencia
  // tambem precisa do status. Uma consulta so, lida de dois jeitos.
  const valoresReaisPorConta = Object.fromEntries(
    contasCartao.map((c) => [c.id, faturasPorConta[c.id]?.valorRealCentavos ?? null] as const),
  );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <FaixaCompetencia competencia={competencia} rota="/resumo" />

      <h1 className="mt-4 mb-4 text-xl font-semibold">Resumo</h1>
      <CartoesResumo
        resumo={resumo}
        membros={membros}
        contasCartao={contasCartao}
        valoresReaisPorConta={valoresReaisPorConta}
      />
      <MatrizResumo
        resumo={resumo}
        competencia={competencia}
        membros={membros}
        // Pelas contas do mes, o mesmo conjunto de `resumo.contas`: nome que
        // faltasse aqui viraria um cuid cru no cabecalho da coluna.
        nomesDeConta={Object.fromEntries(contasDoMes.map((c) => [c.id, c.nome]))}
      />
      <div className="mt-4 space-y-3">
        {contasCartao.map((c) => (
          <ConferenciaFatura
            key={c.id}
            contaId={c.id}
            competencia={competencia}
            nome={c.nome}
            somado={resumo.somado[c.id] ?? 0}
            valorReal={faturasPorConta[c.id]?.valorRealCentavos ?? null}
            // Fatura sem linha na tabela ainda esta ABERTA: nao ha registro
            // porque ninguem conferiu, nao porque o mes fechou.
            status={faturasPorConta[c.id]?.status ?? 'ABERTA'}
          />
        ))}
      </div>
    </div>
  );
}
