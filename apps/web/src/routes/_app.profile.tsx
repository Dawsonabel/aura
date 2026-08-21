import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useClerk } from '@clerk/tanstack-react-start';
import { useMe } from '../hooks/useMe';
import { useUpdateMe } from '../hooks/useUpdateMe';
import { useFriends, type FriendUser } from '../hooks/useFriends';
import { useBlocked } from '../hooks/useBlocked';
import { useAuras } from '../hooks/useAuras';
import { useRemoveFriend } from '../hooks/useRemoveFriend';
import { useBlockUser } from '../hooks/useBlockUser';
import { useUnblockUser } from '../hooks/useUnblockUser';
import { useReportUser } from '../hooks/useReportUser';
import { useDeleteMe } from '../hooks/useDeleteMe';
import { Overlay } from '../components/Overlay';
import { GENDER_LABEL, GENDER_VALUES, type Gender } from '@aura/api-client';
import { ShopOverlay } from '../components/ShopOverlay';
import { InfiniteAuraOverlay } from '../components/InfiniteAuraOverlay';

export const Route = createFileRoute('/_app/profile')({
  component: Profile
});

function initials(first: string | null, last: string | null): string {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase();
}

type OverlayKind = 'edit' | 'manage' | 'blocked' | 'shop' | 'infiniteAura' | null;

export function Profile() {
  const { data: me } = useMe();
  const { data: friends } = useFriends();
  const { data: auras } = useAuras();
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [actionsFor, setActionsFor] = useState<FriendUser | null>(null);

  if (!me) return <p>Loading…</p>;

  const name = `${me.firstName || 'Your'} ${me.lastName || 'Name'}`.trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold">
          {initials(me.firstName, me.lastName) || 'YOU'}
        </div>
        <div className="flex-1">
          <div className="flex gap-4 text-sm">
            <span>
              <b>{friends?.length ?? 0}</b> friends
            </span>
            <span>
              <b>{auras?.auras.length ?? 0}</b> auras
            </span>
          </div>
          <button type="button" onClick={() => setOverlay('edit')} className="mt-1 rounded border px-2 py-1 text-xs">
            EDIT PROFILE
          </button>
        </div>
      </div>

      <div>
        <div className="font-semibold">{name}</div>
        <div className="text-sm text-gray-500">@{me.username || 'username'}</div>
      </div>

      <button type="button" onClick={() => setOverlay('shop')} className="rounded border p-3 text-left text-sm">
        🪙 {me.coins} coins
      </button>
      {me.infiniteAura ? (
        <div className="rounded bg-purple-100 p-3 text-sm">👑 Infinite Aura active</div>
      ) : (
        <button type="button" onClick={() => setOverlay('infiniteAura')} className="rounded bg-gray-100 p-3 text-left text-sm">
          👑 Unlock Infinite Aura
        </button>
      )}

      <TopAuras auras={auras?.auras ?? []} hidden={!!me.hideTopAuras} />

      <h3 className="text-sm font-semibold uppercase text-gray-500">Friends</h3>
      {friends?.length ? (
        friends.map(f => (
          <button key={f.id} type="button" onClick={() => setActionsFor(f)} className="flex items-center gap-3 rounded border p-3 text-left">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium">{initials(f.firstName, f.lastName)}</div>
            <span>
              {f.firstName} {f.lastName}
            </span>
          </button>
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 rounded border p-4 text-center">
          <p className="text-gray-500">You have no friends</p>
          <Link to="/add" className="rounded bg-orange-500 px-4 py-2 text-sm text-white">
            Add Friends
          </Link>
        </div>
      )}

      {overlay === 'edit' && <EditProfileOverlay onClose={() => setOverlay(null)} onManageAccount={() => setOverlay('manage')} />}
      {overlay === 'manage' && <ManageAccountOverlay onClose={() => setOverlay(null)} onBlockedList={() => setOverlay('blocked')} />}
      {overlay === 'blocked' && <BlockedListOverlay onClose={() => setOverlay(null)} />}
      {overlay === 'shop' && <ShopOverlay onClose={() => setOverlay(null)} />}
      {overlay === 'infiniteAura' && <InfiniteAuraOverlay onClose={() => setOverlay(null)} />}
      {actionsFor && <UserActionsOverlay friend={actionsFor} onClose={() => setActionsFor(null)} />}
    </div>
  );
}

function TopAuras({ auras, hidden }: { auras: { q: string; emoji: string }[]; hidden: boolean }) {
  if (hidden || auras.length === 0) return null;
  const groups = new Map<string, { q: string; emoji: string; count: number }>();
  for (const f of auras) {
    const g = groups.get(f.q) || { q: f.q, emoji: f.emoji, count: 0 };
    g.count++;
    groups.set(f.q, g);
  }
  const top = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  return (
    <div>
      <h3 className="text-sm font-semibold uppercase text-gray-500">Top Auras 🔥</h3>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {top.map(t => (
          <div key={t.q} className="rounded border p-2 text-center text-xs">
            <div className="text-lg">{t.emoji}</div>
            <div className="truncate">{t.q}</div>
            <div className="text-gray-500">🔥 {t.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditProfileOverlay({ onClose, onManageAccount }: { onClose: () => void; onManageAccount: () => void }) {
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const clerk = useClerk();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(me?.firstName || '');
  const [lastName, setLastName] = useState(me?.lastName || '');
  const [username, setUsername] = useState(me?.username || '');
  /* Cycles the full server-side list, "Rather not say" included — leaving it out meant a mobile
     user who picked it couldn't see their own answer here, and one tap silently overwrote it. */
  function cycleGender() {
    const current = GENDER_VALUES.indexOf(me?.gender as Gender);
    updateMe.mutate({ gender: GENDER_VALUES[(current + 1) % GENDER_VALUES.length] });
  }

  async function logout() {
    await clerk.signOut();
    navigate({ to: '/' });
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold">Edit Profile</h2>
      <div className="mt-4 flex flex-col gap-2">
        <input
          value={firstName}
          onChange={e => {
            setFirstName(e.target.value);
            updateMe.mutate({ firstName: e.target.value });
          }}
          placeholder="First name"
          className="rounded border px-3 py-2"
        />
        <input
          value={lastName}
          onChange={e => {
            setLastName(e.target.value);
            updateMe.mutate({ lastName: e.target.value });
          }}
          placeholder="Last name"
          className="rounded border px-3 py-2"
        />
        <input
          value={username}
          onChange={e => {
            setUsername(e.target.value);
            updateMe.mutate({ username: e.target.value });
          }}
          placeholder="Username"
          className="rounded border px-3 py-2"
        />
        <button type="button" onClick={cycleGender} className="rounded border px-3 py-2 text-left">
          Gender: {(me?.gender && GENDER_LABEL[me.gender]) || 'Not set'}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" onClick={onManageAccount} className="rounded border px-3 py-2">
          Manage Account
        </button>
        <button type="button" onClick={logout} className="rounded border px-3 py-2 text-red-600">
          Logout
        </button>
      </div>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded border px-3 py-2">
        Close
      </button>
    </Overlay>
  );
}

function ManageAccountOverlay({ onClose, onBlockedList }: { onClose: () => void; onBlockedList: () => void }) {
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const deleteMe = useDeleteMe();

  function deleteAccount() {
    if (!confirm('Delete your account? This removes your profile, auras, and votes. This cannot be undone.')) return;
    deleteMe.mutate();
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold">Manage Account</h2>
      <label className="mt-4 flex items-center justify-between">
        <span>Hide Top Auras</span>
        <input
          type="checkbox"
          checked={!!me?.hideTopAuras}
          onChange={e => updateMe.mutate({ hideTopAuras: e.target.checked })}
        />
      </label>
      <button type="button" onClick={onBlockedList} className="mt-4 w-full rounded border px-3 py-2 text-left">
        Blocked Users
      </button>
      <button type="button" onClick={deleteAccount} className="mt-4 w-full rounded border px-3 py-2 text-left text-red-600">
        Delete Account
      </button>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded border px-3 py-2">
        Close
      </button>
    </Overlay>
  );
}

function BlockedListOverlay({ onClose }: { onClose: () => void }) {
  const { data: blocked, isLoading } = useBlocked();
  const unblockUser = useUnblockUser();

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold">Blocked Users</h2>
      <div className="mt-4 flex flex-col gap-2">
        {isLoading ? (
          <p>Loading…</p>
        ) : blocked && blocked.length > 0 ? (
          blocked.map(u => (
            <div key={u.id} className="flex items-center justify-between rounded border p-2">
              <span>
                {u.firstName} {u.lastName}
              </span>
              <button type="button" onClick={() => unblockUser.mutate(u.id)} className="rounded border px-2 py-1 text-xs">
                Unblock
              </button>
            </div>
          ))
        ) : (
          <p className="text-gray-500">No blocked users.</p>
        )}
      </div>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded border px-3 py-2">
        Close
      </button>
    </Overlay>
  );
}

function UserActionsOverlay({ friend, onClose }: { friend: FriendUser; onClose: () => void }) {
  const removeFriend = useRemoveFriend();
  const blockUser = useBlockUser();
  const reportUser = useReportUser();
  const name = `${friend.firstName || ''} ${friend.lastName || ''}`.trim();

  function remove() {
    removeFriend.mutate(friend.id);
    onClose();
  }

  function block() {
    if (!confirm(`Block ${name}? They won't appear in your polls and you won't appear in theirs.`)) return;
    blockUser.mutate(friend.id);
    onClose();
  }

  function report() {
    const reason = prompt(`Report ${name} — what's wrong? (optional)`);
    if (reason === null) return;
    reportUser.mutate({ userId: friend.id, reason: reason || null });
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="text-lg font-semibold">{name}</h2>
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" onClick={remove} className="rounded border px-3 py-2 text-left">
          Remove Friend
        </button>
        <button type="button" onClick={report} className="rounded border px-3 py-2 text-left">
          Report User
        </button>
        <button type="button" onClick={block} className="rounded border px-3 py-2 text-left text-red-600">
          Block User
        </button>
      </div>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded border px-3 py-2">
        Close
      </button>
    </Overlay>
  );
}
