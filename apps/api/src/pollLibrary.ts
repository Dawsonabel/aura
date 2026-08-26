/* The curated prompt list.

   Two jobs, which is why it lives in its own module rather than inside schema.ts: it backs the admin
   "add from library" picker (the `pollLibrary` query), and it's the seed set for a fresh database (see
   seedDefaultPolls in migrations.ts). Keeping it here lets the migration script import it without
   pulling in graphql-yoga and the whole resolver graph.

   Prompts are *content*, so they keep their emoji — 15A's rule is that chrome is drawn and content is
   typed, and a new prompt has to be shippable by an admin without a design pass. */
export const POLL_LIB: [emoji: string, text: string, color: string][] = [
  ['💎', 'Cooler than anyone knows', '#A31CEE'],
  ['🥦', 'Thinks about Lil Yachty every time they eat broccoli', '#5E7A8A'],
  ['🤟', 'Could rock a sleeve of tattoos', '#2E5D52'],
  ['🤴', 'Most likely to have a Disney prince or princess made in their image', '#A31CEE'],
  ['👩‍🎓', 'Most likely to be valedictorian', '#22C63E'],
  ['😍', 'The girl every guy wants to date & the guy every girl wants to date', '#EF5350'],
  ['😁', 'Best smile in the whole grade', '#FF2E93'],
  ['🔥', 'Most likely to be famous', '#FF6A1A'],
  ['🎤', 'Would win a talent show', '#5B4BE0'],
  ['🛏️', 'Rolls out of bed looking on point', '#8A6A5E'],
  ['🧠', 'Smartest in the room, always', '#12B886'],
  ['✨', 'Glows different, no cap', '#D01E8E'],
  ['🎨', 'Most creative person I know', '#EF5350'],
  ['😂', 'Funniest person alive', '#2AA9E0'],
  ['🍀', 'Luckiest person to know', '#12B886'],
  ['🌟', 'Lights up every room they walk in', '#2E5D52']
];
