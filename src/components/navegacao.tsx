import { avancarCompetencia, formatarCompetencia, type Competencia } from '@/domain/competencia';

type Tela = 'despesas' | 'resumo';

type Props = {
  tela: Tela;
  competencia: Competencia;
  conta: string | undefined;
};

const TELAS: { tela: Tela; rota: string; rotulo: string }[] = [
  { tela: 'despesas', rota: '/despesas', rotulo: 'Despesas' },
  { tela: 'resumo', rota: '/resumo', rotulo: 'Resumo' },
];

/**
 * Casco de navegacao no topo das telas.
 *
 * Trocar de tela preserva a competencia — a conta fica de fora porque o Resumo nao
 * tem esse filtro, entao nao ha o que preservar nesse sentido. Trocar de mes fica
 * na mesma tela e preserva o filtro de conta, quando ele existir.
 */
export function Navegacao({ tela, competencia, conta }: Props) {
  const rotaAtual = tela === 'despesas' ? '/despesas' : '/resumo';
  const sufixoConta = conta ? `&conta=${conta}` : '';
  const anterior = avancarCompetencia(competencia, -1);
  const proxima = avancarCompetencia(competencia, 1);

  return (
    <div className="flex flex-col gap-3 border-b pb-4">
      <nav className="flex gap-2">
        {TELAS.map((t) => (
          <a
            key={t.tela}
            href={`${t.rota}?competencia=${competencia}`}
            className={`rounded-full border px-3 py-1 text-sm ${tela === t.tela ? 'bg-neutral-900 text-white' : ''}`}
          >
            {t.rotulo}
          </a>
        ))}
      </nav>
      <nav className="flex items-center gap-3" aria-label="Navegação de mês">
        <a
          href={`${rotaAtual}?competencia=${anterior}${sufixoConta}`}
          className="rounded-full border px-3 py-1 text-sm"
        >
          ‹ {formatarCompetencia(anterior)}
        </a>
        <span className="text-sm font-semibold">{formatarCompetencia(competencia)}</span>
        <a
          href={`${rotaAtual}?competencia=${proxima}${sufixoConta}`}
          className="rounded-full border px-3 py-1 text-sm"
        >
          {formatarCompetencia(proxima)} ›
        </a>
      </nav>
    </div>
  );
}
