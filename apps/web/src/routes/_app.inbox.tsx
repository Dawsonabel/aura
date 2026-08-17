import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useFlames, type Flame } from '../hooks/useFlames';
import { useMarkFlamesRead } from '../hooks/useMarkFlamesRead';
import { useNotifications, type Notification } from '../hooks/useNotifications';
import { useMarkNotificationsRead } from '../hooks/useMarkNotificationsRead';
import { useRevealFlame } from '../hooks/useRevealFlame';
import { useRevealFlameName } from '../hooks/useRevealFlameName';
import { Overlay } from '../components/Overlay';
import { GodModeOverlay } from '../components/GodModeOverlay';

export const Route = createFileRoute('/_app/inbox')({
  component: Inbox
});

const GENDER_LABEL: Record<string, string> = { boy: 'Boy', girl: 'Girl', nonbinary: 'Non-binary' };

function flameSubtitle(f: Flame): string {
  if (f.anonymous) return `🔒 Anonymous · ${f.grade}`;
  let base = f.name ? `From ${f.name} · ${f.grade}` : f.initial ? `From ${f.initial}••• · ${f.grade}` : `Someone in ${f.grade} picked you`;
  if (f.repeatAdmirer) base += ` · 🔥×${f.pickCount}`;
  return base;
}

export function Inbox() {
  const { data, isLoading } = useFlames();
  const markFlamesRead = useMarkFlamesRead();
  const { data: notifications } = useNotifications();
  const markNotificationsRead = useMarkNotificationsRead();

  // Freezes the unread list the moment `notifications` first loads, so marking them read below
  // (which invalidates and refetches the query) doesn't make the banner disappear out from under
  // the user. Computed during render — see https://react.dev/learn/you-might-not-need-an-effect —
  // rather than in an Effect, so it doesn't cost an extra render pass.
  const [prevNotifications, setPrevNotifications] = useState(notifications);
  const [shownNotifications, setShownNotifications] = useState<Notification[] | null>(null);
  if (notifications !== prevNotifications) {
    setPrevNotifications(notifications);
    if (notifications && shownNotifications === null) {
      setShownNotifications(notifications.filter(n => !n.read));
    }
  }

  const [selectedFlameId, setSelectedFlameId] = useState<string | null>(null);
  const [godModeOpen, setGodModeOpen] = useState(false);

  // Opening the Inbox marks everything read immediately, same as the old app — not gated behind
  // any user action.
  // Runs once on mount only — matches the old app's "opening Inbox marks everything read" behavior.
  useEffect(() => {
    markFlamesRead.mutate();
  }, []);

  // Consequence of the frozen unread list appearing — mirrors the mount-only mark-read Effect
  // above, just triggered once shownNotifications settles instead of on mount.
  // Depends on `.mutate` (stable across renders — see @tanstack/react-query's useMutation source:
  // it's wrapped in useCallback) rather than the whole `markNotificationsRead` object, which
  // useMutation() recreates on every render — depending on the object would re-fire this Effect,
  // and thus re-call the mutation, every time the mutation's own pending/success transitions
  // caused a re-render, looping indefinitely.
  useEffect(() => {
    if (shownNotifications?.length) markNotificationsRead.mutate();
  }, [shownNotifications, markNotificationsRead.mutate]);

  if (isLoading || !data) return <p>Loading…</p>;

  // Excludes anonymous flames — FlameDetailAction always shows the "anonymous (God Mode)" dead
  // end for those, never the bonus name-reveal this banner promises.
  const secretAdmirer = data.flames.some(f => f.repeatAdmirer && !f.name && !f.anonymous);
  const selectedFlame = data.flames.find(f => f.id === selectedFlameId) || null;

  return (
    <div className="flex flex-col gap-3">
      {data.godMode ? (
        <div className="rounded bg-purple-100 p-3 text-sm">👑 God Mode active — hints unlocked</div>
      ) : (
        <button type="button" onClick={() => setGodModeOpen(true)} className="rounded bg-gray-100 p-3 text-left text-sm">
          👀 See Who Likes You
        </button>
      )}

      {secretAdmirer && (
        <div className="rounded bg-orange-100 p-3 text-sm">
          🔥 <b>You have a secret admirer!</b>{' '}
          {data.godMode ? (
            'Open their flame to use a bonus name reveal.'
          ) : (
            <button type="button" onClick={() => setGodModeOpen(true)} className="underline">
              Unlock God Mode to reveal them.
            </button>
          )}
        </div>
      )}

      {shownNotifications?.map(n => (
        <div key={n.id} className="flex items-center gap-2 rounded bg-blue-50 p-2 text-sm">
          <span>{n.emoji || '🔔'}</span>
          <span>{n.text}</span>
        </div>
      ))}

      {data.flames.length === 0 ? (
        <p className="text-gray-500">No flames yet.
          <br />
          Answer polls so friends can flame you up! 🔥
        </p>
      ) : (
        data.flames.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFlameId(f.id)}
            className="flex items-center justify-between rounded border p-3 text-left"
          >
            <div>
              <div className="font-medium">
                {f.q}
                {f.repeatAdmirer && !f.name && <span className="ml-2 rounded bg-orange-200 px-1 text-xs">🔥 secret admirer</span>}
              </div>
              <div className="text-sm text-gray-500">{flameSubtitle(f)}</div>
            </div>
            <span>{f.anonymous ? '🔒' : f.revealed || f.godMode ? '›' : '🔒'}</span>
          </button>
        ))
      )}

      {selectedFlame && (
        <FlameDetail flame={selectedFlame} bonusRevealsLeft={data.bonusRevealsLeft} onClose={() => setSelectedFlameId(null)} />
      )}
      {godModeOpen && <GodModeOverlay onClose={() => setGodModeOpen(false)} />}
    </div>
  );
}

function FlameDetail({ flame, bonusRevealsLeft, onClose }: { flame: Flame; bonusRevealsLeft: number; onClose: () => void }) {
  const revealFlame = useRevealFlame();
  const revealFlameName = useRevealFlameName();
  const shown = flame.revealed || flame.godMode;

  return (
    <Overlay onClose={onClose} style={{ borderTop: `8px solid ${flame.color}` }}>
      <div className="text-3xl">{flame.emoji}</div>
      <h2 className="text-lg font-semibold">{flame.q}</h2>
      {flame.repeatAdmirer && <p className="text-sm text-orange-600">🔥 This person flamed you {flame.pickCount}×</p>}

      <dl className="my-4 grid grid-cols-2 gap-y-1 text-sm">
        <dt>Gender</dt>
        <dd>{GENDER_LABEL[flame.gender] || flame.gender}</dd>
        <dt>Grade</dt>
        <dd>{flame.grade}</dd>
        <dt>First initial</dt>
        <dd>{flame.anonymous ? '🔒' : shown ? flame.initial || '?' : 'X'}</dd>
        {flame.name && (
          <>
            <dt>Name</dt>
            <dd>{flame.name}</dd>
          </>
        )}
      </dl>

      <FlameDetailAction
        flame={flame}
        shown={shown}
        bonusRevealsLeft={bonusRevealsLeft}
        revealFlame={revealFlame}
        revealFlameName={revealFlameName}
      />

      <button type="button" onClick={onClose} className="mt-4 w-full rounded border px-3 py-2">
        Close
      </button>
    </Overlay>
  );
}

function FlameDetailAction({
  flame,
  shown,
  bonusRevealsLeft,
  revealFlame,
  revealFlameName
}: {
  flame: Flame;
  shown: boolean;
  bonusRevealsLeft: number;
  revealFlame: ReturnType<typeof useRevealFlame>;
  revealFlameName: ReturnType<typeof useRevealFlameName>;
}) {
  if (flame.anonymous) return <p className="text-sm">🔒 This admirer is anonymous (God Mode)</p>;

  if (!shown) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" onClick={() => revealFlame.mutate(flame.id)} className="rounded bg-black px-3 py-2 text-white">
          Reveal a hint · 🪙 1
        </button>
        {revealFlame.isError && <p className="text-sm text-red-600">{(revealFlame.error as Error).message}</p>}
      </div>
    );
  }

  if (flame.godMode) {
    if (flame.name) return <p className="text-sm">✅ It's {flame.name}</p>;
    if (flame.repeatAdmirer) {
      if (bonusRevealsLeft <= 0) return <p className="text-sm">No bonus reveals left</p>;
      return (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => revealFlameName.mutate(flame.id)} className="rounded bg-black px-3 py-2 text-white">
            🔓 Reveal their full name · Bonus ({bonusRevealsLeft} left)
          </button>
          {revealFlameName.isError && <p className="text-sm text-red-600">{(revealFlameName.error as Error).message}</p>}
        </div>
      );
    }
    return <p className="text-sm">👑 First-initial hint unlocked</p>;
  }

  return null;
}
