import { Button } from '@/components/ui/button';
import { signIn } from '@/server/auth';

export default function Entrar() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Despesas</h1>
          <p className="mt-1 text-sm text-tinta-fraca">Acesso restrito.</p>
        </div>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/despesas' });
          }}
        >
          <Button type="submit" className="w-full">
            Entrar com Google
          </Button>
        </form>
      </div>
    </main>
  );
}
