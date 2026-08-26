import { useState } from 'react';
import { useMe } from '../hooks/useMe';
import { useSuggestions } from '../hooks/useSuggestions';
import { useBoostRandom } from '../hooks/useBoostRandom';
import { useBoostCrush } from '../hooks/useBoostCrush';
import { Overlay } from './Overlay';

type View = 'shop' | 'crushPicker';

export function ShopOverlay({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('shop');

  return view === 'crushPicker' ? (
    <CrushPicker onBack={() => setView('shop')} onClose={onClose} />
  ) : (
    <Shop onPickCrush={() => setView('crushPicker')} onClose={onClose} />
  );
}

function Shop({ onPickCrush, onClose }: { onPickCrush: () => void; onClose: () => void }) {
  const { data: me } = useMe();
  const boostRandom = useBoostRandom();

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold">Shop</h2>
      <p className="mt-2 text-sm text-gray-500">YOUR BALANCE</p>
      <p className="text-xl">🪙 {me?.coins}</p>

      <h3 className="mt-4 text-sm font-semibold">Boost Your Name in Polls</h3>
      <p className="text-sm text-gray-500">Use coins to get featured in polls</p>

      <div className="mt-2 flex flex-col gap-2">
        <button type="button" onClick={() => boostRandom.mutate()} className="flex items-center justify-between rounded border p-3 text-left">
          <span>
            🗂️ Get Your Name on
            <br />3 Random Polls
          </span>
          <span>100 🪙</span>
        </button>
        {boostRandom.isError && <p className="text-sm text-red-600">{(boostRandom.error as Error).message}</p>}

        <button type="button" onClick={onPickCrush} className="flex items-center justify-between rounded border p-3 text-left">
          <span>
            🤫 Put Your Name in
            <br />
            Your Crush's Poll
          </span>
          <span>300 🪙</span>
        </button>
      </div>

      <p className="mt-4 text-sm font-semibold">How do I get more coins?</p>
      <p className="text-sm text-gray-500">Answer polls about your friends to win coins.</p>

      <button type="button" onClick={onClose} className="mt-4 w-full rounded border px-3 py-2">
        Close
      </button>
    </Overlay>
  );
}

function CrushPicker({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { data: suggestions } = useSuggestions();
  const boostCrush = useBoostCrush();
  const people = [...(suggestions?.contacts ?? []), ...(suggestions?.fof ?? [])];

  return (
    <Overlay onClose={onClose}>
      <button type="button" onClick={onBack} className="text-sm text-gray-500">
        ‹ Back
      </button>
      <h2 className="text-lg font-semibold">Pick your crush</h2>
      <p className="text-sm text-gray-500">Your name stays secret 🤫 — 300 🪙</p>

      <div className="mt-2 flex flex-col gap-1">
        {people.length === 0 ? (
          <p className="text-sm text-gray-500">No schoolmates found yet.</p>
        ) : (
          people.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => boostCrush.mutate(u.id, { onSuccess: onBack })}
              className="flex items-center gap-2 rounded border p-2 text-left"
            >
              <span>
                {u.firstName} {u.lastName}
              </span>
            </button>
          ))
        )}
        {boostCrush.isError && <p className="text-sm text-red-600">{(boostCrush.error as Error).message}</p>}
      </div>
    </Overlay>
  );
}
