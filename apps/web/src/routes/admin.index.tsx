import { createFileRoute } from '@tanstack/react-router';
import { useAdminStats } from '../hooks/useAdminStats';

export const Route = createFileRoute('/admin/')({
  component: Overview
});

const TILES: { key: 'schools' | 'users' | 'polls' | 'votes' | 'infiniteAura' | 'reports'; label: string }[] = [
  { key: 'schools', label: 'Schools' },
  { key: 'users', label: 'Users' },
  { key: 'polls', label: 'Poll questions' },
  { key: 'votes', label: 'Votes cast' },
  { key: 'infiniteAura', label: 'Infinite Aura users' },
  { key: 'reports', label: 'Open reports' }
];

export function Overview() {
  const { data: stats } = useAdminStats();

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Overview</h2>
      <div className="grid grid-cols-3 gap-4">
        {TILES.map(t => (
          <div key={t.key} className="rounded border p-4">
            <div className="text-2xl font-bold">{stats?.[t.key] ?? '—'}</div>
            <div className="text-sm text-gray-500">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
