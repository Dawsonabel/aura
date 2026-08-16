import { createFileRoute } from '@tanstack/react-router';
import { useAdminPolls } from '../hooks/useAdminPolls';
import { useCreatePoll } from '../hooks/useCreatePoll';
import { useUpdatePoll } from '../hooks/useUpdatePoll';
import { useDeletePoll } from '../hooks/useDeletePoll';

export const Route = createFileRoute('/admin/polls')({
  component: Polls
});

export function Polls() {
  const { data: polls } = useAdminPolls();
  const createPoll = useCreatePoll();
  const updatePoll = useUpdatePoll();
  const deletePoll = useDeletePoll();

  function addPoll() {
    const emoji = prompt('Emoji:');
    if (!emoji) return;
    const text = prompt('Prompt text:');
    if (!text) return;
    const color = prompt('Color (hex):', '#A31CEE') || '#A31CEE';
    createPoll.mutate({ emoji, text, color });
  }

  function editPoll(id: string, emoji: string, text: string) {
    const newEmoji = prompt('Emoji:', emoji);
    if (newEmoji === null) return;
    const newText = prompt('Prompt text:', text);
    if (newText === null) return;
    updatePoll.mutate({ id, emoji: newEmoji, text: newText });
  }

  function removePoll(id: string) {
    if (!confirm('Delete this poll question?')) return;
    deletePoll.mutate(id);
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Poll Questions</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Emoji</th>
            <th className="p-2">Prompt</th>
            <th className="p-2">Scope</th>
            <th className="p-2">Enabled</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(polls ?? []).map(p => (
            <tr key={p.id} className="border-b">
              <td className="p-2 text-xl">{p.emoji}</td>
              <td className="p-2">{p.text}</td>
              <td className="p-2">{p.schoolId ? 'One school' : 'All schools'}</td>
              <td className="p-2">
                <input type="checkbox" checked={p.enabled} onChange={e => updatePoll.mutate({ id: p.id, enabled: e.target.checked })} />
              </td>
              <td className="flex gap-2 p-2">
                <button type="button" onClick={() => editPoll(p.id, p.emoji, p.text)} className="underline">
                  Edit
                </button>
                <button type="button" onClick={() => removePoll(p.id)} className="text-red-600 underline">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addPoll} className="mt-4 rounded bg-black px-4 py-2 text-white">
        + Add prompt
      </button>
    </div>
  );
}
