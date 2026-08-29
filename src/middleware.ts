export { auth as middleware } from '@/server/auth';

export const config = {
  matcher: ['/((?!api/auth|entrar|_next/static|_next/image|favicon.ico).*)'],
};
