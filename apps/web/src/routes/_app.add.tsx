import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useSuggestions, type SuggestedUser } from '../hooks/useSuggestions';
import { useAddFriend } from '../hooks/useAddFriend';

export const Route = createFileRoute('/_app/add')({
  component: Add
});

function initials(u: SuggestedUser): string {
  return `${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.toUpperCase();
}

export function Add() {
  const { data, isLoading } = useSuggestions();
  const addFriend = useAddFriend();
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  if (isLoading || !data) return <p>Loading…</p>;

  const q = query.toLowerCase();
  const matches = (u: SuggestedUser) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q);
  const visible = (list: SuggestedUser[]) => list.filter(u => !hidden.has(u.id) && matches(u));

  const contacts = visible(data.contacts);
  const fof = visible(data.fof);

  function hide(id: string) {
    setHidden(prev => new Set(prev).add(id));
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        placeholder="Search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="rounded border px-3 py-2"
      />

      {contacts.length > 0 && <Section title="Contacts on Aura" users={contacts} showGrade onHide={hide} onAdd={id => addFriend.mutate(id)} />}
      {fof.length > 0 && <Section title="Friends of Friends" users={fof} showGrade={false} onHide={hide} onAdd={id => addFriend.mutate(id)} />}
      {contacts.length === 0 && fof.length === 0 && <p className="text-gray-500">No one to add right now</p>}
    </div>
  );
}

function Section({
  title,
  users,
  showGrade,
  onHide,
  onAdd
}: {
  title: string;
  users: SuggestedUser[];
  showGrade: boolean;
  onHide: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase text-gray-500">{title}</h2>
      {users.map(u => (
        <div key={u.id} className="flex items-center gap-3 rounded border p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-medium">{initials(u)}</div>
          <div className="flex-1">
            <div className="font-medium">
              {u.firstName} {u.lastName}
            </div>
            {showGrade && u.grade && <div className="text-sm text-gray-500">{u.grade}</div>}
          </div>
          <button type="button" onClick={() => onHide(u.id)} className="rounded border px-2 py-1 text-xs">
            HIDE
          </button>
          <button type="button" onClick={() => onAdd(u.id)} className="rounded bg-black px-3 py-1 text-xs text-white">
            ADD
          </button>
        </div>
      ))}
    </div>
  );
}
