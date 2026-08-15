import { createFileRoute } from '@tanstack/react-router';
import { SignUp } from '@clerk/tanstack-react-start';

export const Route = createFileRoute('/sign-up/$')({
  component: () => (
    <main className="flex min-h-screen items-center justify-center">
      <SignUp />
    </main>
  )
});
