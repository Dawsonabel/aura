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
  /** Rounds a player gets per UTC day. The biggest single dial: it sets how much app you get a day. */
  dailyRoundLimit: number;
  /** Coins to swap one question's four candidates for four different ones. */
  rerollCost: number;
  /* Coins paid for finishing a round. 15A's Shop advertises "+10", so this is what that promise costs.
     The Infinite Aura rate is level with it on purpose: the subscription's value is unlimited clues and
     first names, not a coin multiplier — paying members more coins would just deflate the currency for
     the people the shop is trying to sell to. */
  roundPayout: number;
  roundPayoutGodMode: number;
  /* The clue ladder — 15A "Infinite Aura". Four rungs per flame, in this order:
       who (gender)  free
       grade         clueGradeCost
       initial       clueInitialCost
       first name    Infinite Aura only, and coins can never buy it
     Priced separately even though both are 1 today, because the whole point of the ladder is that the
     rungs can be tuned against each other. */
  clueGradeCost: number;
  clueInitialCost: number;
  /* One clue free per day, "every day at 3pm" — stored as the UTC hour it lands, matching the round
     push (20:15 UTC ≈ 3:15pm US Eastern). Set to 24 to switch the free clue off entirely. */
  freeClueHourUtc: number;
  /** Coins for keeping your streak alive, on top of the round payout. */
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
  /* How much following someone weights them into your polls, relative to a plain schoolmate. These
     were module constants in pollRound.ts, which made the People screen's "3× likelier to show up"
     copy a number duplicated by hand in the client — the exact drift this file exists to stop. The
     ratio is served to the client (PollRound.followWeightFactor) rather than retyped there. */
  weightFollowing: number;
  weightFollower: number;
  weightSchoolmate: number;
  /** Days a flame stays in the inbox. */
  flameLifetimeDays: number;
  /** People who must share a (gender, grade) cohort before a flame will name either. */
  cohortFloor: number;
  /** People at a school before the Ranks board unlocks. */
  schoolUnlockThreshold: number;
  /** Rows the board returns, and the tier "N more flames cracks the top 10" refers to. */
  boardLimit: number;
  boardTopTier: number;
};

export const TUNING_DEFAULTS: Tuning = {
  dailyRoundLimit: 3,
  rerollCost: 3,
  roundPayout: 10,
  roundPayoutGodMode: 10,
  clueGradeCost: 1,
  clueInitialCost: 1,
  freeClueHourUtc: 20,
  streakBonus: 5,
  inviteBonus: 25,
  coinPackSmall: 25,
  coinPackMedium: 100,
  coinPackLarge: 300,
  boostRandomCost: 100,
  boostRandomUses: 3,
  boostCrushCost: 300,
  boostCrushUses: 6,
  maxBoostPerRound: 4,
  questionsPerRound: 12,
  weightFollowing: 3,
  weightFollower: 2,
  weightSchoolmate: 1,
  flameLifetimeDays: 30,
  cohortFloor: 5,
  schoolUnlockThreshold: 20,
  boardLimit: 25,
  boardTopTier: 10
};

/** Worker variable name for each dial — AURA_DAILY_ROUND_LIMIT, AURA_REROLL_COST, and so on. */
export const TUNING_ENV_KEYS: Record<keyof Tuning, string> = {
  dailyRoundLimit: 'AURA_DAILY_ROUND_LIMIT',
  rerollCost: 'AURA_REROLL_COST',
  roundPayout: 'AURA_ROUND_PAYOUT',
  roundPayoutGodMode: 'AURA_ROUND_PAYOUT_GODMODE',
  clueGradeCost: 'AURA_CLUE_GRADE_COST',
  clueInitialCost: 'AURA_CLUE_INITIAL_COST',
  freeClueHourUtc: 'AURA_FREE_CLUE_HOUR_UTC',
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
  weightFollowing: 'AURA_WEIGHT_FOLLOWING',
  weightFollower: 'AURA_WEIGHT_FOLLOWER',
  weightSchoolmate: 'AURA_WEIGHT_SCHOOLMATE',
  flameLifetimeDays: 'AURA_FLAME_LIFETIME_DAYS',
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
