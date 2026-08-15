import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/tanstack-react-start';
import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { queryClient } from '../lib/queryClient';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Aura' }
    ],
    links: [{ rel: 'stylesheet', href: appCss }]
  }),
  // shellComponent is always prerendered as the static SPA-mode shell; component is the
  // client-rendered Outlet content it wraps — see TanStack Start's SPA-mode docs.
  shellComponent: RootDocument,
  component: () => <Outlet />
});

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}
