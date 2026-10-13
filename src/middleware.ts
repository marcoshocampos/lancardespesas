export { auth as middleware } from '@/server/auth';

/**
 * Tudo exige sessao, menos o que o proprio login precisa e os arquivos estaticos.
 *
 * `.*\.[^/]+$` — qualquer caminho terminado em `.extensao` — cobre o que mora em
 * `public/`. Sem isso o middleware intercepta arquivo estatico e responde com
 * redirecionamento para o login: `/robots.txt` devolvia **307 para `/entrar`** em
 * producao, e um buscador leria a tela de login no lugar do arquivo. O mesmo
 * valeria para `manifest.json`, `sitemap.xml` e qualquer imagem publica.
 *
 * Nenhuma rota deste sistema tem ponto no caminho (`/despesas`, `/resumo`,
 * `/configuracoes`, `/entrar`), entao a regra nao abre buraco. **Se um dia
 * existir rota com ponto, ela nasce desprotegida** — e o jeito de notar isso e
 * este comentario, porque o sintoma seria uma pagina privada abrindo sem login.
 *
 * `favicon.ico` saiu da lista por ficar coberto pela regra nova; mante-lo era
 * sugerir que arquivo estatico precisa de excecao nominal, que e justamente o
 * que deu errado.
 */
export const config = {
  matcher: ['/((?!api/auth|entrar|_next/static|_next/image|.*\\.[^/]+$).*)'],
};
