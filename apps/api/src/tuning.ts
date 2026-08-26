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
  /* The candidate sampler's other factors, as integer percentages — 100 is neutral, 200 doubles.
     Percent because dials are whole numbers (coerceDial floors) and "1.25×" has to be expressible.
     They multiply into the base weight above; see candidateWeight in pollRound.ts for the model and
     the windows. All quiet: none of these is printed anywhere a student can see.

     weightLoyalPct       — cast a vote in the last 7 days: people who play get seen.
     weightCrossGenderPct — viewer and candidate are girl/boy opposites; non-binary, unset and
                            "rather not say" are neutral on both sides.
     weightUnderdogPct    — received nothing in the last 7 days, so the pool tilts toward whoever the
                            school has been overlooking. (The *never picked at all* case gets a hard
                            guaranteed seat in buildRound on top of this.)
     weightMemberPct      — Infinite Aura members, deliberately mild. */
  weightLoyalPct: number;
  weightCrossGenderPct: number;
  weightUnderdogPct: number;
  weightMemberPct: number;
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
  weightLoyalPct: 200,
  weightCrossGenderPct: 200,
  weightUnderdogPct: 400,
  weightMemberPct: 125,
  auraLifetimeDays: 30,
  cohortFloor: 0,
  schoolUnlockThreshold: 20,
  /* Ten, matching boardTopTier — the board shows the top tier and stops.
     Cut from 25 deliberately, and enforced here rather than by slicing on the client: at 25 the server
     was still sending ranks 11–25, so "we don't show it" would have meant the standings were in the
     payload of every student at the school regardless. Being ranked 19th out of 43 is not a fact
     anyone signed up to publish. `aurasToTopTen` is unaffected — board.ts reads 10th place off the
     full ranking before this slice, and the caller's own row is pinned whether or not it makes the
     cut, so someone outside the tier still sees where they stand. */
  boardLimit: 10,
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
  weightLoyalPct: 'AURA_WEIGHT_LOYAL_PCT',
  weightCrossGenderPct: 'AURA_WEIGHT_CROSS_GENDER_PCT',
  weightUnderdogPct: 'AURA_WEIGHT_UNDERDOG_PCT',
  weightMemberPct: 'AURA_WEIGHT_MEMBER_PCT',
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
    const value = coerceDial(env[TUNING_ENV_KEYS[key]]);
    if (value !== null) resolved[key] = value;
  }
  return resolved;
}

/* One validator for every path a dial value can arrive by — env var, admin mutation, DB row.

   Trimmed and checked for emptiness *before* Number(), because `Number("")` and `Number("   ")`
   are both 0 — not NaN. Without this, a dashboard variable holding a stray space would read as a
   deliberate zero and set the daily round limit to nothing, locking every player out of the app.
   Found by test/tuning.test.ts, which is the entire reason that file exists. Zero is allowed —
   "free reroll" is a legitimate setting — but a negative price is not. */
export function coerceDial(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/* The admin layer, applied on top of what env resolved.

   Precedence is defaults < env < DB, and the order is deliberate: the admin site is the product
   owner's console, so a dial set there must actually win — an env var silently outranking the UI
   would make the tuning page lie. Env stays useful as the dev/test knob (the API tests mutate the
   env object directly, and their DB is wiped every run so no override rows survive to fight them).

   Unknown keys and invalid values are skipped, same posture as resolveTuning: a bad row degrades to
   the env/default value rather than taking the game down. */
export function applyTuningOverrides(base: Tuning, overrides: Record<string, unknown>): Tuning {
  const resolved = { ...base };
  for (const key of Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[]) {
    if (!(key in overrides)) continue;
    const value = coerceDial(overrides[key]);
    if (value !== null) resolved[key] = value;
  }
  return resolved;
}
