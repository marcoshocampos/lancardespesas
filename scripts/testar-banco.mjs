#!/usr/bin/env node
/**
 * Roda a suite inteira COM os testes de banco, contra a branch "dev" do Neon.
 *
 *   npm run test:banco
 *
 * Os 12 testes de banco ficam atras de `TESTE_DESTRUTIVO=1` porque apagam
 * lancamento, parcela, rateio e fatura do banco apontado por `DATABASE_URL`.
 * Ate existir este runner, liga-los exigia exportar as duas variaveis na mao —
 * e errar a `DATABASE_URL` apagava a financa real do casal.
 *
 * O ponto deste arquivo e que isso deixe de ser possivel:
 *
 * - le `DATABASE_URL_TESTE` do `.env` e **ignora** a `DATABASE_URL` de verdade;
 * - recusa rodar se as duas apontarem para o mesmo endpoint do Neon;
 * - recusa rodar se a variavel de teste nao existir, em vez de cair no padrao.
 *
 * A suite tem a propria guarda (recusa banco que ja tem lancamento), mas ela
 * protege o conteudo; esta protege o endereco. As duas erram de formas
 * diferentes, entao as duas ficam.
 *
 * Sem dependencia nova de proposito: `dotenv` e `cross-env` nao estao no
 * projeto, e ler uma chave de um arquivo de texto nao justifica instalar nada.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ARQUIVO_ENV = '.env';

/** Le uma chave do .env. Corta no PRIMEIRO `=`: a URL tem `=` na query string. */
function lerDoEnv(chave) {
  if (!existsSync(ARQUIVO_ENV)) return null;
  for (const linha of readFileSync(ARQUIVO_ENV, 'utf8').split(/\r?\n/)) {
    const limpa = linha.trim();
    if (limpa.startsWith('#') || !limpa.includes('=')) continue;
    const corte = limpa.indexOf('=');
    if (limpa.slice(0, corte).trim() !== chave) continue;
    return limpa
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return null;
}

/** O endpoint do Neon, que e o primeiro rotulo do host. E o que distingue branches. */
function endpoint(url) {
  try {
    return new URL(url).host.split('.')[0];
  } catch {
    return null;
  }
}

function abortar(mensagem) {
  console.error(`\n${mensagem}\n`);
  process.exit(1);
}

const urlTeste = lerDoEnv('DATABASE_URL_TESTE');
if (!urlTeste) {
  abortar(
    'DATABASE_URL_TESTE nao esta no .env.\n' +
      'Crie uma branch no Neon so para teste e aponte essa variavel para ela.\n' +
      'NAO use a URL de producao: esta suite apaga todo lancamento que encontrar.',
  );
}

const urlProducao = lerDoEnv('DATABASE_URL');
if (urlProducao && endpoint(urlProducao) === endpoint(urlTeste)) {
  abortar(
    'DATABASE_URL_TESTE aponta para o MESMO endpoint da DATABASE_URL.\n' +
      'Recuso rodar: a suite apagaria a financa real do casal.',
  );
}

console.log(`Testes de banco contra o endpoint ${endpoint(urlTeste)} (nao o de producao).\n`);

/**
 * Traz o banco de teste para o schema atual ANTES de rodar a suite.
 *
 * Sem isto, toda migration nova exigia alguem lembrar de aplica-la tambem no
 * banco de teste — e o esquecimento aparecia como dezenas de testes quebrando
 * com "column does not exist", que parece bug de codigo e e so banco atrasado.
 * `migrate deploy` e idempotente: sem migration pendente, nao faz nada.
 *
 * A URL direta sai da de teste tirando o `-pooler` do host, que e a convencao
 * do Neon. Migration nao pode ir pelo pooler: ela usa advisory lock, que o
 * PgBouncer em modo transacao nao sustenta. As duas variaveis sao passadas
 * explicitamente porque o schema declara `directUrl = env("DIRECT_URL")`, e
 * sem sobrescrever o CLI leria a DIRECT_URL do .env — a de PRODUCAO.
 */
const urlTesteDireta = urlTeste.replace('-pooler.', '.');
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const migracao = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: urlTesteDireta, DIRECT_URL: urlTesteDireta },
});
if (migracao.status !== 0) {
  abortar('Nao consegui aplicar as migrations no banco de teste. A suite nao rodou.');
}

/**
 * `--no-file-parallelism` nao e opcional aqui.
 *
 * O Vitest roda ARQUIVOS em paralelo, e os tres arquivos de teste de banco
 * compartilham um banco so. O `limpar()` de `lancamento.test.ts` faz
 * `deleteMany()` enquanto `resumo.test.ts` esta no meio de um caso, e o
 * resultado sao falhas que parecem bug de producao e nao sao: na primeira vez
 * que esta suite rodou, deu "No record was found" numa leitura logo depois de
 * uma gravacao bem-sucedida, e uma sobra de centavos indo para o membro errado.
 * As duas sumiram em serie, com os mesmos 130 testes.
 *
 * Nao troque por paralelismo "para ficar mais rapido" sem antes dar a cada
 * arquivo o seu proprio banco. Onze segundos em serie custam menos que uma
 * tarde atras de um bug que nao existe.
 */
/**
 * Chama o vitest.mjs pelo caminho, com o node que ja esta rodando — nao `npx`
 * com `shell: true`. Shell no Windows era o unico jeito de achar o `npx`, e o
 * Node avisa (DEP0190) que argumento passado com shell nao e escapado, so
 * concatenado. Aqui chegam argumentos da linha de comando do usuario
 * (`npm run test:banco -- -t "nome do caso"`), entao a observacao procede.
 * Resolver o caminho do pacote dispensa o shell e o `npx`.
 *
 * O caminho e montado a partir da localizacao deste arquivo, e nao por
 * `import.meta.resolve('vitest/vitest.mjs')`: esse subcaminho nao esta nos
 * `exports` do pacote e a resolucao falha com ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
if (!existsSync(vitest)) {
  abortar(`Nao achei o vitest em ${vitest}. Rode \`npm install\`.`);
}

const filho = spawn(
  process.execPath,
  [vitest, 'run', '--no-file-parallelism', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: urlTeste, TESTE_DESTRUTIVO: '1' },
  },
);

filho.on('exit', (codigo) => process.exit(codigo ?? 1));
