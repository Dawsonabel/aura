import { createFileRoute } from '@tanstack/react-router';
import { useAdminReports } from '../hooks/useAdminReports';
import { useResolveReport } from '../hooks/useResolveReport';

export const Route = createFileRoute('/admin/reports')({
  component: Reports
});

export function Reports() {
  const { data: reports } = useAdminReports();
  const resolveReport = useResolveReport();

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Reports</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Reported by</th>
            <th className="p-2">Target</th>
            <th className="p-2">Reason</th>
            <th className="p-2">Status</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(reports ?? []).map(r => (
            <tr key={r.id} className="border-b">
              <td className="p-2">{r.byName}</td>
              <td className="p-2">{r.targetName}</td>
              <td className="p-2">{r.reason}</td>
              <td className="p-2">{r.status}</td>
              <td className="p-2">
                {r.status === 'open' && (
                  <button type="button" onClick={() => resolveReport.mutate(r.id)} className="underline">
                    Resolve
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
