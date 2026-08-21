import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';

/* 15A's icon library — 36 icons replacing the emoji in every piece of app chrome.

   One 24×24 grid, one stroke weight, rounded caps and joins: the same soft geometry as Fredoka, so an
   icon sitting next to a heading reads as the same family. Emoji never did — they're a different
   designer's artwork per glyph, they shift with every OS update, and they render at whatever weight
   Apple felt like.

   **The path strings below are copied verbatim from the design's `aura-icons.js`** and are meant to
   stay that way. The mocks render `<aura-icon name="flame">` against the same data, so a divergence
   here is a divergence between the design doc and the app with nothing to catch it. If an icon needs
   to change, change it there and re-copy.

   That verbatim requirement is also why this renders through `SvgXml` rather than hand-converting 36
   icons into <Path> elements: the conversion is exactly the kind of transcription that silently loses
   a decimal, and there'd be no way to diff the result against the source.

   What deliberately stays emoji: poll prompts (🥵, 💅, 🎤) and superlative pills. Those are *content* —
   polls are rows in a table and new ones ship without a design pass, so they can't depend on an icon
   existing. Chrome is drawn; content is typed. */

/* %C% and %W% are substituted with the colour and weight — only the coin uses them, because it's the
   one filled icon and its cut-out has to be truly transparent rather than painted in a background
   colour it can't know. */
const PATHS = {
  // ---- status & currency ----
  // fire, not a candle: two tongues off a wide base
  flame:
    '<path d="M12.4 2.4c.4 2.9 1.9 4.2 3.5 5.9 1.6 1.7 2.5 3.4 2.5 5.4a6.4 6.4 0 0 1-12.8 0c0-1.8.7-3.4 2-4.8.2 1.2.8 2 1.7 2.4C9.7 8 10.9 5.4 12.4 2.4Z"/><path d="M12 13.2c1.4 1.2 2.1 2.1 2.1 3.2a2.1 2.1 0 0 1-4.2 0c0-1.1.7-2 2.1-3.2Z"/>',
  /* The currency. One closed outline rather than a filled slab, so it reads as drawn chrome like the
     rest of the set and carries the same 2.2 stroke. `coin` below is the retired glyph — kept until
     nothing references it, same as any other icon nobody draws any more. */
  bolt: '<path d="M13.4 2.8 6.6 13.2h4.6l-.6 8 6.8-10.4h-4.6Z"/>',
  // filled disc with the C and bar knocked out (mask, so the cut is truly transparent)
  coin: '<mask id="auraCoinCut"><rect width="24" height="24" fill="#fff"/><g fill="none" stroke="#000" stroke-width="%W%" stroke-linecap="round"><path d="M14.6 8.9a4.2 4.2 0 1 0 0 6.2"/><path d="M12 6.1v11.8"/></g></mask><circle cx="12" cy="12" r="9" fill="%C%" stroke="none" mask="url(#auraCoinCut)"/>',
  coins:
    '<ellipse cx="12" cy="6.6" rx="7.2" ry="3.2"/><path d="M4.8 6.6v4.6c0 1.8 3.2 3.2 7.2 3.2s7.2-1.4 7.2-3.2V6.6"/><path d="M4.8 11.6v4.6c0 1.8 3.2 3.2 7.2 3.2s7.2-1.4 7.2-3.2v-4.6"/>',
  // aura — a four-point star; matches the "aura points" slang and holds at any size
  aura: '<path d="M12 2.8 13.9 10.1 21.2 12 13.9 13.9 12 21.2 10.1 13.9 2.8 12 10.1 10.1Z"/>',
  crown: '<path d="M3.6 17.6 5.1 7.4l3.9 3.4L12 4.8l3 6 3.9-3.4 1.5 10.2Z"/><path d="M4.6 20.4h14.8"/>',
  trophy:
    '<path d="M8 4h8v4.6a4 4 0 0 1-8 0Z"/><path d="M8 5.6H5.4a3 3 0 0 0 3 3"/><path d="M16 5.6h2.6a3 3 0 0 1-3 3"/><path d="M12 12.6v3.6"/><path d="M8.4 19.6h7.2"/>',
  sparkle: '<path d="M12 3.4l1.8 5.3 5.3 1.8-5.3 1.8L12 17.6l-1.8-5.3L4.9 10.5l5.3-1.8Z"/>',

  // ---- navigation / tabs ----
  ballot: '<rect x="4" y="4" width="16" height="16" rx="4.4"/><path d="M8.4 12.4 11 15l4.8-5.4"/>',
  inbox:
    '<path d="M3.4 12.6h4l1.4 2.6h6.4l1.4-2.6h4"/><path d="M3.4 12.6 6 5.4h12l2.6 7.2v5a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8Z"/>',
  person: '<circle cx="12" cy="8.4" r="3.7"/><path d="M5.4 19.8c0-3.7 2.9-5.7 6.6-5.7s6.6 2 6.6 5.7"/>',
  personPlus:
    '<circle cx="9.4" cy="8.6" r="3.4"/><path d="M3.2 19.4c0-3.3 2.8-5.1 6.2-5.1 1.2 0 2.4.2 3.4.7"/><path d="M17.8 13.4v6.2M14.7 16.5h6.2"/>',
  people:
    '<circle cx="9" cy="8.6" r="3.3"/><path d="M3 19.6c0-3.3 2.7-5.1 6-5.1s6 1.8 6 5.1"/><path d="M16.4 6.2a3.3 3.3 0 0 1 0 6.6"/><path d="M17.4 14.9c2.2.5 3.6 2.1 3.6 4.7"/>',

  // ---- actions ----
  reroll: '<path d="M19.6 9.6A8 8 0 1 0 12 20.2"/><path d="M20.6 4v5.6H15"/>',
  skip: '<path d="M6 5.6 15 12l-9 6.4Z"/><path d="M18.4 5.6v12.8"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.4 15.4l5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.8 9.7 17.5 19 7.4"/>',
  close: '<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
  chevronLeft: '<path d="M14.6 5.4 8 12l6.6 6.6"/>',
  chevronRight: '<path d="M9.4 5.4 16 12l-6.6 6.6"/>',
  arrowRight: '<path d="M4.2 12h15.2"/><path d="M13.4 6.2 19.4 12l-6 5.8"/>',
  share: '<path d="M12 3.4v11.2"/><path d="M8 7.4 12 3.4l4 4"/><path d="M5.2 14.4v4.2a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2v-4.2"/>',
  hold: '<circle cx="12" cy="12" r="3.2"/><path d="M6.6 6.6a7.6 7.6 0 0 0 0 10.8"/><path d="M17.4 17.4a7.6 7.6 0 0 0 0-10.8"/>',

  // ---- system & safety ----
  sliders:
    '<path d="M4 7.4h10M18.4 7.4h1.6"/><circle cx="16.2" cy="7.4" r="2.2"/><path d="M4 16.6h4.4M12.8 16.6h7.2"/><circle cx="10.6" cy="16.6" r="2.2"/>',
  bell: '<path d="M7 10.6a5 5 0 0 1 10 0c0 4 1.6 5.6 1.6 5.6H5.4S7 14.6 7 10.6Z"/><path d="M9.9 19.4a2.3 2.3 0 0 0 4.2 0"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2v5.2l3.7 2.2"/>',
  hourglass: '<path d="M6.8 3.4h10.4M6.8 20.6h10.4"/><path d="M7.6 3.4h8.8L12 12l4.4 8.6H7.6L12 12Z"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="9.8" rx="3.2"/><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4"/>',
  block: '<circle cx="12" cy="12" r="8.6"/><path d="M6.2 17.8 17.8 6.2"/>',
  flag: '<path d="M6 3.4v17.2"/><path d="M6 4.6h11l-2 4 2 4H6Z"/>',
  shield: '<path d="M12 3.2 19.4 6v6c0 4.5-3.2 7.4-7.4 8.8C7.8 19.4 4.6 16.5 4.6 12V6Z"/>',
  eye: '<path d="M2.8 12S6.5 6.2 12 6.2 21.2 12 21.2 12 17.5 17.8 12 17.8 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.7"/>',
  eyeOff:
    '<path d="M4 4l16 16"/><path d="M9.4 6.7A9.6 9.6 0 0 1 12 6.2c5.5 0 9.2 5.8 9.2 5.8a17 17 0 0 1-2.7 3.3"/><path d="M15.4 15.6a9.4 9.4 0 0 1-3.4.6c-5.5 0-9.2-4.2-9.2-4.2a17 17 0 0 1 3.3-3.7"/>',
  mail: '<rect x="3" y="5.4" width="18" height="13.2" rx="3.4"/><path d="M3.9 7 12 13.2 20.1 7"/>',
  dice: '<rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.2"/><circle cx="9" cy="9" r="1.15" fill="%C%" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="%C%" stroke="none"/><circle cx="15" cy="15" r="1.15" fill="%C%" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.3" fill="%C%" stroke="none"/>',
  letterTile: '<rect x="4" y="4" width="16" height="16" rx="4.4"/><path d="M9.4 15.6 12 8.4l2.6 7.2"/><path d="M10.3 13.6h3.4"/>',
  nameTag: '<rect x="3" y="5.6" width="18" height="12.8" rx="3.6"/><circle cx="9" cy="11" r="2.1"/><path d="M5.9 16.2c0-1.7 1.4-2.7 3.1-2.7s3.1 1 3.1 2.7"/><path d="M14.8 10.2h3.4M14.8 13.6h3.4"/>',
  receipt: '<path d="M6 3.6h12v16.8l-3-1.8-3 1.8-3-1.8-3 1.8Z"/><path d="M9 8.4h6M9 12h6"/>',

  /* Social placeholders — category glyphs, NOT brand marks. Instagram, TikTok and Snapchat each publish
     an official SVG and require it unmodified; a hand-drawn lookalike is both a trademark problem and
     instantly readable as fake. These hold the slot until the real files are dropped in. `link` is the
     fallback for a handle whose platform has no mark on file. */
  camera: '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="16.9" cy="7.1" r="1.15" fill="%C%" stroke="none"/>',
  musicNote: '<circle cx="8.4" cy="17.4" r="3.2"/><path d="M11.6 17.4V4.6c2.2 2.6 4 3.4 6.4 3.6"/>',
  ghost: '<path d="M5.6 20.4V11a6.4 6.4 0 0 1 12.8 0v9.4l-2.6-1.8-2.1 1.8-1.7-1.5-1.7 1.5-2.1-1.8Z"/><circle cx="9.8" cy="10.8" r="1.1" fill="%C%" stroke="none"/><circle cx="14.2" cy="10.8" r="1.1" fill="%C%" stroke="none"/>',
  link: '<path d="M10.2 13.8a3.6 3.6 0 0 1 0-5.1l2.9-2.9a3.6 3.6 0 0 1 5.1 5.1l-1.4 1.4"/><path d="M13.8 10.2a3.6 3.6 0 0 1 0 5.1l-2.9 2.9a3.6 3.6 0 0 1-5.1-5.1l1.4-1.4"/>',
  school: '<path d="M12 3.4 21 8l-9 4.6L3 8Z"/><path d="M6.6 10.4v5.2c0 2 2.4 3.4 5.4 3.4s5.4-1.4 5.4-3.4v-5.2"/>'
} as const;

export type AuraIconName = keyof typeof PATHS;

/** Every name, for the gallery screen and for exhaustiveness checks. */
export const AURA_ICON_NAMES = Object.keys(PATHS) as AuraIconName[];

/** The design's stated stroke weights: 2.2 everywhere, 2.6 for the active tab. */
export const ICON_WEIGHT = 2.2;
export const ICON_WEIGHT_ACTIVE = 2.6;

export type AuraIconProps = {
  name: AuraIconName;
  /* 21 header pills and row trailing · 24 tab bar and list leading · 28 cream card tiles · 40 empty
     and error states. Never below 18 — below that the strokes fill in and the shape is mud. */
  size?: number;
  color?: string;
  weight?: number;
  /* Fills the glyph with its own colour instead of leaving it an outline.

     For counters, where the same mark has to read as "you have this" and "you spent it" at a glance.
     A colour change alone is weak at 34pt against a dark ground; solid-versus-hollow carries across
     the room. Only meaningful on closed shapes — an outline-only glyph like `search` fills into a
     blob. Sub-elements that set their own fill (the coin's disc, the dice pips) are unaffected. */
  filled?: boolean;
};

export function AuraIcon({ name, size = 24, color = '#FFFFFF', weight = ICON_WEIGHT, filled = false }: AuraIconProps) {
  /* Memoised because SvgXml re-parses the markup whenever the string identity changes, and these sit
     in list rows and the tab bar — every Inbox row would otherwise re-parse its icon on each render.
     Colour and weight are almost always constant per call site, so this is a near-permanent cache. */
  const xml = useMemo(() => {
    /* Knockout strokes (%W%) are scaled so the cut stays ~1.7px *rendered*, whatever the icon's size.
       A 2.2 stroke on a 24-unit grid drawn at 13px is a 1.2px gap, which closes up — the coin in the
       reroll price chip lost its "C" entirely and read as a plain disc. */
    const cut = Math.max(weight, (1.7 * 24) / size).toFixed(2);
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? color : 'none'}" stroke="${color}" ` +
      `stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">` +
      PATHS[name].split('%C%').join(color).split('%W%').join(cut) +
      '</svg>'
    );
  }, [name, size, color, weight, filled]);

  return <SvgXml xml={xml} width={size} height={size} />;
}
