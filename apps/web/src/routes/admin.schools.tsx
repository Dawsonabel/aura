import { createFileRoute, Link } from '@tanstack/react-router';
import { useSchools } from '../hooks/useSchools';
import { useCreateSchool } from '../hooks/useCreateSchool';
import { useUpdateSchool } from '../hooks/useUpdateSchool';
import { useDeleteSchool } from '../hooks/useDeleteSchool';

export const Route = createFileRoute('/admin/schools')({
  component: Schools
});

export function Schools() {
  const { data: schools } = useSchools();
  const createSchool = useCreateSchool();
  const updateSchool = useUpdateSchool();
  const deleteSchool = useDeleteSchool();

  function addSchool() {
    const name = prompt('School name:');
    if (!name) return;
    const city = prompt('City (optional):') || undefined;
    createSchool.mutate({ name, city });
  }

  function editSchool(id: string, currentName: string, currentCity: string) {
    const name = prompt('School name:', currentName);
    if (name === null) return;
    const city = prompt('City:', currentCity);
    if (city === null) return;
    updateSchool.mutate({ id, name, city });
  }

  function removeSchool(id: string) {
    if (!confirm('Delete this school? Students keep their accounts but lose their school assignment.')) return;
    deleteSchool.mutate(id);
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Schools</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Name</th>
            <th className="p-2">City</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {(schools ?? []).map(s => (
            <tr key={s.id} className="border-b">
              <td className="p-2">{s.name}</td>
              <td className="p-2">{s.city}</td>
              <td className="flex gap-2 p-2">
                <Link to="/admin/users" search={{ schoolId: s.id }} className="underline">
                  View students
                </Link>
                <button type="button" onClick={() => editSchool(s.id, s.name, s.city)} className="underline">
                  Edit
                </button>
                <button type="button" onClick={() => removeSchool(s.id)} className="text-red-600 underline">
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addSchool} className="mt-4 rounded bg-black px-4 py-2 text-white">
        + Add school
      </button>
    </div>
  );
}
