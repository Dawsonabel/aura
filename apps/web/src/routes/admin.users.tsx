import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useSchools } from '../hooks/useSchools';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useAdminUpdateUser } from '../hooks/useAdminUpdateUser';
import { useAdminDeleteUser } from '../hooks/useAdminDeleteUser';

const GRADES = ['9', '10', '11', '12', 'Not in High School', 'Already Graduated'];

export const Route = createFileRoute('/admin/users')({
  validateSearch: (search: Record<string, unknown>) => ({
    schoolId: typeof search.schoolId === 'string' ? search.schoolId : undefined
  }),
  component: Users
});

export function Users() {
  const { schoolId } = Route.useSearch();
  const { data: schools } = useSchools();
  const [schoolFilter, setSchoolFilter] = useState(schoolId ?? '');
  const [query, setQuery] = useState('');
  const { data: users } = useAdminUsers(schoolFilter || undefined);
  const updateUser = useAdminUpdateUser();
  const deleteUser = useAdminDeleteUser();

  const filtered = (users ?? []).filter(u => `${u.firstName} ${u.lastName} ${u.username || ''}`.toLowerCase().includes(query.toLowerCase()));

  function rename(id: string, firstName: string, lastName: string, username: string) {
    const newFirst = prompt('First name:', firstName);
    if (newFirst === null) return;
    const newLast = prompt('Last name:', lastName) ?? '';
    const newUsername = prompt('Username:', username) ?? '';
    updateUser.mutate({ id, firstName: newFirst, lastName: newLast, username: newUsername });
  }

  function remove(id: string) {
    if (!confirm('Delete this user and their votes?')) return;
    deleteUser.mutate(id);
  }

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold">Users</h2>
      <p className="mb-4 text-sm text-gray-500">Assign students to schools & grades, adjust coins, or toggle Infinite Aura.</p>

      <div className="mb-4 flex gap-2">
        <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)} className="rounded border px-2 py-1">
          <option value="">All schools</option>
          {(schools ?? []).map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input placeholder="Search name…" value={query} onChange={e => setQuery(e.target.value)} className="rounded border px-2 py-1" />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Name</th>
            <th className="p-2">Username</th>
            <th className="p-2">School</th>
            <th className="p-2">Grade</th>
            <th className="p-2">Coins</th>
            <th className="p-2">God</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(u => (
            <tr key={u.id} className="border-b">
              <td className="p-2">
                {u.firstName} {u.lastName}
              </td>
              <td className="p-2">@{u.username}</td>
              <td className="p-2">
                <select
                  value={u.schoolId ?? ''}
                  onChange={e => updateUser.mutate({ id: u.id, schoolId: e.target.value || undefined })}
                  className="rounded border px-1"
                >
                  <option value="">— none —</option>
                  {(schools ?? []).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <select value={u.grade ?? ''} onChange={e => updateUser.mutate({ id: u.id, grade: e.target.value })} className="rounded border px-1">
                  {GRADES.map(g => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <input
                  type="number"
                  defaultValue={u.coins}
                  onBlur={e => updateUser.mutate({ id: u.id, coins: Number(e.target.value) })}
                  className="w-16 rounded border px-1"
                />
              </td>
              <td className="p-2">
                <input
                  type="checkbox"
                  checked={!!u.infiniteAura}
                  onChange={e => updateUser.mutate({ id: u.id, infiniteAura: e.target.checked })}
                />
              </td>
              <td className="flex gap-2 p-2">
                <button type="button" onClick={() => rename(u.id, u.firstName ?? '', u.lastName ?? '', u.username ?? '')} className="underline">
                  Edit
                </button>
                <button type="button" onClick={() => remove(u.id)} className="text-red-600 underline">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
