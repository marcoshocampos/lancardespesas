import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { loginPermitido } from './auth-regras';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/entrar' },
  callbacks: {
    signIn({ profile }) {
      return loginPermitido(profile, process.env.EMAILS_AUTORIZADOS ?? '');
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
