import { useEffect } from 'react';
import { createFileRoute, Outlet, Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/tanstack-react-start';
import { useAdminStats } from '../hooks/useAdminStats';

export const Route = createFileRoute('/admin')({
  component: AdminLayout
});

const NAV: { to: '/admin' | '/admin/schools' | '/admin/users' | '/admin/polls' | '/admin/votes' | '/admin/reports' | '/admin/tuning'; label: string }[] = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/schools', label: 'Schools' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/polls', label: 'Polls' },
  { to: '/admin/votes', label: 'Votes' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/tuning', label: 'Tuning' }
];

export function AdminLayout() {
  const { isSignedIn } = useAuth();
  const adminStats = useAdminStats();
  const navigate = useNavigate();

  useEffect(() => {
    if (isSignedIn === false) navigate({ to: '/' });
    else if (adminStats.isError) navigate({ to: '/' });
  }, [isSignedIn, adminStats.isError, navigate]);

  if (!adminStats.data) return <p className="p-8">Loading…</p>;

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-48 flex-col gap-1 border-r p-4">
        <h1 className="mb-4 text-lg font-bold">Aura Admin</h1>
        {NAV.map(n => (
          <Link key={n.to} to={n.to} className="rounded px-2 py-1 hover:bg-gray-100" activeProps={{ className: 'bg-gray-200 font-semibold' }}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 p-6">
        <Outlet />
      </div>
    </div>
  );
}
