import { PrismaClient, TipoConta } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIAS = [
  { nome: 'Veículo', cor: '#1B7C90' },
  { nome: 'Compra Online', cor: '#A8710F' },
  { nome: 'Beleza', cor: '#9C4275' },
  { nome: 'Medicação', cor: '#4F7A16' },
  { nome: 'Presente', cor: '#B33A2B' },
  { nome: 'Assinatura', cor: '#5A4FCF' },
  { nome: 'Jogo', cor: '#2F6FB3' },
  { nome: 'Terceiros', cor: '#7A7A7A' },
];

const CORES_MEMBRO = ['#A8710F', '#9C4275'];

async function main() {
  const emails = (process.env.EMAILS_AUTORIZADOS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error('EMAILS_AUTORIZADOS vazio. Preencha .env.local antes de rodar o seed.');
  }

  for (const [indice, email] of emails.entries()) {
    const nomeDerivado = email.split('@')[0] ?? email;
    await prisma.membro.upsert({
      where: { email },
      update: {},
      create: {
        email,
        nome: nomeDerivado.charAt(0).toUpperCase() + nomeDerivado.slice(1),
        cor: CORES_MEMBRO[indice] ?? '#666666',
      },
    });
  }

  await prisma.conta.upsert({
    where: { id: 'conta-c6' },
    update: {},
    create: {
      id: 'conta-c6',
      nome: 'C6',
      tipo: TipoConta.CARTAO,
      cor: '#1B1B1B',
      diaFechamento: 4,
      diaVencimento: 10,
      ordem: 1,
    },
  });

  await prisma.conta.upsert({
    where: { id: 'conta-externa' },
    update: {},
    create: {
      id: 'conta-externa',
      nome: 'Externa',
      tipo: TipoConta.EXTERNA,
      cor: '#4F7A16',
      ordem: 2,
    },
  });

  for (const categoria of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { nome: categoria.nome },
      update: {},
      create: categoria,
    });
  }
}

main()
  .then(() => console.log('Seed concluido.'))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
