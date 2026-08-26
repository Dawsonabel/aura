/* Sparks — the currency.

   **Yellow, on every surface** — the glyph, its number, the balance and any price. Nothing else in the
   app owns yellow outright, so a spark is recognisable before it's read.

   The glyph is a lightning bolt, and it's called `bolt` in AuraIcon rather than `spark`: icons in this
   set are named for what they draw (dice, trophy, ballot), the currency is named for what it is, and
   `spark` would sit one letter from the unrelated `sparkle` star. Two names, on purpose.

   Sparks were coins, and candy before that. The database column has been `coins` throughout and still
   is — renaming a live JSONB key across every user row buys nothing the UI can't do at the boundary,
   which is the same call 15A made when Infinite Aura became Infinite Aura. So: sparks on screen, `coins` in
   the schema, and the translation happens where it's rendered. */
export const SPARK_FILL = '#FFD84D';
export const SPARK_SHADOW = '#D4AC17';
/** Ink for anything sitting *on* a yellow fill — the bolt inside a yellow tile. */
export const SPARK_INK = '#3A2A00';
