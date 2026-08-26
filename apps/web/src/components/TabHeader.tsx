import { useNavigate } from '@tanstack/react-router';

// Fixed order from the old app's PAGES array — `aura` is the default landing tab.
export const TABS = ['add', 'inbox', 'aura', 'profile', 'about'] as const;
export type Tab = (typeof TABS)[number];

const LABELS: Record<Tab, string> = { add: 'Add+', inbox: 'Inbox', aura: 'Aura', profile: 'Profile', about: 'About' };
// Keeps `to` a literal template-union type (matching the generated route tree) instead of a bare
// `string` from concatenation, which the typed router's `navigate` would otherwise reject.
const PATHS: Record<Tab, `/${Tab}`> = { add: '/add', inbox: '/inbox', aura: '/aura', profile: '/profile', about: '/about' };

/* Not generic chrome — this bar IS the primary nav: it shows the previous/next tab names as tap
   targets either side of the current one, mirroring the old app's HEADERS breadcrumb pattern
   (data-only navigation, not a traditional icon tab bar). */
export function TabHeader({ current, unreadCount = 0 }: { current: Tab; unreadCount?: number }) {
  const navigate = useNavigate();
  const index = TABS.indexOf(current);
  const prev = TABS[index - 1];
  const next = TABS[index + 1];

  return (
    <header className="flex items-center justify-between border-b p-4">
      <HeaderSlot tab={prev} unreadCount={unreadCount} onNavigate={navigate} />
      <span className="border-b-2 border-black font-semibold">{LABELS[current]}</span>
      <HeaderSlot tab={next} unreadCount={unreadCount} onNavigate={navigate} />
    </header>
  );
}

function HeaderSlot({
  tab,
  unreadCount,
  onNavigate
}: {
  tab: Tab | undefined;
  unreadCount: number;
  onNavigate: ReturnType<typeof useNavigate>;
}) {
  if (!tab) return <span className="invisible">·</span>;
  return (
    <button type="button" onClick={() => onNavigate({ to: PATHS[tab] })} className="text-gray-500">
      {LABELS[tab]}
      {tab === 'inbox' && unreadCount > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{unreadCount}</span>}
    </button>
  );
}
