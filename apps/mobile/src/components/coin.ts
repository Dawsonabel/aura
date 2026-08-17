/* 15A's currency palette.

   **Yellow, on every surface** — the glyph, its number, the balance card and any price pill. Nothing
   else in the app owns yellow outright, so a coin is recognisable before it's read.

   This reverses an earlier pass that made the coin silver. The reasoning that changed: grey is now
   reserved for the *unscratched foil* that wipes off to reveal what's underneath, so spending it on the
   currency as well would have put the same neutral on two unrelated jobs.

   It also retires "candy": the currency is coins, which is what the database column has always been
   called (`coins`), so the UI and the schema finally agree. */
export const COIN_FILL = '#FFD84D';
export const COIN_SHADOW = '#D4AC17';
/** Ink for anything sitting *on* a yellow fill — the coin glyph inside a yellow disc. */
export const COIN_INK = '#3A2A00';
