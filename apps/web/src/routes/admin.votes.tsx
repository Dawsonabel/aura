import { createFileRoute } from '@tanstack/react-router';
import { useAdminVotes } from '../hooks/useAdminVotes';
import { useDeleteVote } from '../hooks/useDeleteVote';

export const Route = createFileRoute('/admin/votes')({
  component: Votes
});

export function Votes() {
  const { data: votes } = useAdminVotes(300);
  const deleteVote = useDeleteVote();

  function removeVote(id: string) {
    if (!confirm('Delete this vote?')) return;
    deleteVote.mutate(id);
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Activity</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Voter</th>
            <th className="p-2">Received by</th>
            <th className="p-2">Prompt</th>
            <th className="p-2">When</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(votes ?? []).map(v => (
            <tr key={v.id} className="border-b">
              <td className="p-2">{v.voterName}</td>
              <td className="p-2">{v.targetName}</td>
              <td className="p-2">{v.text}</td>
              <td className="p-2">{new Date(v.ts).toLocaleString()}</td>
              <td className="p-2">
                <button type="button" onClick={() => removeVote(v.id)} className="text-red-600 underline">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
