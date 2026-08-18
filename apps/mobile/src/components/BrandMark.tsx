import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import type { SocialKey } from '@aura/api-client';

/* The three platforms' own marks, replacing the category glyphs that stood in for them.

   **These are not ours and are not drawn to Aura's icon rules.** Everything in AuraIcon is a 24-grid
   stroked path at one weight, redrawn to match Fredoka; these are the platforms' registered marks,
   filled, and they keep their own geometry. That's the whole point — a mark is only usable while it is
   *unmodified*, which is also why they can't live in AuraIcon's PATHS table where the shared
   stroke-width and colour would rewrite them.

   Why using them is fine, and where the line is: naming a platform you link to is nominative use — the
   row says "Instagram · @someone" and opens instagram.com, which is the thing the mark is for. What
   would not be fine is implying a relationship: no Aura logo fused with theirs, no "powered by", no
   recolouring or restretching the glyph itself. Placing the mono mark on a solid colour tile is the
   variant each brand publishes for exactly this.

   The lookalikes these replace were the riskier option, not the safer one: a redrawn Instagram glyph
   is a *modified* mark, which is what the guidelines actually prohibit, and it read as fake besides.

   Source: simple-icons (github.com/simple-icons/simple-icons), CC0 — which waives copyright in the
   path data and explicitly does not waive anyone's trademark rights, so the terms these are used under
   are each platform's brand guidelines, not the icon set's licence. Copied verbatim, same rule as
   AuraIcon: if one needs updating, re-fetch it rather than editing the numbers here. */

const MARKS: Record<SocialKey, string> = {
  instagram:
    'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  snapchat:
    'M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  /* Spotify has no mark here because 15A dropped it from the row. The key survives in SocialKey for
     the handles already stored (see socials.ts), so this map has to cover it — rendering nothing is
     the right answer for a slot the UI never shows. */
  spotify: ''
};

/** True when the platform has a mark to draw — `spotify` is the retired slot and has none. */
export function hasBrandMark(name: SocialKey): boolean {
  return MARKS[name].length > 0;
}

/* How each platform presents itself, which is theirs to decide and not ours.

   The flat colours these replace were picked out of the middle of each brand's palette and weren't
   lockups any of them publish:
     · Instagram's #E1306C is one stop sampled out of the gradient. The glyph is used either *on* that
       gradient or as a solid single colour — never on a flat slice of it, which reads as a knock-off
       of an icon everyone has seen ten thousand times.
     · TikTok's #25F4EE is the cyan offset channel of the glitch logo, not a background. The mono mark
       goes white-on-black (or black-on-light); a cyan tile is a colour they only ever use *torn*.
     · Snapchat was the one that was already right — Snap Yellow is the background. The ghost was
       inked near-black here, though, and the icon the world recognises is the white ghost.

   Gradients need real SVG, which is the other reason the tile moved in here: a React Native View can
   only take a flat backgroundColor, so the call sites physically couldn't render Instagram correctly. */
const TILES: Record<SocialKey, { fill: string; ink: string; outline?: string } | null> = {
  // url(#igGrad) is defined in the <defs> below — the official warm-to-blue radial.
  instagram: { fill: 'url(#igGrad)', ink: '#FFFFFF' },
  /* The outline is Blake's call, made knowingly (2026-08-17), and it is a deviation: Snap's guidelines
     take the Ghost as published — white, black, or Snap Yellow — and adding a stroke is a modification
     in the same sense the redrawn glyph was. It's here because white-on-Snap-Yellow is genuinely weak
     at 21px, which is the problem the black ghost also solves without touching the mark. If this ever
     needs to become compliant, the fix is one line: drop `outline` and set `ink` to '#000000'. */
  snapchat: { fill: '#FFFC00', ink: '#FFFFFF', outline: '#000000' },
  tiktok: { fill: '#000000', ink: '#FFFFFF' },
  spotify: null
};

const IG_GRADIENT =
  '<defs><radialGradient id="igGrad" cx="30%" cy="107%" r="150%">' +
  '<stop offset="0" stop-color="#FDF497"/><stop offset="0.05" stop-color="#FDF497"/>' +
  '<stop offset="0.45" stop-color="#FD5949"/><stop offset="0.6" stop-color="#D6249F"/>' +
  '<stop offset="0.9" stop-color="#285AEB"/></radialGradient></defs>';

/* The mark on its own tile, as one SVG — the platform's background, its corner radius, its mark, at
   its own contrast. One component so the profile row and the edit sheet can't drift, and so there is
   exactly one place to correct if a brand refreshes. */
export function BrandTile({ name, size = 38 }: { name: SocialKey; size?: number }) {
  const xml = useMemo(() => {
    const tile = TILES[name];
    const d = MARKS[name];
    if (!tile || !d) return null;
    // The mark at 55% of the tile, centred — roughly the clear space each brand asks for.
    const mark = size * 0.55;
    const offset = (size - mark) / 2;
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      (name === 'instagram' ? IG_GRADIENT : '') +
      `<rect width="${size}" height="${size}" rx="${(size * 0.32).toFixed(2)}" fill="${tile.fill}"/>` +
      `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${(mark / 24).toFixed(4)})">` +
      /* Stroke on the same element as the fill, so it paints over the fill's outer edge and the mark
         keeps its silhouette — a separate stroked copy underneath would fatten the shape instead.
         Width is in the 24-unit space, so it scales with the tile rather than thinning at larger sizes. */
      `<path d="${d}" fill="${tile.ink}"${
        tile.outline ? ` stroke="${tile.outline}" stroke-width="1.1" stroke-linejoin="round"` : ''
      }/></g></svg>`
    );
  }, [name, size]);

  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} />;
}

export function BrandMark({ name, size = 20, color = '#FFFFFF' }: { name: SocialKey; size?: number; color?: string }) {
  // Memoised for the same reason AuraIcon is: SvgXml re-parses whenever the string identity changes.
  const xml = useMemo(() => {
    const d = MARKS[name];
    if (!d) return null;
    return (
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">` +
      `<path d="${d}"/></svg>`
    );
  }, [name, size, color]);

  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} />;
}
