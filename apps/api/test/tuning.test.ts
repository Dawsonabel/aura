import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING_DEFAULTS, TUNING_ENV_KEYS, resolveTuning, type Tuning } from '../src/tuning';

/* Pure-function tests, deliberately importing src/tuning directly rather than ./helpers.

   Every other file in here imports the harness, which loads .dev.vars, builds a Clerk client and
   insists on a disposable TEST_DATABASE_URL — none of which this needs. Keeping it out means these run
   in milliseconds and still pass if the database is unreachable.

   They exist because the rest of the suite only ever exercises the *defaults*: a broken override — a
   mistyped env key, a bad cast — would leave all 48 other tests green and only show up as "I changed
   the dial in the dashboard and nothing happened". */

const keys = Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[];

test('every dial has an env key, and no two dials share one', () => {
  /* The failure this guards against: adding a dial to TUNING_DEFAULTS and forgetting the matching
     entry in TUNING_ENV_KEYS, which silently makes that dial un-overridable in production. */
  for (const key of keys) {
    assert.ok(TUNING_ENV_KEYS[key], `${key} has no env key`);
    assert.match(TUNING_ENV_KEYS[key], /^AURA_[A-Z0-9_]+$/, `${TUNING_ENV_KEYS[key]} is not an AURA_ var`);
  }
  const names = keys.map(k => TUNING_ENV_KEYS[k]);
  assert.equal(new Set(names).size, names.length, 'two dials share an env variable name');
});

test('with nothing set, every dial falls back to its default', () => {
  assert.deepEqual(resolveTuning({}), TUNING_DEFAULTS);
});

test('each dial can actually be overridden by its own env var', () => {
  /* Checked one dial at a time rather than all at once: a copy-paste error where two keys read the
     same variable would still pass a bulk test, since both would end up "correct". */
  for (const key of keys) {
    const override = TUNING_DEFAULTS[key] + 7;
    const resolved = resolveTuning({ [TUNING_ENV_KEYS[key]]: String(override) });
    assert.equal(resolved[key], override, `${TUNING_ENV_KEYS[key]} did not change ${key}`);
    // And it must not disturb anything else.
    for (const other of keys) {
      if (other === key) continue;
      assert.equal(resolved[other], TUNING_DEFAULTS[other], `${TUNING_ENV_KEYS[key]} also changed ${other}`);
    }
  }
});

test('garbage and negative values are ignored, not applied', () => {
  const key = TUNING_ENV_KEYS.dailyRoundLimit;
  // A typo in a dashboard variable must leave the game playable rather than setting a limit of NaN.
  for (const bad of ['abc', '', '   ', 'NaN', 'Infinity', '-1', '-100']) {
    assert.equal(
      resolveTuning({ [key]: bad }).dailyRoundLimit,
      TUNING_DEFAULTS.dailyRoundLimit,
      `"${bad}" should have been ignored`
    );
  }
  // null/undefined arrive when a var is declared but empty.
  assert.equal(resolveTuning({ [key]: null }).dailyRoundLimit, TUNING_DEFAULTS.dailyRoundLimit);
  assert.equal(resolveTuning({ [key]: undefined }).dailyRoundLimit, TUNING_DEFAULTS.dailyRoundLimit);
});

test('zero is a legal setting, and fractions are floored', () => {
  // A free reroll is a real thing someone might want, so 0 must not be treated as "unset".
  assert.equal(resolveTuning({ [TUNING_ENV_KEYS.rerollCost]: '0' }).rerollCost, 0);
  // Counts and prices are whole numbers; 2.9 rounds down rather than producing a fractional price.
  assert.equal(resolveTuning({ [TUNING_ENV_KEYS.rerollCost]: '2.9' }).rerollCost, 2);
});

test('numbers work as well as strings', () => {
  // wrangler.toml vars arrive as strings, but a plain number shouldn't break it either.
  assert.equal(resolveTuning({ [TUNING_ENV_KEYS.dailyRoundLimit]: 5 }).dailyRoundLimit, 5);
});

test('unrelated env vars are left alone', () => {
  // The real env carries secrets alongside the dials; resolveTuning must ignore everything else.
  const resolved = resolveTuning({ DATABASE_URL: 'postgres://nope', CLERK_SECRET_KEY: 'sk_test_x' });
  assert.deepEqual(resolved, TUNING_DEFAULTS);
});
