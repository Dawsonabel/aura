import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useAuras, type Aura } from '../hooks/useAuras';
import { useMarkAurasRead } from '../hooks/useMarkAurasRead';
import { useNotifications, type Notification } from '../hooks/useNotifications';
import { useMarkNotificationsRead } from '../hooks/useMarkNotificationsRead';
import { Overlay } from '../components/Overlay';
import { InfiniteAuraOverlay } from '../components/InfiniteAuraOverlay';
import { auraGenderLabel } from '@aura/api-client';

/* Read-only since the clue ladder was removed.

   apps/web is the admin dashboard; these consumer screens are vestigial and there is no plan to
   rebuild them (see CLAUDE.md). Opening a card is a *flip* now, which is a mobile flow with a daily
   allowance, an animation and a paywall behind it — reimplementing all of that here to serve nobody
   would be the wrong trade. So this screen shows what the payload already contains and offers no way
   to spend anything. The reveal buttons, and the two hooks behind them, are gone. */

export const Route = createFileRoute('/_app/inbox')({
  component: Inbox
});

function auraSubtitle(f: Aura): string {
  if (f.anonymous) return '🔒 Anonymous';
  // Mirrors mobile: the sender's cohort is too small for the gender to be anonymous.
  if (f.detailHidden) return f.name ? `From ${f.name}` : 'Someone at your school picked you';
  const who = auraGenderLabel(f.gender) ?? 'Someone';
  let base = f.name ? `From ${f.name} · ${f.grade}` : `${who} picked you`;
  if (f.repeatAdmirer) base += ` · 🔥×${f.pickCount}`;
  return base;
}

export function Inbox() {
  const { data, isLoading } = useAuras();
  const markAurasRead = useMarkAurasRead();
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

  const [selectedAuraId, setSelectedAuraId] = useState<string | null>(null);
  const [infiniteAuraOpen, setInfiniteAuraOpen] = useState(false);

  // Opening the Inbox marks everything read immediately, same as the old app — not gated behind
  // any user action.
  // Runs once on mount only — matches the old app's "opening Inbox marks everything read" behavior.
  useEffect(() => {
    markAurasRead.mutate();
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

  // Excludes anonymous auras — AuraDetailAction always shows the "anonymous (Infinite Aura)" dead
  // end for those, never the bonus name-reveal this banner promises.
  const secretAdmirer = data.auras.some(f => f.repeatAdmirer && !f.name && !f.anonymous);
  const selectedAura = data.auras.find(f => f.id === selectedAuraId) || null;

  return (
    <div className="flex flex-col gap-3">
      {data.infiniteAura ? (
        <div className="rounded bg-purple-100 p-3 text-sm">👑 Infinite Aura active — hints unlocked</div>
      ) : (
        <button type="button" onClick={() => setInfiniteAuraOpen(true)} className="rounded bg-gray-100 p-3 text-left text-sm">
          👀 See Who Likes You
        </button>
      )}

      {secretAdmirer && (
        <div className="rounded bg-orange-100 p-3 text-sm">
          🔥 <b>You have a secret admirer!</b>{' '}
          {data.infiniteAura ? (
            'Open their aura to use a bonus name reveal.'
          ) : (
            <button type="button" onClick={() => setInfiniteAuraOpen(true)} className="underline">
              Unlock Infinite Aura to reveal them.
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

      {data.auras.length === 0 ? (
        <p className="text-gray-500">No auras yet.
          <br />
          Answer polls so friends can aura you up! 🔥
        </p>
      ) : (
        data.auras.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedAuraId(f.id)}
            className="flex items-center justify-between rounded border p-3 text-left"
          >
            <div>
              <div className="font-medium">
                {f.q}
                {f.repeatAdmirer && !f.name && <span className="ml-2 rounded bg-orange-200 px-1 text-xs">🔥 secret admirer</span>}
              </div>
              <div className="text-sm text-gray-500">{auraSubtitle(f)}</div>
            </div>
            <span>{f.name ? '›' : '🔒'}</span>
          </button>
        ))
      )}

      {selectedAura && <AuraDetail aura={selectedAura} onClose={() => setSelectedAuraId(null)} />}
      {infiniteAuraOpen && <InfiniteAuraOverlay onClose={() => setInfiniteAuraOpen(false)} />}
    </div>
  );
}

function AuraDetail({ aura, onClose }: { aura: Aura; onClose: () => void }) {
  const genderLabel = auraGenderLabel(aura.gender);

  return (
    <Overlay onClose={onClose} style={{ borderTop: `8px solid ${aura.color}` }}>
      <div className="text-3xl">{aura.emoji}</div>
      <h2 className="text-lg font-semibold">{aura.q}</h2>
      {aura.repeatAdmirer && <p className="text-sm text-orange-600">🔥 This person aurad you {aura.pickCount}×</p>}

      <dl className="my-4 grid grid-cols-2 gap-y-1 text-sm">
        {/* Dropped when the voter chose "Rather not say" — see auraGenderLabel. */}
        {genderLabel && (
          <>
            <dt>Gender</dt>
            <dd>{genderLabel}</dd>
          </>
        )}
        {/* Both only exist on a flipped card — the flip is what puts them in the payload. */}
        {aura.name && (
          <>
            <dt>Name</dt>
            <dd>{aura.name}</dd>
            <dt>Grade</dt>
            <dd>{aura.grade}</dd>
          </>
        )}
      </dl>

      {aura.anonymous ? (
        <p className="text-sm">🔒 This admirer has Infinite Aura — their name is off limits</p>
      ) : aura.name ? (
        <p className="text-sm">✅ It's {aura.name}</p>
      ) : (
        <p className="text-sm">🔒 Face down. Flip it in the app.</p>
      )}

      <button type="button" onClick={onClose} className="mt-4 w-full rounded border px-3 py-2">
        Close
      </button>
    </Overlay>
  );
}
