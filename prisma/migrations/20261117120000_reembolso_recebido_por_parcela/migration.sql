-- O recebido de um reembolso passa do lancamento para a parcela: um parcelado
-- se devolve mes a mes, e a marca no lancamento valia para todos os meses de
-- uma vez (docs/decisoes.md).

-- AlterTable
ALTER TABLE "Parcela" ADD COLUMN     "reembolsoRecebido" BOOLEAN NOT NULL DEFAULT false;

-- Leva o que ja estava marcado: lancamento RECEBIDO vira todas as parcelas
-- recebidas, que e exatamente o que a tela mostrava antes desta migration.
-- Desmarcar o mes que ainda nao foi pago fica com quem sabe.
UPDATE "Parcela" AS p
SET "reembolsoRecebido" = true
FROM "Lancamento" AS l
WHERE p."lancamentoId" = l."id" AND l."statusReembolso" = 'RECEBIDO';

-- No lancamento sobra so a marca de "e reembolso".
UPDATE "Lancamento"
SET "statusReembolso" = 'PENDENTE'
WHERE "statusReembolso" = 'RECEBIDO';
