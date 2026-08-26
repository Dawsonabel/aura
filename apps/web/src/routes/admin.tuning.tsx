import { createFileRoute } from '@tanstack/react-router';
import { useTuningDials } from '../hooks/useTuningDials';
import { useUpdateTuningDial } from '../hooks/useUpdateTuningDial';

export const Route = createFileRoute('/admin/tuning')({
  component: TuningPage
});

/* Every gameplay/economy dial, editable live. What this page writes wins over env vars and defaults
   (see applyTuningOverrides in apps/api/src/tuning.ts) and takes effect on the next request — no
   deploy, no App Store review. The groups mirror how the product thinks about the numbers, not how
   tuning.ts happens to order them. */
const GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Rounds & payouts', keys: ['roundsPerHour', 'questionsPerRound', 'votePayout', 'roundBonus', 'roundBonusInfiniteAura', 'streakBonus', 'inviteBonus'] },
  { label: 'Prices', keys: ['rerollCost', 'boostRandomCost', 'boostCrushCost', 'coinPackSmall', 'coinPackMedium', 'coinPackLarge'] },
  { label: 'Boosts', keys: ['boostRandomUses', 'boostCrushUses', 'maxBoostPerRound'] },
  { label: 'Membership', keys: ['dailyFlips'] },
  { label: 'Candidate weights', keys: ['weightFriend', 'weightSchoolmate', 'weightLoyalPct', 'weightCrossGenderPct', 'weightUnderdogPct', 'weightMemberPct'] },
  { label: 'Privacy & board', keys: ['auraLifetimeDays', 'cohortFloor', 'schoolUnlockThreshold', 'boardLimit', 'boardTopTier'] }
];

export function TuningPage() {
  const { data: dials } = useTuningDials();
  const update = useUpdateTuningDial();

  function editDial(key: string, current: number) {
    const raw = prompt(`${key} — new value (whole number, 0 or more):`, String(current));
    if (raw === null) return;
    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value < 0) {
      alert('Whole numbers only, 0 or more.');
      return;
    }
    update.mutate({ key, value });
  }

  function clearDial(key: string) {
    update.mutate({ key, value: null });
  }

  if (!dials) return <p>Loading…</p>;
  const byKey = new Map(dials.map(d => [d.key, d]));

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Tuning</h2>
      <p className="mb-4 text-sm text-gray-500">
        Changes apply on the next request, to everyone. Overrides beat env vars; Clear falls back.
      </p>
      {update.isError && <p className="mb-3 text-sm text-red-600">{(update.error as Error).message}</p>}
      {GROUPS.map(group => (
        <section key={group.label} className="mb-6">
          <h3 className="mb-2 font-semibold">{group.label}</h3>
          <table className="w-full max-w-2xl text-sm">
            <tbody>
              {group.keys.map(key => {
                const dial = byKey.get(key);
                if (!dial) return null;
                return (
                  <tr key={key} className="border-b">
                    <td className="py-2 font-mono">{key}</td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={dial.overridden ? 'font-bold' : undefined}>{dial.value}</span>
                      {dial.overridden && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">override</span>}
                      {!dial.overridden && dial.value !== dial.default && (
                        <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-800" title="An env var on this environment sets this">env</span>
                      )}
                    </td>
                    <td className="py-2 pl-4 text-right text-gray-400 tabular-nums">default {dial.default}</td>
                    <td className="py-2 pl-4 text-right">
                      <button className="text-blue-600 hover:underline" onClick={() => editDial(key, dial.value)}>
                        Edit
                      </button>
                      {dial.overridden && (
                        <button className="ml-3 text-gray-500 hover:underline" onClick={() => clearDial(key)}>
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
