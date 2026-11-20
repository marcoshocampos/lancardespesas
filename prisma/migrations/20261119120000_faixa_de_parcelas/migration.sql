-- Um lancamento passa a ser uma FAIXA das parcelas de uma compra: editar ou
-- excluir so parte de um parcelado divide o lancamento, e cada pedaco guarda a
-- sua. Os lancamentos existentes ficam com a faixa inteira (1 ate o fim), que
-- e o que eles ja sao. So de adicao: o codigo de antes continua funcionando com
-- o banco novo (docs/arquitetura.md, armadilha 23).

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "parcelaFinal" INTEGER,
ADD COLUMN     "parcelaInicial" INTEGER NOT NULL DEFAULT 1;
