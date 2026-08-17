/* The linktree-style socials block on the Me tab.

   Handles only — never OAuth, never a scraped avatar. Storing a handle the user typed is the honest
   version of "link your Instagram": it costs no third-party integration, works for personal accounts
   (Meta's Basic Display API, the only thing that could read a personal profile photo, was shut down
   in December 2024), and it can't break when a platform changes its rules.

   The tradeoff is that a handle is *unverified* — anyone can type anyone's. That's why nothing in the
   app treats it as identity: it's a link on your own profile, not a badge, and impersonation is
   covered by the existing report reason. */

/* `spotify` stays in the type even though 15A dropped it from the row: the GraphQL field still exists
   and handles people already saved are still stored. Removing the key would turn live data into a type
   error and quietly orphan it — this way the value survives untouched if the slot ever comes back. */
export type SocialKey = 'instagram' | 'snapchat' | 'tiktok' | 'spotify';

export type Socials = Partial<Record<SocialKey, string>>;

/* 15A: "three slots, not three logos". Instagram, TikTok and Snapchat each publish an official SVG and
   require it unmodified, so a hand-drawn lookalike is both a trademark problem and instantly readable as
   fake. `icon` names a *category glyph* from the icon library (camera / ghost / musicNote) that holds the
   slot until the official marks are dropped in; those marks are the one place the 2.2-stroke rule won't
   apply, since they keep their own shape and colour.

   Spotify is dropped from the row per 15A — the block is Instagram, Snapchat and TikTok. */
export const SOCIALS: {
  key: SocialKey;
  label: string;
  /** Icon-library name. A plain string so this package stays independent of any one app's icon set. */
  icon: string;
  /** Retained for apps/web, which has no icon library of its own yet. */
  emoji: string;
  /** Brand colour for the tile, matching the platform rather than the app palette. */
  color: string;
  /** Where a tap goes. Web URLs on purpose — iOS hands http(s) links to the installed app anyway. */
  url: (handle: string) => string;
  placeholder: string;
}[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: 'camera',
    emoji: '📸',
    color: '#E1306C',
    url: h => `https://instagram.com/${h}`,
    placeholder: 'yourhandle'
  },
  {
    key: 'snapchat',
    label: 'Snapchat',
    icon: 'ghost',
    emoji: '👻',
    color: '#FFFC00',
    url: h => `https://snapchat.com/add/${h}`,
    placeholder: 'yourhandle'
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: 'musicNote',
    emoji: '🎵',
    color: '#25F4EE',
    url: h => `https://tiktok.com/@${h}`,
    placeholder: 'yourhandle'
  }
];

/** Strips what people paste — a leading @, a full URL, or trailing slashes — down to the handle. */
export function normalizeHandle(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^(add|@)\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@+/, '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 40);
}
