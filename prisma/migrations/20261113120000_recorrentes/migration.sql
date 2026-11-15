-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "competenciaRecorrente" TEXT,
ADD COLUMN     "recorrenteId" TEXT;

-- CreateTable
CREATE TABLE "Recorrente" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "escopo" "EscopoLancamento" NOT NULL,
    "diaDoMes" INTEGER NOT NULL,
    "competenciaInicio" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "membroId" TEXT,

    CONSTRAINT "Recorrente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recorrente_ativa_idx" ON "Recorrente"("ativa");

-- CreateIndex
CREATE UNIQUE INDEX "Lancamento_recorrenteId_competenciaRecorrente_key" ON "Lancamento"("recorrenteId", "competenciaRecorrente");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_recorrenteId_fkey" FOREIGN KEY ("recorrenteId") REFERENCES "Recorrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recorrente" ADD CONSTRAINT "Recorrente_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recorrente" ADD CONSTRAINT "Recorrente_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recorrente" ADD CONSTRAINT "Recorrente_membroId_fkey" FOREIGN KEY ("membroId") REFERENCES "Membro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

