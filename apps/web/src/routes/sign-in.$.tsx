import { createFileRoute } from '@tanstack/react-router';
import { SignIn } from '@clerk/tanstack-react-start';

export const Route = createFileRoute('/sign-in/$')({
  component: () => (
    <main className="flex min-h-screen items-center justify-center">
      <SignIn />
    </main>
  )
});
