import { useEffect } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Show } from '@clerk/tanstack-react-start';
import { useMe } from '../hooks/useMe';
import { useAdminStats } from '../hooks/useAdminStats';

export const Route = createFileRoute('/')({
  component: Home
});

export function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Aura</h1>
      <Show when="signed-out">
        <Link to="/sign-in/$" params={{ _splat: '' }} className="underline">
          Sign in
        </Link>
      </Show>
      <Show when="signed-in">
        <SignedInGate />
      </Show>
    </main>
  );
}

/* Signed in has nothing to show at `/` itself — just routes on to wherever they actually belong.
   Admins never get a `me` row (see getOrCreateUserByClerkId — deliberately skipped for admin
   claims), so `useMe()` always errors for them; without also trying `useAdminStats()` (itself
   admin-gated, so success = admin) an admin sign-in would sit on "Loading…" forever. Whichever
   query actually succeeds decides where to go. */
function SignedInGate() {
  const me = useMe();
  const adminStats = useAdminStats();
  const navigate = useNavigate();

  useEffect(() => {
    if (me.data) {
      navigate({ to: me.data.onboarded === false ? '/onboarding' : '/aura' });
    } else if (adminStats.data) {
      navigate({ to: '/admin' });
    }
  }, [me.data, adminStats.data, navigate]);

  return <p>Loading…</p>;
}
