/* Every gameplay and economy number in one place.

   These were previously scattered as `const COST = 100` inside the resolver that happened to need
   them, which meant tuning the app involved grepping four modules and hoping you found all of them.
   They're gathered here for two reasons: one file to read when deciding how the game should feel, and
   one file to change when it should feel different.

   **Overridable per environment.** Every value can be set with a Worker variable of the matching name
   (see the commented block in wrangler.toml). That means production can be retuned from the Cloudflare
   dashboard — no code change, no deploy, no App Store review — which matters because most of these are
   guesses that only real students can settle.

   What is deliberately NOT here: MIN_AGE (a compliance floor, not a dial), and the anonymity floor's
   *purpose* — COHORT_FLOOR appears below because its number is arguable, but lowering it trades away
   real anonymity, so it isn't a growth lever. */

export type Tuning = {
  /* Rounds a player gets per clock hour. The biggest single dial: it sets how much app you get.

     Hourly, not daily. A daily allowance meant one visit and a wait until tomorrow — the app was over
     by lunchtime and had nothing to bring anyone back the same day. On the hour, "come back later"
     means later today, which is the difference between a habit and a chore. The reset lands on the
     UTC hour boundary for everyone rather than an hour after your last round: a fixed clock is
     something you can learn, and it can't be gamed by timing when you start. */
  roundsPerHour: number;
  /** Cost to swap one question's four candidates for four different ones. */
  rerollCost: number;
  /* Paid per vote, the moment it lands. The round used to pay only on completion, which meant nine
     answered questions and a closed app were worth nothing — every question now banks something on its
     own, and finishing is a bonus on top rather than the only way to earn. */
  votePayout: number;
  /* The completion bonus, paid only when *every* question in the round is answered. Partial rounds keep
     what their votes earned and get none of this — that's the whole point of it being a bonus.

     The Infinite Aura rate is level with it on purpose: the subscription's value is the daily flips,
     not a currency multiplier — paying members more would just deflate the currency for the people the
     shop is trying to sell to. */
  roundBonus: number;
  roundBonusInfiniteAura: number;
  /* Name reveals ("flips") a member gets per day.

     A card has two states — face down, showing the poll and the sender's gender, or flipped, showing
     their name and grade. This is the whole economy of getting from one to the other, and coins are
     deliberately not part of it: a name is the one thing Infinite Aura sells, so it cannot also be for
     sale by the coin. (The clue ladder that used to sell the grade and first initial as separate
     scratch-off tiles, with a free one a day, is gone — this replaced it.)

     Counted per *card*, not per person — five picks from the same classmate are five flips — because
     the card is the unit on screen and pretending otherwise makes the allowance unreadable. Set to 0
     to switch flips off entirely; there is no "unlimited" setting, deliberately. */
  dailyFlips: number;
  /** For keeping your streak alive, on top of everything the round itself paid. */
  streakBonus: number;
  /* Coins for an invite that converts. NOT PAID OUT YET — invite attribution doesn't exist (see
     DESIGN-REQUESTS §3.2/§6.1), so this is the number the Shop advertises and nothing credits. */
  inviteBonus: number;
  /* Coin packs, smallest to largest. Sizes only: the *prices* deliberately aren't here, because
     StoreKit returns the localized price string and hardcoding "$1.99" would be wrong in every other
     currency and stale the moment App Store Connect changes. */
  coinPackSmall: number;
  coinPackMedium: number;
  coinPackLarge: number;
  /** Random boost: cost, and how many polls it inserts you into. */
  boostRandomCost: number;
  boostRandomUses: number;
  /** Crush boost: cost, and how many of that person's polls it inserts you into. */
  boostCrushCost: number;
  boostCrushUses: number;
  /** Most boosted candidates that can be spliced into a single round. */
  maxBoostPerRound: number;
  /** Questions in one round (also the cap on how many polls a round draws). */
  questionsPerRound: number;
  /* How much being friends weights someone into your polls, relative to a plain schoolmate. These
     were module constants in pollRound.ts, which made the People screen's "3× likelier to show up"
     copy a number duplicated by hand in the client — the exact drift this file exists to stop. The
     ratio is served to the client (PollRound.followWeightFactor) rather than retyped there.

     One weight, not two: following had a stronger number for people you followed and a weaker one for
     people who followed you, and a friendship is symmetric. */
  weightFriend: number;
  weightSchoolmate: number;
  /** Days a aura stays in the inbox. */
  auraLifetimeDays: number;
  /* People who must share a (gender, grade) cohort before a aura will show the sender's gender.
     **0 — off by default.** Gender is a free attribute on every card; see the note in auras.ts for
     what turning it back on protects and what it costs. Raise it per environment if a school ever
     needs it. */
  cohortFloor: number;
  /** People at a school before the Ranks board unlocks. */
  schoolUnlockThreshold: number;
  /** Rows the board returns, and the tier "N more auras cracks the top 10" refers to. */
  boardLimit: number;
  boardTopTier: number;
};

export const TUNING_DEFAULTS: Tuning = {
  roundsPerHour: 1,
  rerollCost: 5,
  votePayout: 1,
  roundBonus: 10,
  roundBonusInfiniteAura: 10,
  dailyFlips: 2,
  streakBonus: 20,
  inviteBonus: 25,
  coinPackSmall: 25,
  coinPackMedium: 100,
  coinPackLarge: 300,
  boostRandomCost: 100,
  boostRandomUses: 3,
  boostCrushCost: 300,
  boostCrushUses: 6,
  maxBoostPerRound: 4,
  questionsPerRound: 10,
  weightFriend: 3,
  weightSchoolmate: 1,
  auraLifetimeDays: 30,
  cohortFloor: 0,
  schoolUnlockThreshold: 20,
  boardLimit: 25,
  boardTopTier: 10
};

/** Worker variable name for each dial — AURA_ROUNDS_PER_HOUR, AURA_REROLL_COST, and so on. */
export const TUNING_ENV_KEYS: Record<keyof Tuning, string> = {
  roundsPerHour: 'AURA_ROUNDS_PER_HOUR',
  rerollCost: 'AURA_REROLL_COST',
  votePayout: 'AURA_VOTE_PAYOUT',
  roundBonus: 'AURA_ROUND_BONUS',
  roundBonusInfiniteAura: 'AURA_ROUND_BONUS_INFINITE_AURA',
  dailyFlips: 'AURA_DAILY_FLIPS',
  streakBonus: 'AURA_STREAK_BONUS',
  inviteBonus: 'AURA_INVITE_BONUS',
  coinPackSmall: 'AURA_COIN_PACK_SMALL',
  coinPackMedium: 'AURA_COIN_PACK_MEDIUM',
  coinPackLarge: 'AURA_COIN_PACK_LARGE',
  boostRandomCost: 'AURA_BOOST_RANDOM_COST',
  boostRandomUses: 'AURA_BOOST_RANDOM_USES',
  boostCrushCost: 'AURA_BOOST_CRUSH_COST',
  boostCrushUses: 'AURA_BOOST_CRUSH_USES',
  maxBoostPerRound: 'AURA_MAX_BOOST_PER_ROUND',
  questionsPerRound: 'AURA_QUESTIONS_PER_ROUND',
  weightFriend: 'AURA_WEIGHT_FRIEND',
  weightSchoolmate: 'AURA_WEIGHT_SCHOOLMATE',
  auraLifetimeDays: 'AURA_LIFETIME_DAYS',
  cohortFloor: 'AURA_COHORT_FLOOR',
  schoolUnlockThreshold: 'AURA_SCHOOL_UNLOCK_THRESHOLD',
  boardLimit: 'AURA_BOARD_LIMIT',
  boardTopTier: 'AURA_BOARD_TOP_TIER'
};

/* Reads the overrides out of the Worker env, falling back to the defaults above.

   Non-numeric or negative values are ignored rather than applied: a typo in a dashboard variable
   should leave the game playable, not set the daily limit to NaN and lock everyone out. Zero is
   allowed — "free reroll" is a legitimate setting — but a negative price is not. */
export function resolveTuning(env: Record<string, unknown>): Tuning {
  const resolved = { ...TUNING_DEFAULTS };
  for (const key of Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[]) {
    const raw = env[TUNING_ENV_KEYS[key]];
    if (raw === undefined || raw === null) continue;
    /* Trimmed and checked for emptiness *before* Number(), because `Number("")` and `Number("   ")`
       are both 0 — not NaN. Without this, a dashboard variable holding a stray space would read as a
       deliberate zero and set the daily round limit to nothing, locking every player out of the app.
       Found by test/tuning.test.ts, which is the entire reason that file exists. */
    const text = String(raw).trim();
    if (text === '') continue;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) continue;
    resolved[key] = Math.floor(value);
  }
  return resolved;
}
