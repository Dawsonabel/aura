import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/about')({
  component: () => <h1 className="text-xl font-semibold">About</h1>
});
