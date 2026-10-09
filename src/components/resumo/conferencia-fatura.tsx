'use client';

import { useState, useTransition, type FormEvent } from 'react';
import type { StatusFatura } from '@prisma/client';
import { toast } from 'sonner';
import { SeloConferencia } from '@/components/resumo/selo-conferencia';
import { TravaFatura } from '@/components/resumo/trava-fatura';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { conferir } from '@/domain/conferencia';
import { formatarBRL, reaisParaCentavos } from '@/domain/money';
import { acaoRegistrarValorReal } from '@/server/actions/fatura';

type Props = {
  contaId: string;
  competencia: string;
  nome: string;
  somado: number;
  valorReal: number | null;
  status: StatusFatura;
};

/**
 * O estado da fatura em palavras. Sao tres, nao dois: `StatusFatura`
 * (`prisma/schema.prisma`) tem `ABERTA`, `CONFERIDA` e `TRAVADA`.
 *
 * `CONFERIDA` passou a ser escrita de verdade: `registrarValorReal` a grava
 * quando o extrato bate com o somado, e a desfaz quando o valor e corrigido
 * para um que nao bate. Antes nada a escrevia e o enum mentia sobre o que o
 * sistema fazia.
 *
 * `switch` sem `default` de proposito, como em `selo()`: no dia em que o enum
 * ganhar um valor, o TypeScript reclama aqui em vez de a tela mentir.
 */
function textoDoEstado(status: StatusFatura): string {
  switch (status) {
    case 'ABERTA':
      return 'Fatura aberta.';
    case 'CONFERIDA':
      return 'Fatura conferida.';
    case 'TRAVADA':
      return 'Fatura travada: o valor do extrato não pode mais ser alterado.';
  }
}

/**
 * A faixa onde se digita o que veio no extrato do cartao e se ve o quanto ele
 * diverge do que o sistema somou. Uma por conta de cartao, logo abaixo da
 * matriz.
 *
 * O selo da situacao e o mesmo objeto que o cartao la em cima usa
 * (`selo-conferencia.tsx`) — aqui ele fica ao lado do campo, no momento de
 * digitar; la em cima, para responder de longe.
 *
 * Fatura travada desabilita campo e botao, mas isso e cortesia: quem recusa e
 * o servidor (`registrarValorReal`), e a recusa tratavel continua virando
 * mensagem na tela porque a fatura pode travar entre o carregamento da pagina
 * e o envio.
 */
export function ConferenciaFatura({
  contaId,
  competencia,
  nome,
  somado,
  valorReal,
  status,
}: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const conferencia = conferir(somado, valorReal);
  const travada = status === 'TRAVADA';

  // Id previsivel por conta, como `idBotaoEditar` na grade: ha uma faixa por
  // cartao na mesma pagina, e `htmlFor`/`aria-describedby` precisam apontar
  // para o campo desta faixa, nao para o da primeira.
  const idCampo = `extrato-${contaId}`;
  const idEstado = `estado-fatura-${contaId}`;

  /**
   * `onSubmit` com `preventDefault`, e NAO `action={enviar}`: com `action`, o
   * React 19 reseta os campos nao controlados assim que a transicao do envio
   * termina. Medido numa reproducao com este mesmo arranjo: o campo voltou ao
   * valor gravado em t=806ms, no MESMO instante em que a mensagem de recusa
   * apareceu; o caso de controle com `onSubmit` + `preventDefault` preservou o
   * digitado ate o fim da amostragem (t=2001ms). Aqui isso apagaria o valor do
   * extrato recem-digitado justo quando o servidor recusa por fatura travada —
   * a unica recusa que esta faixa existe para mostrar. Mesma forma de
   * `lista-categorias.tsx` e de `painel-lancamento.tsx`. Nao "simplifique" de
   * volta para `action={}`.
   *
   * Isto nao conflita com o `key` do campo logo abaixo: quem remonta o campo
   * com o valor novo depois de salvar e a troca de `key`, nao o reset do React.
   */
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Lido agora, sincronamente: `currentTarget` e nulo depois que o handler retorna.
    const dados = new FormData(evento.currentTarget);

    setErro(null);

    let valorCentavos: number;
    try {
      valorCentavos = reaisParaCentavos(String(dados.get('valorReal') ?? ''));
    } catch {
      setErro('Valor inválido. Use o formato 1.234,56.');
      return;
    }

    iniciar(async () => {
      try {
        const resultado = await acaoRegistrarValorReal({ contaId, competencia, valorCentavos });
        if (!resultado.ok) {
          setErro('Essa fatura está travada. Destrave para registrar um novo valor do extrato.');
          return;
        }
        // Gravar o extrato nao muda nada visivel por si so — o numero volta a
        // aparecer no mesmo campo de onde saiu. Sem o aviso, a pessoa nao tem
        // como saber se salvou.
        toast.success(`Valor do extrato de ${nome} registrado`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  return (
    <section
      aria-label={`Conferência da fatura ${nome}`}
      className="rounded-caixa border border-borda bg-superficie px-5 py-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-tinta">{nome}</h2>
            <SeloConferencia situacao={conferencia.situacao} diferenca={conferencia.diferenca} />
          </div>
          <p id={idEstado} className="mt-1 text-xs text-tinta-fraca">
            {textoDoEstado(status)}
          </p>
        </div>

        <form onSubmit={enviar} className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={idCampo} className="text-xs font-normal text-tinta-fraca">
              Valor do extrato
            </Label>
            {/* `key` obriga o campo a reler o valor gravado depois de salvar:
                o campo e nao-controlado, e sem a troca de chave o
                `defaultValue` fica preso no valor antigo. */}
            <Input
              key={valorReal ?? 'vazio'}
              id={idCampo}
              name="valorReal"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={valorReal !== null ? formatarBRL(valorReal).replace('R$ ', '') : ''}
              disabled={travada}
              aria-describedby={idEstado}
              className="w-32 text-right tabular-nums"
            />
          </div>
          <Button type="submit" disabled={travada || pendente}>
            {pendente ? 'Salvando…' : 'Conferir'}
          </Button>
        </form>

        {/* Fora do `form` de proposito: e um gesto proprio, com confirmacao, e
            dentro do formulario o botao do dialogo disputaria o submit. */}
        <TravaFatura
          contaId={contaId}
          competencia={competencia}
          nome={nome}
          travada={travada}
          temExtrato={valorReal !== null}
        />
      </div>

      {erro && (
        <p role="alert" className="mt-3 text-sm text-negativo">
          {erro}
        </p>
      )}
    </section>
  );
}
