import { createFileRoute, Link } from '@tanstack/react-router';
import { Show, UserButton } from '@clerk/tanstack-react-start';
import { useMe } from '../hooks/useMe';

export const Route = createFileRoute('/')({
  component: Home
});

function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Aura</h1>
      <Show when="signed-out">
        <Link to="/sign-in/$" params={{ _splat: '' }} className="underline">
          Sign in
        </Link>
      </Show>
      <Show when="signed-in">
        <UserButton />
        <Me />
      </Show>
    </main>
  );
}

function Me() {
  const { data, isLoading, error } = useMe();

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="font-medium">id</dt>
      <dd>{data.id}</dd>
      <dt className="font-medium">coins</dt>
      <dd>{data.coins}</dd>
      <dt className="font-medium">onboarded</dt>
      <dd>{String(data.onboarded)}</dd>
    </dl>
  );
}
