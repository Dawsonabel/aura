import { useFlames } from '../hooks/useFlames';
import { useActivateGodMode } from '../hooks/useActivateGodMode';
import { Overlay } from './Overlay';

const BENEFITS = [
  { emoji: '🔓', title: 'Reveal Two Names Per Week', sub: 'Unmask anyone who picks you twice' },
  { emoji: '⚡', title: 'Get Unlimited Hints', sub: 'See the first letter of everyone who picks you' },
  { emoji: '🪙', title: 'Get Double Coins', sub: 'Earn 2× coins on every poll you answer' },
  { emoji: '🔔', title: 'Secret Crush Alerts', sub: 'Know when someone adds themself to your polls' },
  { emoji: '🕵️', title: 'Send Polls Anonymously', sub: 'Your votes can never be traced back to you' }
];

export function GodModeOverlay({ onClose }: { onClose: () => void }) {
  const { data: flames } = useFlames();
  const activateGodMode = useActivateGodMode();
  // Real count, not the old app's fabricated "3 people like you" teaser with fake initials.
  const lockedCount = flames?.flames.filter(f => !f.revealed && !f.godMode).length ?? 0;

  return (
    <Overlay onClose={onClose}>
      <div className="text-center">
        <div className="text-4xl">👑</div>
        <h1 className="text-2xl font-bold">GOD MODE</h1>
        <p className="text-sm text-gray-500">See who likes you on Aura</p>
      </div>

      {lockedCount > 0 && (
        <p className="mt-4 text-center text-sm">
          🔥 {lockedCount} {lockedCount === 1 ? 'person likes' : 'people like'} you
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {BENEFITS.map(b => (
          <div key={b.title} className="flex items-start gap-2">
            <span className="text-xl">{b.emoji}</span>
            <div>
              <b className="text-sm">{b.title}</b>
              <p className="text-sm text-gray-500">{b.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => activateGodMode.mutate(undefined, { onSuccess: onClose })}
        className="mt-4 w-full rounded bg-black px-4 py-2 text-white"
      >
        Unlock God Mode · $6.99/week
      </button>
      {activateGodMode.isError && <p className="text-sm text-red-600">{(activateGodMode.error as Error).message}</p>}
      <p className="mt-2 text-center text-xs text-gray-500">Cancel anytime · 100% private — no one can see you have God Mode.</p>
    </Overlay>
  );
}
