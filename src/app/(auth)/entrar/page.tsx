import { signIn } from '@/server/auth';

export default function Entrar() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Despesas</h1>
          <p className="mt-1 text-sm text-neutral-500">Acesso restrito.</p>
        </div>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/despesas' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50"
          >
            Entrar com Google
          </button>
        </form>
      </div>
    </main>
  );
}
