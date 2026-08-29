-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('CARTAO', 'EXTERNA');

-- CreateEnum
CREATE TYPE "MeioPagamento" AS ENUM ('PIX', 'DEBITO', 'BOLETO', 'DINHEIRO');

-- CreateEnum
CREATE TYPE "EscopoLancamento" AS ENUM ('PESSOAL', 'CONJUNTO');

-- CreateEnum
CREATE TYPE "OrigemValor" AS ENUM ('POR_PARCELA', 'TOTAL');

-- CreateEnum
CREATE TYPE "StatusFatura" AS ENUM ('ABERTA', 'CONFERIDA', 'TRAVADA');

-- CreateEnum
CREATE TYPE "StatusReembolso" AS ENUM ('PENDENTE', 'RECEBIDO');

-- CreateTable
CREATE TABLE "Membro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "cor" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "diaFechamento" INTEGER,
    "diaVencimento" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Conta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL,
    "icone" TEXT,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "origemValor" "OrigemValor" NOT NULL DEFAULT 'POR_PARCELA',
    "dataCompra" TEXT NOT NULL,
    "numeroParcelas" INTEGER NOT NULL DEFAULT 1,
    "escopo" "EscopoLancamento" NOT NULL,
    "meioPagamento" "MeioPagamento",
    "devedorNome" TEXT,
    "statusReembolso" "StatusReembolso",
    "versao" INTEGER NOT NULL DEFAULT 1,
    "deletadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "contaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "membroId" TEXT,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcela" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "lancamentoId" TEXT NOT NULL,

    CONSTRAINT "Parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rateio" (
    "id" TEXT NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "membroId" TEXT NOT NULL,

    CONSTRAINT "Rateio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "dataFechamento" TEXT NOT NULL,
    "dataVencimento" TEXT NOT NULL,
    "valorRealCentavos" INTEGER,
    "status" "StatusFatura" NOT NULL DEFAULT 'ABERTA',
    "travadaEm" TIMESTAMP(3),
    "travadaPorMembroId" TEXT,
    "contaId" TEXT NOT NULL,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "tabela" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "membroId" TEXT,
    "diff" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Membro_email_key" ON "Membro"("email");

-- CreateIndex
CREATE INDEX "Membro_ativo_idx" ON "Membro"("ativo");

-- CreateIndex
CREATE INDEX "Conta_ativa_ordem_idx" ON "Conta"("ativa", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nome_key" ON "Categoria"("nome");

-- CreateIndex
CREATE INDEX "Lancamento_deletadoEm_idx" ON "Lancamento"("deletadoEm");

-- CreateIndex
CREATE INDEX "Lancamento_contaId_deletadoEm_idx" ON "Lancamento"("contaId", "deletadoEm");

-- CreateIndex
CREATE INDEX "Parcela_competencia_cancelada_idx" ON "Parcela"("competencia", "cancelada");

-- CreateIndex
CREATE UNIQUE INDEX "Parcela_lancamentoId_numero_key" ON "Parcela"("lancamentoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Rateio_lancamentoId_membroId_key" ON "Rateio"("lancamentoId", "membroId");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_contaId_competencia_key" ON "Fatura"("contaId", "competencia");

-- CreateIndex
CREATE INDEX "Auditoria_tabela_registroId_idx" ON "Auditoria"("tabela", "registroId");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_membroId_fkey" FOREIGN KEY ("membroId") REFERENCES "Membro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rateio" ADD CONSTRAINT "Rateio_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rateio" ADD CONSTRAINT "Rateio_membroId_fkey" FOREIGN KEY ("membroId") REFERENCES "Membro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
