import { createSchema } from 'graphql-yoga';
import type { Db, User } from './db';
import type { RateLimiter } from './ratelimit';
import type { RoundStore } from './rounds';
import { buildRound, notBlocked, notify, rerollChoices, servedRound } from './pollRound';
import { flameBody, sendPush } from './push';
import { flamesFor } from './flames';
import { boardFor, type BoardScope } from './board';
import { advanceStreak, clueDay, currentStreak, utcDay } from './streak';
import { superlativesFor } from './profile';
import { verifySignedTransaction } from './iap';
import { POLL_LIB } from './pollLibrary';
import type { Tuning } from './tuning';

export interface Env {
  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  CLERK_SECRET_KEY: string;
  ALLOWED_ORIGIN?: string; // apps/web's origin, for CORS — see index.ts. Unset in dev, falls back to localhost.
  REDIS_KEY_PREFIX?: string; // scopes Upstash keys per environment — see makeRateLimiter/makeRoundStore.
  APPLE_ROOT_CA?: string; // Apple's root cert PEM — see iap.ts. Unset in dev/sandbox (relaxed trust anchor).
  GODMODE_PRODUCT_IDS?: string; // comma-separated StoreKit product IDs, mirrors server.js's GODMODE_PRODUCTS
  /* Gameplay/economy dials, all optional — see tuning.ts for the full list and defaults. Indexed
     rather than enumerated so adding a dial there doesn't need a matching edit here. */
  [tuningVar: string]: unknown;
}

const DEFAULT_GODMODE_PRODUCTS = 'aura.godmode.weekly,aura.godmode.lifetime';

const MIN_AGE = 13; // COPPA-safe floor — mirrors server.js's MIN_AGE exactly, same reasoning

/* `private` is a real stored value, not the absence of one: onboarding's "Rather not say" option
   has to persist, or the pickers come back blank and the user gets asked again. Clients label it
   from GENDER_LABEL in @aura/api-client — keep the two lists in step. */
const GENDERS = ['boy', 'girl', 'nonbinary', 'private'];

/** Mirrors SOCIALS in packages/api-client/src/socials.ts — keep the two lists in step. */
const SOCIAL_KEYS = ['instagram', 'snapchat', 'tiktok', 'spotify'] as const;

// The full context Yoga hands resolvers — the initial per-request fields (req/env/ip, set in
// index.ts's context factory) plus the derived ones (db/ratelimit/rounds/me). Yoga merges the
// initial context with whatever the `context` factory returns, so this has to describe that
// whole merge, not just the new fields, or its generic and createYoga's fight each other.
export type GraphQLContext = {
  req: Request; env: Env; ip: string;
  db: Db; ratelimit: RateLimiter; rounds: RoundStore;
  me: User | null; // null when unauthenticated — public queries (schools, school, pollLibrary) still work without it
  isAdmin: boolean; // derived from the Clerk role claim, independent of `me` — admins don't get/need a student profile row
  tuning: Tuning; // every gameplay/economy number, env-overridable — see tuning.ts
  // Cloudflare's ExecutionContext.waitUntil, threaded from index.ts. Push sends go through this so
  // their latency and failures stay off the mutation's critical path.
  waitUntil: (p: Promise<unknown>) => void;
};

/** One accessor for the follow list, since it's read in a dozen places. */
function followingOf(user: User): string[] {
  return ((user.following as string[]) || []).filter(id => typeof id === 'string');
}

function requireMe(ctx: GraphQLContext): User {
  if (!ctx.me) throw new Error('Not logged in');
  return ctx.me;
}
function requireAdmin(ctx: GraphQLContext): void {
  if (!ctx.isAdmin) throw new Error('Admin only');
}

/** The comparable part of a free-text grade: "11" and "Grade 11" are the same class. */
function gradeKey(grade: unknown): string | null {
  return typeof grade === 'string' ? grade.match(/\d+/)?.[0] ?? null : null;
}


const typeDefs = /* GraphQL */ `
  type School {
    id: ID!
    name: String!
    city: String
    createdAt: String!
    userCount: Int!
  }
  type User {
    id: ID!
    schoolId: ID
    """Resolved from schoolId on demand — only costs a lookup when actually selected."""
    school: School
    firstName: String
    lastName: String
    username: String
    gender: String
    grade: String
    age: Int
    onboarded: Boolean
    coins: Int
    godMode: Boolean
    # Who this user follows. One-directional and unapproved — following someone weights them into your
    # polls, it doesn't grant them anything. "friendIds" is the retired mutual-friend field.
    #
    # Only ever populated for yourself (or for an admin). 14A: "Nobody can see who you follow" — that
    # promise is printed on the People screen, so the field enforces it rather than trusting callers
    # not to select it on somebody else.
    following: [ID!]
    # Whether THIS user follows the caller. Viewer-relative, which is why it's a boolean rather than a
    # readable list: 14A's "Follows you" group needs the single bit, and nothing more than that bit.
    followsMe: Boolean!
    # How many people follow you. **Only ever your own** — 0 for anyone else, same rule as "following".
    # 14A bans follower counts because in a 200-person school a public one is a popularity score; your
    # own is self-knowledge, and it's still a count, never a list of who.
    followerCount: Int!
    # Rounds ever completed. Drives the "✋ HOLD" teaching chip, which 14A retires after three rounds.
    roundsTotal: Int!
    friendIds: [ID!]
    blocked: [ID!]
    hideTopFlames: Boolean
    photo: String
    # 7A notification preferences. Null means "never set", which the sender reads as its own default
    # (flames/rounds on, friend-joined off) rather than as off — see PREFS in push.ts.
    notifyFlames: Boolean
    notifyRound: Boolean
    notifyFriendJoined: Boolean
    quietHours: Boolean
    # Whether this account has at least one device registered for push. The prefs screen needs to
    # know, but the tokens themselves are never exposed.
    pushEnabled: Boolean!
    # Consecutive days with a completed round. Derived, not raw: a stored streak goes stale the moment
    # a day is missed, and nothing runs at midnight to reset it — see currentStreak in streak.ts.
    streak: Int!
    # Linktree-style handles for the Me tab. Handles only, never OAuth — see packages/api-client's
    # socials.ts for why. Unverified by design; nothing in the app treats them as identity.
    socials: Socials!
  }
  type Socials {
    instagram: String
    snapchat: String
    tiktok: String
    spotify: String
  }
  type Notification {
    id: ID!
    text: String!
    emoji: String!
    ts: String!
    read: Boolean!
  }
  type Suggestions {
    contacts: [User!]!
    fof: [User!]!
  }
  type RoundChoice {
    id: ID!
    name: String!
    # School year, so the candidate card's meta line is real. The school itself isn't sent: every
    # candidate is by definition at the viewer's own school, so the client already knows its name.
    grade: String
    boosted: Boolean
  }
  type RoundPoll {
    questionId: ID!
    emoji: String!
    text: String!
    color: String!
    choices: [RoundChoice!]!
  }
  type PollRound {
    roundId: ID!
    polls: [RoundPoll!]!
    canPlay: Boolean!
    boostedInserts: Int!
    # Rounds left today, out of dailyLimit, and when the allowance refills (next UTC midnight).
    # roundsLeft 0 with no polls is the "out of rounds" state.
    roundsLeft: Int!
    dailyLimit: Int!
    nextRoundAt: String!
    # What a reroll costs, so the button can show a price without hardcoding one.
    rerollCost: Int!
    # What finishing this round pays, God Mode rate included. 14A's "can't afford" sheet leads with
    # "Finish this round · earns N", and that N has to be the real one or the sheet is a lie.
    roundPayout: Int!
    # How many times likelier a followed classmate is to appear than a stranger. Served rather than
    # written into the client, so the People screen's "3× likelier" can't outlive the weights.
    followWeightFactor: Int!
    # Votes this user has cast today, for the out-of-rounds screen's "N votes cast today". Counted from
    # the votes table rather than inferred from rounds × questions, because skipping a question is
    # allowed — the inferred number would overstate it.
    votesToday: Int!
  }
  type RerollResult {
    choices: [RoundChoice!]!
    coins: Int!
  }
  # 15A's Shop, served rather than hardcoded in the client. Every number here comes straight from
  # tuning.ts, so the prices on screen and the prices charged cannot drift, and both move together from
  # a Cloudflare variable with no app release.
  #
  # What is NOT here: dollar prices. StoreKit returns the localized price string for each product, so a
  # "$1.99" baked in here would be wrong in every other currency and stale the moment App Store Connect
  # changes. The client shows the store's price next to these coin amounts.
  type Shop {
    coins: Int!
    # Clue ladder: who is free, grade and initial are priced, the first name is Infinite Aura only.
    clueGradeCost: Int!
    clueInitialCost: Int!
    # UTC hour the one free daily clue lands. 24 means the free clue is switched off.
    freeClueHourUtc: Int!
    # Whether the free tile is available *right now* — today's isn't spent and the hour has passed.
    # Derived server-side because the client can't know either half reliably: it doesn't have the
    # spent-marker, and trusting the device clock for the cutoff would let anyone claim it early.
    freeClueReady: Boolean!
    # EARN IT.
    roundPayout: Int!
    streakBonus: Int!
    # Advertised, but nothing credits it yet — invite attribution doesn't exist. See DESIGN-REQUESTS §3.2.
    inviteBonus: Int!
    # OR BUY IT — pack sizes, smallest to largest.
    coinPackSmall: Int!
    coinPackMedium: Int!
    coinPackLarge: Int!
    # SPEND IT.
    boostRandomCost: Int!
    boostRandomUses: Int!
    boostCrushCost: Int!
    boostCrushUses: Int!
    # Membership. The expiry is null for a legacy/comped unlock with no purchase behind it.
    infiniteAura: Boolean!
    infiniteAuraExpires: String
  }
  type VoteResult {
    ok: Boolean!
    dup: Boolean
  }
  type RoundCompleteResult {
    coins: Int!
    earned: Int!
    already: Boolean
  }
  type Flame {
    id: ID!
    emoji: String!
    q: String!
    color: String!
    gender: String!
    grade: String!
    revealed: Boolean!
    # 16A: the grade tile is bought separately. Until it is, the grade field above comes back empty.
    gradeRevealed: Boolean!
    godMode: Boolean!
    unread: Boolean!
    anonymous: Boolean!
    initial: String
    name: String
    repeatAdmirer: Boolean!
    pickCount: Int!
    ts: String!
    # True when gender/grade were withheld because too few people at the school share that cohort to
    # keep the sender anonymous — see COHORT_FLOOR in flames.ts. Those fields are blanked in the
    # payload too, so a client that ignores this flag still can't leak them.
    detailHidden: Boolean!
  }
  type FlamesResult {
    flames: [Flame!]!
    coins: Int!
    godMode: Boolean!
    bonusRevealsLeft: Int!
    # Legacy — always 0. Infinite Aura gives unlimited first names, so there is no remaining count to
    # report. Kept until the clients stop selecting it.
    # Distinct people who picked you in the last 7 days — the Inbox subtitle's number. A count only:
    # deriving it server-side is what keeps voter ids out of the client while still letting the
    # screen say "7 people" instead of "7 flames" (one person can send several).
    admirerCount: Int!
  }
  # 16A. usedFreeClue tells the client the daily free tile was spent rather than coins, so the balance
  # not moving isn't mistaken for a failed charge.
  type ClueResult {
    ok: Boolean!
    coins: Int!
    usedFreeClue: Boolean!
  }
  type RevealResult {
    ok: Boolean!
    coins: Int!
  }
  type RevealNameResult {
    name: String!
    bonusRevealsLeft: Int!
  }
  type CoinResult {
    coins: Int!
    message: String
  }
  type IapResult {
    godMode: Boolean!
    expired: Boolean
    expires: String
    environment: String
    renewed: Boolean
  }
  type Poll {
    id: ID!
    emoji: String!
    text: String!
    color: String!
    enabled: Boolean!
    schoolId: ID
    createdAt: String!
  }
  type PollLibItem {
    emoji: String!
    text: String!
    color: String!
  }
  type Vote {
    id: ID!
    voterId: ID!
    targetId: ID!
    questionId: ID
    emoji: String!
    text: String!
    color: String!
    revealed: Boolean!
    unread: Boolean!
    ts: String!
    voterName: String!
    targetName: String!
  }
  type Report {
    id: ID!
    byUserId: ID
    targetId: ID
    reason: String!
    status: String!
    ts: String!
    byName: String!
    targetName: String!
  }
  # 8A's blocked list. blockedAt is null for anyone blocked before timestamps existed, and
  # reportOpen is about the *caller's own* report on that person — it's what mutes Unblock while an
  # admin still has the case. Kept separate from the plain "blocked" query, which apps/web uses and
  # which has no business growing viewer-relative fields.
  type BlockedPerson {
    user: User!
    blockedAt: String
    reportOpen: Boolean!
  }
  # 12A / README §5's Ranks board. A row's rank and flame count are always the true ones; only the
  # identity is masked when the caller has blocked that person (8A "Blocked on the board").
  type BoardEntry {
    rank: Int!
    userId: ID!
    name: String!
    grade: String
    flames: Int!
    blocked: Boolean!
  }
  type Board {
    entries: [BoardEntry!]!
    # The caller's own pinned row — null when they have no flames in the window at all.
    me: BoardEntry
    # Flames needed to reach the top 10, or null when already there / nobody's ranked deep enough.
    flamesToTopTen: Int
    # When the weekly board resets (next UTC Sunday) — the countdown pill reads from this.
    resetsAt: String!
    scope: String!
    # The board stays locked until a school reaches unlockThreshold people. While locked, entries is
    # empty — the standings are withheld server-side, not merely hidden by the client.
    memberCount: Int!
    unlockThreshold: Int!
    unlocked: Boolean!
  }
  # 13A's Profile. Superlative = a prompt you've been picked for, with how many times.
  type Superlative {
    emoji: String!
    text: String!
    color: String!
    count: Int!
  }
  # The public view of someone else, opened from a Ranks row. Deliberately narrower than User: no
  # coins, no streak, no notification prefs, and never anything about who picked them.
  type PublicProfile {
    id: ID!
    name: String!
    username: String
    grade: String
    gender: String
    schoolName: String
    flames: Int!
    rank: Int
    superlatives: [Superlative!]!
    socials: Socials!
    blocked: Boolean!
  }
  type AdminStats {
    schools: Int!
    users: Int!
    polls: Int!
    votes: Int!
    godMode: Int!
    reports: Int!
  }
  type Query {
    schools: [School!]!
    school(id: ID!): School
    user(id: ID!): User
    users(schoolId: ID): [User!]!
    polls: [Poll!]!
    pollLibrary: [PollLibItem!]!
    votes(limit: Int): [Vote!]!
    reports: [Report!]!
    adminStats: AdminStats!

    me: User!
    blockedPeople: [BlockedPerson!]!
    # scope: "overall" (this week) | "grade" (this week, my grade) | "trending" (last 24h)
    board(scope: String): Board!
    # Everyone at my school except me, blocked people included — 8A's report picker has to be able
    # to find and grey them out. Distinct from "suggestions", which hides blocked users and splits
    # the rest into two arbitrary halves for the friend-suggestion UI.
    schoolmates: [User!]!
    # 13A: your own trophy chips, and someone else's public profile. publicProfile is same-school only.
    mySuperlatives: [Superlative!]!
    publicProfile(userId: ID!): PublicProfile
    # Handle availability for the edit sheet. Case-insensitive; your own current handle counts as free.
    usernameAvailable(username: String!): Boolean!
    suggestions: Suggestions!
    friends: [User!]!
    blocked: [User!]!
    notifications: [Notification!]!
    pollRound: PollRound!
    flames: FlamesResult!
    shop: Shop!
  }
  # Each field is tri-state: omitted leaves it alone, a handle sets it, null clears it.
  input SocialsInput {
    instagram: String
    snapchat: String
    tiktok: String
    spotify: String
  }
  type Mutation {
    createSchool(name: String!, city: String): School!
    updateSchool(id: ID!, name: String, city: String): School
    deleteSchool(id: ID!): Boolean!
    createPoll(emoji: String!, text: String!, color: String!, schoolId: ID, enabled: Boolean): Poll!
    updatePoll(id: ID!, emoji: String, text: String, color: String, enabled: Boolean, schoolId: ID): Poll
    deletePoll(id: ID!): Boolean!
    # Inserts the curated prompt list as global polls, so every school can build a round. Returns how
    # many were added — 0 when global polls already exist, so it's safe to press twice.
    seedDefaultPolls: Int!
    deleteVote(id: ID!): Boolean!
    resolveReport(id: ID!): Report
    adminUpdateUser(
      id: ID!, schoolId: ID, grade: String, coins: Int, godMode: Boolean,
      firstName: String, lastName: String, username: String
    ): User
    adminDeleteUser(id: ID!): Boolean!

    updateMe(
      firstName: String, lastName: String, username: String, gender: String, grade: String,
      age: Int, schoolId: ID, photo: String, onboarded: Boolean, hideTopFlames: Boolean,
      notifyFlames: Boolean, notifyRound: Boolean, notifyFriendJoined: Boolean, quietHours: Boolean,
      socials: SocialsInput
    ): User!
    # 7A: one device's Expo push token, plus its UTC offset so quiet hours can be evaluated in the
    # user's own local time (see inQuietHours in push.ts). Called on every launch once permission is
    # granted, so it has to be idempotent.
    registerPushToken(token: String!, tzOffsetMinutes: Int): Boolean!
    deleteMe: Boolean!
    block(userId: ID!): [ID!]!
    unblock(userId: ID!): [ID!]!
    # follow/unfollow are the real names; addFriend/removeFriend are kept as aliases so apps/web keeps
    # working, and both write the same one-directional "following" list.
    follow(userId: ID!): [ID!]!
    unfollow(userId: ID!): [ID!]!
    # 14A's "Follow all of 11th grade" row. One call rather than 86, and idempotent: people you already
    # follow (or have blocked) are skipped, so tapping it twice is harmless.
    followGrade(grade: String!): [ID!]!
    addFriend(userId: ID!): [ID!]!
    removeFriend(userId: ID!): [ID!]!
    # Costs coins and replaces one question's four candidates with four different ones.
    rerollQuestion(roundId: ID!, questionId: ID!): RerollResult!
    reportUser(userId: ID, reason: String): Boolean!
    markNotificationsRead: Boolean!
    vote(questionId: ID!, targetId: ID!, roundId: ID!): VoteResult!
    completeRound(roundId: ID!): RoundCompleteResult!
    markFlamesRead: Boolean!
    # 16A's clue ladder. clue: "grade" | "initial". Free for Infinite Aura, then the one free daily
    # tile, then coins. Idempotent — re-tapping an open tile never charges twice.
    revealClue(id: ID!, clue: String!): ClueResult!
    revealFlame(id: ID!): RevealResult!
    revealFlameName(id: ID!): RevealNameResult!
    boostRandom: CoinResult!
    boostCrush(targetId: ID!): CoinResult!
    shopBoost(cost: Int!): CoinResult!
    legacyGodMode: Boolean!
    validateIap(signedTransaction: String!): IapResult!
  }
`;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

const resolvers = {
  /* Field resolver rather than a join in getUserById: most queries never ask for the school, and
     this way they don't pay for it. Only `me { school { name } }`-style selections trigger it. */
  User: {
    school: (parent: { schoolId: string | null }, _: unknown, ctx: GraphQLContext) =>
      parent.schoolId ? ctx.db.getSchool(parent.schoolId) : null,
    // Derived, so the raw tokens never leave the server.
    pushEnabled: (parent: { pushTokens?: unknown }) =>
      Array.isArray(parent.pushTokens) && parent.pushTokens.length > 0,
    // Always an object, so clients don't need a null check per platform.
    socials: (parent: { socials?: unknown }) => (parent.socials && typeof parent.socials === 'object' ? parent.socials : {}),
    /* Always an array — a user who has never followed anyone otherwise returns null, and every caller
       would need its own fallback.

       Scoped to yourself (admins excepted, since the admin screens list raw rows). The People screen
       prints "Nobody can see who you follow"; before this, any signed-in student could have selected
       `schoolmates { following }` and read the whole school's follow graph. Empty rather than an error
       so a client that over-selects degrades quietly instead of failing the whole query. */
    following: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? followingOf(parent) : [],
    /* The one viewer-relative bit the follow graph does expose: does this person follow *me*. Safe in a
       way the list isn't — you already learn it the moment you see their "Follow back" button, and it's
       your own edge being reported, not somebody else's. */
    followsMe: (parent: User, _: unknown, ctx: GraphQLContext) =>
      !!ctx.me && parent.id !== ctx.me.id && followingOf(parent).includes(ctx.me.id),
    /* Self-only, and a real query — so it costs nothing unless the Me tab actually selects it, and
       there is no path to anybody else's number (publicProfile doesn't expose it at all). */
    followerCount: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? ctx.db.countFollowers(parent.id) : 0,
    roundsTotal: (parent: User) => (typeof parent.roundsTotal === 'number' ? parent.roundsTotal : 0),
    streak: (parent: User) => currentStreak(parent)
  },

  /* Field resolver, not part of servedRound: it's a second database round trip, and this way the Vote
     screen only pays for it because it actually selects it. */
  PollRound: {
    votesToday: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      ctx.db.countVotesByVoterSince(requireMe(ctx).id, `${utcDay()}T00:00:00.000Z`)
  },

  Query: {
    schools: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { success } = await ctx.ratelimit.limit(ctx.ip);
      if (!success) throw new Error('Too many requests');
      return ctx.db.getSchoolsWithUserCounts();
    },
    school: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.getSchool(args.id),
    // No public "look up any student" endpoint exists in server.js — this was open since Phase 1 and shouldn't have been.
    user: (_: unknown, args: { id: string }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.getUserById(args.id); },
    users: (_: unknown, args: { schoolId?: string }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.getAllUsers(args.schoolId); },
    // server.js only exposes poll listing via the admin-gated /api/admin/polls — matching that here.
    polls: (_: unknown, __: unknown, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.getPolls(); },
    pollLibrary: () => POLL_LIB.map(([emoji, text, color]) => ({ emoji, text, color })),
    votes: (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.getVotes(args.limit); },
    reports: (_: unknown, __: unknown, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.getReports(); },
    adminStats: (_: unknown, __: unknown, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.getAdminStats(); },

    me: (_: unknown, __: unknown, ctx: GraphQLContext) => requireMe(ctx),

    /* Reads reports, but is deliberately not admin-gated: the only reports consulted are ones the
       caller filed themselves, and only to decide whether Unblock is still muted. Nothing about
       reports filed *against* the caller crosses this boundary. */
    blockedPeople: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const ids = (me.blocked as string[]) || [];
      if (ids.length === 0) return [];
      const users = await ctx.db.getUsersByIds(ids);
      const at = (me.blockedAt as Record<string, string>) || {};
      const openTargets = new Set(
        (await ctx.db.getReportsByUser(me.id)).filter(r => r.status !== 'resolved').map(r => r.targetId)
      );
      // getUsersByIds drops ids with no row (deleted accounts), so map over what came back rather
      // than over `ids` — otherwise a deleted blocked user would render as an empty row.
      return users.map(user => ({
        user,
        blockedAt: at[user.id] ?? null,
        reportOpen: openTargets.has(user.id)
      }));
    },
    board: async (_: unknown, args: { scope?: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const scope: BoardScope =
        args.scope === 'grade' || args.scope === 'trending' ? args.scope : 'overall';
      return boardFor(ctx.db, me, scope, ctx.tuning);
    },
    mySuperlatives: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return superlativesFor(ctx.db, me.id, ctx.tuning);
    },

    /* Same school only, and never for someone either of you has blocked — a public profile is the one
       place another student's name, handle and socials appear together, so the scope has to be tight.
       Nothing here says anything about who picked them; that stays between them and their inbox. */
    publicProfile: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const other = await ctx.db.getUserById(args.userId);
      if (!other || !me.schoolId || other.schoolId !== me.schoolId) return null;
      if (other.id === me.id) return null; // your own profile is the `me` query
      const blocked = !notBlocked(me, other);

      const superlatives = blocked ? [] : await superlativesFor(ctx.db, other.id, ctx.tuning);
      const flames = superlatives.reduce((sum, s) => sum + s.count, 0);

      /* Rank comes from the same board the Ranks tab shows, so the two can't disagree — including
         staying null while the school is still locked. */
      const board = await boardFor(ctx.db, me, 'overall', ctx.tuning);
      const rank = board.entries.find(e => e.userId === other.id)?.rank ?? null;

      // Same school by definition (checked above), so this is the viewer's school too.
      const school = await ctx.db.getSchool(me.schoolId as string);
      const name = [other.firstName, other.lastName].filter(Boolean).join(' ').trim();
      return {
        id: other.id,
        // Blocked: same rule as the board — the numbers stay true, the identity doesn't.
        name: blocked ? 'Blocked' : name || 'Someone',
        username: blocked ? null : (other.username as string | null) || null,
        grade: blocked ? null : (other.grade as string | null) || null,
        gender: blocked ? null : (other.gender as string | null) || null,
        schoolName: school?.name ?? null,
        flames,
        rank,
        superlatives,
        socials: blocked ? {} : (other.socials as Record<string, string>) || {},
        blocked
      };
    },

    usernameAvailable: async (_: unknown, args: { username: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const handle = str(args.username, 30).replace(/[^a-zA-Z0-9_.]/g, '');
      if (handle.length < 2) return false;
      const owner = await ctx.db.findByUsername(handle);
      // Your own handle is "available" to you, so re-saving an unchanged form doesn't fail.
      return !owner || owner.id === me.id;
    },

    schoolmates: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      if (!me.schoolId) return [];
      // No notBlocked() filter on purpose — see the schema comment. Scoped to my own school, so it
      // exposes nothing that "suggestions" doesn't already.
      return ctx.db.getUsersBySchool(me.schoolId, me.id);
    },
    suggestions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      if (!me.schoolId) return { contacts: [], fof: [] };
      const friendIds = (me.friendIds as string[]) || [];
      const mates = (await ctx.db.getUsersBySchool(me.schoolId, me.id)).filter(u => !friendIds.includes(u.id) && notBlocked(me, u));
      const half = Math.ceil(mates.length / 2);
      return { contacts: mates.slice(0, half), fof: mates.slice(half) };
    },
    // "Friends" is now "people you follow" — same query, one-directional data underneath.
    friends: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.getUsersByIds(followingOf(me));
    },
    blocked: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.getUsersByIds((me.blocked as string[]) || []);
    },
    notifications: (_: unknown, __: unknown, ctx: GraphQLContext) => (requireMe(ctx).notifications as unknown[]) || [],
    pollRound: (_: unknown, __: unknown, ctx: GraphQLContext) => servedRound(ctx.db, ctx.rounds, requireMe(ctx), ctx.tuning),

    /* One object rather than a dozen loose fields: the Shop screen needs all of it at once, and keeping
       it together makes it obvious that these are the *same* numbers the resolvers charge — spread
       across the schema they'd invite a second, drifting copy. */
    shop: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const t = ctx.tuning;
      const expires = typeof me.godModeExpires === 'string' ? me.godModeExpires : null;
      return {
        coins: (me.coins as number) ?? 0,
        clueGradeCost: t.clueGradeCost,
        clueInitialCost: t.clueInitialCost,
        freeClueHourUtc: t.freeClueHourUtc,
        /* The same condition revealClue checks — one source of truth for "is the free tile live", so the
           screen can't offer one the mutation would then charge for. */
        freeClueReady:
          t.freeClueHourUtc < 24 &&
          (typeof me.freeClueOn === 'string' ? me.freeClueOn : null) !== clueDay(t.freeClueHourUtc),
        roundPayout: me.godMode ? t.roundPayoutGodMode : t.roundPayout,
        streakBonus: t.streakBonus,
        inviteBonus: t.inviteBonus,
        coinPackSmall: t.coinPackSmall,
        coinPackMedium: t.coinPackMedium,
        coinPackLarge: t.coinPackLarge,
        boostRandomCost: t.boostRandomCost,
        boostRandomUses: t.boostRandomUses,
        boostCrushCost: t.boostCrushCost,
        boostCrushUses: t.boostCrushUses,
        /* `godMode` is still the stored column — 15A renamed the product, not the database. Renaming it
           would be a migration across live rows for no behavioural gain, so the boundary is here. */
        infiniteAura: !!me.godMode,
        infiniteAuraExpires: expires
      };
    },
    flames: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const { flames: list, admirerCount } = await flamesFor(ctx.db, me, ctx.tuning);
      return {
        flames: list,
        coins: me.coins as number,
        godMode: !!me.godMode,
        bonusRevealsLeft: 0, // legacy: names are unlimited for members now, so there is nothing to count down
        admirerCount
      };
    }
  },
  Mutation: {
    createSchool: (_: unknown, args: { name: string; city?: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return ctx.db.createSchool({ id: 'sch_' + crypto.randomUUID().slice(0, 12), name: args.name, city: args.city });
    },
    updateSchool: (_: unknown, args: { id: string; name?: string; city?: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return ctx.db.updateSchool(args.id, { name: args.name, city: args.city });
    },
    deleteSchool: (_: unknown, args: { id: string }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.deleteSchool(args.id); },

    createPoll: (
      _: unknown,
      args: { emoji: string; text: string; color: string; schoolId?: string; enabled?: boolean },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.db.createPoll({ id: 'pol_' + crypto.randomUUID().slice(0, 12), ...args });
    },
    updatePoll: (
      _: unknown,
      args: { id: string; emoji?: string; text?: string; color?: string; enabled?: boolean; schoolId?: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const fields: Record<string, unknown> = { emoji: args.emoji, text: args.text, color: args.color, enabled: args.enabled };
      if ('schoolId' in args) fields.schoolId = args.schoolId;
      return ctx.db.updatePoll(args.id, fields);
    },
    deletePoll: (_: unknown, args: { id: string }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.deletePoll(args.id); },
    /* The same seed the migrate script runs, reachable from the admin Polls page — so recovering a
       school that can't build a round doesn't need shell access to the production database.

       Goes through db.createPoll rather than the migration's raw SQL because this path has a Db handle
       and no `sql`; the guard against double-seeding is the same either way. */
    seedDefaultPolls: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const existing = await ctx.db.getPolls();
      if (existing.some(p => p.schoolId === null)) return 0;
      for (const [emoji, text, color] of POLL_LIB) {
        await ctx.db.createPoll({
          id: 'poll_' + crypto.randomUUID().slice(0, 12),
          emoji,
          text,
          color,
          schoolId: null,
          enabled: true
        });
      }
      return POLL_LIB.length;
    },
    deleteVote: (_: unknown, args: { id: string }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.deleteVote(args.id); },
    resolveReport: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const report = await ctx.db.resolveReport(args.id);
      /* Closing the loop the report-sent sheet promises. Deliberately says nothing about the
         outcome or the reported person — the sheet's whole point is that neither side learns what
         happened to the other. Failure to notify must not fail the resolve, since the report is
         already closed by then. */
      if (report?.byUserId) {
        const reporter = await ctx.db.getUserById(report.byUserId as string);
        if (reporter) await notify(ctx.db, reporter, 'An admin reviewed your report. Thanks for flagging it.', '🛡️');
      }
      return report;
    },

    // Thin wrappers over db.updateUser/deleteUser — those already do everything needed (generic
    // JSONB merge covers coins/godMode/grade/names; deleteUser already cascades votes via FKs).
    // Prefixed "admin" (unlike updateSchool/deletePoll etc.) specifically so this doesn't read like
    // a self-service pair with updateMe/deleteMe — it edits/deletes *any* user, admin-gated.
    adminUpdateUser: (
      _: unknown,
      args: {
        id: string; schoolId?: string; grade?: string; coins?: number; godMode?: boolean;
        firstName?: string; lastName?: string; username?: string;
      },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const fields: Record<string, unknown> = {};
      if (args.schoolId !== undefined) fields.schoolId = args.schoolId || null;
      if (args.grade !== undefined) fields.grade = args.grade;
      if (args.coins !== undefined) fields.coins = args.coins;
      if (args.godMode !== undefined) fields.godMode = args.godMode;
      if (args.firstName !== undefined) fields.firstName = args.firstName;
      if (args.lastName !== undefined) fields.lastName = args.lastName;
      if (args.username !== undefined) fields.username = args.username;
      return ctx.db.updateUser(args.id, fields);
    },
    adminDeleteUser: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      await ctx.db.deleteUser(args.id);
      return true;
    },

    updateMe: async (
      _: unknown,
      args: {
        firstName?: string; lastName?: string; username?: string; gender?: string; grade?: string;
        age?: number; schoolId?: string; photo?: string; onboarded?: boolean; hideTopFlames?: boolean;
        notifyFlames?: boolean; notifyRound?: boolean; notifyFriendJoined?: boolean; quietHours?: boolean;
        socials?: Record<string, string | null>;
      },
      ctx: GraphQLContext
    ) => {
      const me = requireMe(ctx);
      const fields: Record<string, unknown> = {};
      if (args.firstName !== undefined) fields.firstName = str(args.firstName, 40).trim();
      if (args.lastName !== undefined) fields.lastName = str(args.lastName, 40).trim();
      if (args.username !== undefined) {
        const handle = str(args.username, 30).replace(/[^a-zA-Z0-9_.]/g, '');
        /* Enforced here because there is no DB constraint: `username` lives inside the JSONB blob, so
           two people could otherwise claim the same handle and 13A's edit sheet would report "free"
           for a handle that isn't. */
        if (handle) {
          const owner = await ctx.db.findByUsername(handle);
          if (owner && owner.id !== me.id) throw new Error('That handle is taken');
        }
        fields.username = handle;
      }
      /* Throws rather than dropping silently. The old silent drop is exactly why mobile's "Rather
         not say" looked like it saved for weeks — the mutation returned 200 with the field quietly
         missing. A client sending an unknown gender is a bug, so it should say so. */
      if (args.gender !== undefined) {
        if (!GENDERS.includes(args.gender)) throw new Error(`Unknown gender: ${args.gender}`);
        fields.gender = args.gender;
      }
      if (args.grade !== undefined) fields.grade = str(args.grade, 30);
      if (args.age !== undefined) {
        if (!(args.age >= MIN_AGE && args.age <= 99)) throw new Error(`You must be at least ${MIN_AGE} to use Aura.`);
        fields.age = args.age;
      }
      if (args.schoolId !== undefined) fields.schoolId = args.schoolId || null;
      if (args.photo !== undefined) fields.photo = args.photo == null ? null : str(args.photo, 500000);
      if (args.onboarded !== undefined) {
        const willBeOnboarded = !!args.onboarded;
        // Same chokepoint as server.js: onboarded is set in a separate call from age in the real
        // flow, so this is where "valid age already on file (or set right now)" is actually enforced.
        if (willBeOnboarded) {
          const effectiveAge = 'age' in fields ? (fields.age as number) : (me.age as number | null);
          if (!(effectiveAge != null && effectiveAge >= MIN_AGE)) throw new Error(`Set your age (${MIN_AGE}+) before finishing onboarding.`);
        }
        fields.onboarded = willBeOnboarded;
      }
      if (args.hideTopFlames !== undefined) fields.hideTopFlames = !!args.hideTopFlames;
      // 7A prefs. Only written when the client actually sends one, so "never set" stays
      // distinguishable from "set to false" — push.ts's defaults depend on that difference.
      if (args.notifyFlames !== undefined) fields.notifyFlames = !!args.notifyFlames;
      if (args.notifyRound !== undefined) fields.notifyRound = !!args.notifyRound;
      if (args.notifyFriendJoined !== undefined) fields.notifyFriendJoined = !!args.notifyFriendJoined;
      if (args.quietHours !== undefined) fields.quietHours = !!args.quietHours;
      /* Merged, not replaced: the client sends only the platform being edited, so a whole-object
         write would wipe the others. An explicit null deletes that one. Sanitised here as well as
         client-side, since the handle ends up in a URL. */
      if (args.socials !== undefined) {
        const merged: Record<string, string> = { ...((me.socials as Record<string, string>) || {}) };
        for (const key of SOCIAL_KEYS) {
          const value = args.socials[key];
          if (value === undefined) continue;
          const handle = value === null ? '' : str(value, 40).replace(/[^A-Za-z0-9._-]/g, '');
          if (handle) merged[key] = handle;
          else delete merged[key];
        }
        fields.socials = merged;
      }
      try {
        return await ctx.db.updateUser(me.id, fields);
      } catch (e: any) {
        if (e?.code === '23503') throw new Error('Unknown school');
        throw e;
      }
    },

    // votes/boosts cascade automatically via real FKs (ON DELETE CASCADE) — no manual cleanup
    // needed here, unlike server.js's DELETE handler. Sessions don't exist in this stack; Clerk owns them.
    deleteMe: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.deleteUser(me.id);
      return true;
    },

    registerPushToken: async (
      _: unknown,
      args: { token: string; tzOffsetMinutes?: number },
      ctx: GraphQLContext
    ) => {
      const me = requireMe(ctx);
      const token = str(args.token, 200).trim();
      // Expo is the only router for these, so anything else is a client bug worth surfacing.
      if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) throw new Error('Not an Expo push token');
      const existing = ((me.pushTokens as string[]) || []).filter(t => typeof t === 'string');
      /* Idempotent by design (called on every launch). Capped at 5 so a user cycling simulators or
         reinstalling can't grow the array forever; oldest goes first. Dead tokens are also pruned on
         send, see push.ts. */
      const pushTokens = [...existing.filter(t => t !== token), token].slice(-5);
      const fields: Record<string, unknown> = { pushTokens };
      // Refreshed on every call precisely so a DST change or a flight can't leave quiet hours wrong.
      if (typeof args.tzOffsetMinutes === 'number' && Math.abs(args.tzOffsetMinutes) <= 14 * 60) {
        fields.tzOffsetMinutes = args.tzOffsetMinutes;
      }
      await ctx.db.updateUser(me.id, fields);
      return true;
    },

    block: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const target = await ctx.db.getUserById(args.userId);
      const meBlocked = (me.blocked as string[]) || [];
      if (target && args.userId !== me.id && !meBlocked.includes(args.userId)) {
        const blocked = [...meBlocked, args.userId];
        const friendIds = ((me.friendIds as string[]) || []).filter(id => id !== args.userId);
        /* When each block happened, for 8A's blocked list ("Blocked 3 weeks ago"). Kept in a
           parallel map rather than turning `blocked` into a list of objects: `blocked` is read as
           `string[]` by notBlocked() and every vote/round eligibility check, and reshaping it would
           mean touching all of them plus backfilling live JSONB. Anyone blocked before this shipped
           simply has no entry, which the UI renders as an undated row. */
        const blockedAt = { ...((me.blockedAt as Record<string, string>) || {}), [args.userId]: new Date().toISOString() };
        /* Blocking severs the follow edge in *both* directions. Leaving their follow of you in place
           would keep weighting you into each other's polls, which is the one thing a block must stop. */
        const following = followingOf(me).filter(id => id !== args.userId);
        await ctx.db.updateUser(me.id, { blocked, friendIds, following, blockedAt });
        const targetFollowing = followingOf(target).filter(id => id !== me.id);
        await ctx.db.updateUser(target.id, { following: targetFollowing });
        return blocked;
      }
      return meBlocked;
    },
    unblock: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const blocked = ((me.blocked as string[]) || []).filter(id => id !== args.userId);
      // Drop the timestamp with the block, so a re-block reads as new rather than resurrecting the
      // old date.
      const blockedAt = { ...((me.blockedAt as Record<string, string>) || {}) };
      delete blockedAt[args.userId];
      await ctx.db.updateUser(me.id, { blocked, blockedAt });
      return blocked;
    },
    /* Following is one-directional and needs no approval, so this writes exactly one row — unlike the
       old addFriend, which wrote both users' lists to keep a mutual edge in sync. Same school only:
       the whole app is school-scoped, and a cross-school follow would weight someone into polls they
       can't appear in. */
    follow: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const other = await ctx.db.getUserById(args.userId);
      const current = followingOf(me);
      if (!other || other.id === me.id) throw new Error('Pick a valid person');
      if (!me.schoolId || other.schoolId !== me.schoolId) throw new Error('You can only follow people at your school');
      if (!notBlocked(me, other)) throw new Error('You can\'t follow someone you blocked');
      if (current.includes(other.id)) return current;
      // Appended in SQL, not read-modify-write: see addFollowing. Two follows a few hundred ms apart
      // used to lose one of each other.
      return ctx.db.addFollowing(me.id, [other.id]);
    },
    unfollow: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.removeFollowing(me.id, args.userId);
    },
    /* Follow a whole grade at once — 14A's "Follow all of 11th grade · 86 people".

       A server mutation rather than a loop of `follow` calls on the client, for two reasons: 86 round
       trips over a school-wifi connection is not a tap, and each one would rewrite the same JSONB list
       with a stale copy of it, so concurrent writes would drop follows at random. */
    followGrade: async (_: unknown, args: { grade: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      /* Matched on the grade *number*, not the raw string. Grade is free text and live rows hold both
         "11" (onboarding) and "Grade 11" (admin screens) — an exact match would follow half the class
         and silently skip the rest. Mirrored client-side by profileKit's gradeNumber. */
      const want = gradeKey(str(args.grade, 30));
      const current = followingOf(me);
      if (!me.schoolId || want === null) return current;
      const mates = await ctx.db.getUsersBySchool(me.schoolId, me.id);
      const add = mates
        .filter(m => gradeKey(m.grade) === want && notBlocked(me, m) && !current.includes(m.id))
        .map(m => m.id);
      if (add.length === 0) return current;
      return ctx.db.addFollowing(me.id, add);
    },
    /* Kept so apps/web's existing friend screens keep working; they now follow/unfollow underneath.
       Deliberately not deleted-and-migrated in the same change as the mechanic itself. */
    addFriend: (_: unknown, args: { userId: string }, ctx: GraphQLContext) =>
      (resolvers.Mutation as any).follow(_, args, ctx),
    removeFriend: (_: unknown, args: { userId: string }, ctx: GraphQLContext) =>
      (resolvers.Mutation as any).unfollow(_, args, ctx),

    rerollQuestion: async (_: unknown, args: { roundId: string; questionId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const round = await ctx.rounds.get(args.roundId);
      if (!round || round.userId !== me.id) throw new Error('no active round');
      if (round.claimed) throw new Error('that round is finished');
      const index = round.polls.findIndex(p => p.questionId === args.questionId);
      if (index === -1) throw new Error('that question is not in this round');
      // Rerolling a question you already voted on would let you buy a second vote on it.
      if (round.votedQ.includes(args.questionId)) throw new Error('you already answered that one');

      /* New candidates are computed *before* charging, so a school with nobody left to show doesn't
         take the coins and hand back the same four faces. */
      const exclude = round.polls[index].choices.map(c => c.id);
      const choices = await rerollChoices(ctx.db, me, exclude, ctx.tuning);
      if (choices.length === 0) throw new Error('Nobody new to show at your school yet');

      const coins = await ctx.db.adjustCoins(me.id, -ctx.tuning.rerollCost);
      if (coins === null) throw new Error(`You need ${ctx.tuning.rerollCost} coins to reroll`);

      round.polls[index] = { ...round.polls[index], choices };
      await ctx.rounds.save(args.roundId, round);
      return { choices, coins };
    },

    reportUser: async (_: unknown, args: { userId?: string; reason?: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.createReport({
        id: 'rep_' + crypto.randomUUID().slice(0, 12),
        byUserId: me.id, targetId: args.userId || null, reason: (args.reason || '').slice(0, 300)
      });
      return true;
    },
    markNotificationsRead: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const notifications = ((me.notifications as any[]) || []).map(n => ({ ...n, read: true }));
      await ctx.db.updateUser(me.id, { notifications });
      return true;
    },

    vote: async (_: unknown, args: { questionId: string; targetId: string; roundId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const polls = await ctx.db.getPolls();
      const q = polls.find(p => p.id === args.questionId && p.enabled);
      const target = await ctx.db.getUserById(args.targetId);
      if (!q || !target) throw new Error('bad vote');
      if (target.id === me.id) throw new Error('cannot vote for yourself');
      // integrity: target must be an eligible schoolmate (or someone boosted into your polls) and not blocked
      const eligible = target.schoolId === me.schoolId || (await ctx.db.hasActiveBoostFor(target.id, me.id));
      if (!eligible || !notBlocked(me, target)) throw new Error('not eligible');
      const round = await ctx.rounds.get(args.roundId);
      if (round) {
        if (round.userId !== me.id) throw new Error('not your round');
        if (round.votedQ.includes(args.questionId)) return { ok: true, dup: true };
        /* Against the round's own length, not a hardcoded 12: questionsPerRound is a tunable dial, and
           raising it used to make every vote past the twelfth throw "round full". */
        if (round.votedQ.length >= round.polls.length) throw new Error('round full');
        round.votedQ.push(args.questionId);
        round.answered = round.votedQ.length;
        await ctx.rounds.save(args.roundId, round);
      }
      await ctx.db.createVote({
        id: 'vote_' + crypto.randomUUID().slice(0, 12),
        voterId: me.id, targetId: args.targetId, questionId: args.questionId, emoji: q.emoji, text: q.text, color: q.color
      });
      /* "Know the second someone picks you" — the flame push, 7A's whole argument for notifications.
         Inside waitUntil so it never delays or fails the vote (see index.ts), and anonymous exactly
         when the Inbox would be: a God Mode voter stays hidden here too. */
      ctx.waitUntil(sendPush(ctx.db, target, 'flame', flameBody(me, q.text as string, !!me.godMode), { targetId: target.id }));
      return { ok: true, dup: false };
    },
    completeRound: async (_: unknown, args: { roundId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const round = await ctx.rounds.get(args.roundId);
      if (!round || round.userId !== me.id) throw new Error('no active round');
      if (round.claimed) return { coins: me.coins as number, earned: 0, already: true };
      if ((round.answered || 0) < 1) throw new Error('answer at least one poll first');
      round.claimed = true;
      await ctx.rounds.save(args.roundId, round);
      const earned = me.godMode ? ctx.tuning.roundPayoutGodMode : ctx.tuning.roundPayout;
      const newCoins = await ctx.db.adjustCoins(me.id, earned);
      /* Completing a round is what "played today" means, so the streak advances here rather than on
         opening the app — otherwise it would count visits, which is not what the flame says. Returns
         null for a second round on the same day, in which case there's nothing to write. */
      const nextStreak = advanceStreak(me);
      /* Lifetime completed rounds, written in the same update as the streak so a completion costs one
         write either way. Only used to retire 14A's "✋ HOLD" chip after three rounds — a client-side
         counter would reset on reinstall and re-teach the gesture to someone who already knows it. */
      const roundsTotal = (typeof me.roundsTotal === 'number' ? me.roundsTotal : 0) + 1;
      await ctx.db.updateUser(me.id, { ...(nextStreak ?? {}), roundsTotal });
      return { coins: newCoins, earned, already: false };
    },

    markFlamesRead: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.markAllVotesReadForTarget(me.id);
      return true;
    },
    /* 16A's clue ladder in one mutation: `clue` is "grade" or "initial".

       One entry point rather than two, because the interesting logic is shared and must not diverge —
       who pays, whether the free daily tile applies, and the order the three payment routes are tried:

         1. Infinite Aura  — free, unlimited, no daily wait
         2. the free tile  — one a day, whichever clue you spend it on
         3. coins          — the priced fallback

       The free tile is checked *before* coins on purpose: charging someone who had a free one banked
       would be taking money we said was free, and they have no way to see which route was used. */
    revealClue: async (_: unknown, args: { id: string; clue: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const which = args.clue === 'grade' ? 'grade' : args.clue === 'initial' ? 'initial' : null;
      if (!which) throw new Error('Unknown clue');

      const v = await ctx.db.getVoteForTarget(args.id, me.id);
      if (!v) throw new Error('no flame');
      const voter = await ctx.db.getUserById(v.voterId);
      if (voter && voter.godMode) throw new Error('This admirer is anonymous 🔒');

      const already = which === 'grade' ? v.gradeRevealed : v.revealed;
      const mark = () =>
        which === 'grade' ? ctx.db.markVoteGradeRevealed(v.id) : ctx.db.markVoteRevealed(v.id);
      // Idempotent: re-tapping an open tile must never charge a second time.
      if (already) return { ok: true, coins: me.coins as number, usedFreeClue: false };

      if (me.godMode) {
        await mark();
        return { ok: true, coins: me.coins as number, usedFreeClue: false };
      }

      const day = clueDay(ctx.tuning.freeClueHourUtc);
      const freeClueOn = typeof me.freeClueOn === 'string' ? me.freeClueOn : null;
      if (ctx.tuning.freeClueHourUtc < 24 && freeClueOn !== day) {
        await ctx.db.updateUser(me.id, { freeClueOn: day });
        await mark();
        return { ok: true, coins: me.coins as number, usedFreeClue: true };
      }

      const cost = which === 'grade' ? ctx.tuning.clueGradeCost : ctx.tuning.clueInitialCost;
      const newCoins = await ctx.db.adjustCoins(me.id, -cost);
      if (newCoins === null) throw new Error(`You need ${cost} ${cost === 1 ? 'coin' : 'coins'} for that clue`);
      await mark();
      return { ok: true, coins: newCoins, usedFreeClue: false };
    },

    /** Kept as the initial-clue alias so apps/web keeps working; revealClue is the real entry point. */
    revealFlame: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const v = await ctx.db.getVoteForTarget(args.id, me.id);
      if (!v) throw new Error('no flame');
      const voter = await ctx.db.getUserById(v.voterId);
      if (voter && voter.godMode) throw new Error('This admirer is anonymous 🔒');
      if (me.godMode) {
        await ctx.db.markVoteRevealed(v.id);
        return { ok: true, coins: me.coins as number };
      }
      const newCoins = await ctx.db.adjustCoins(me.id, -ctx.tuning.clueInitialCost);
      if (newCoins === null) {
        const n = ctx.tuning.clueInitialCost;
        throw new Error(`You need ${n} ${n === 1 ? 'coin' : 'coins'} for that clue`);
      }
      await ctx.db.markVoteRevealed(v.id);
      return { ok: true, coins: newCoins };
    },
    revealFlameName: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const v = await ctx.db.getVoteForTarget(args.id, me.id);
      if (!v) throw new Error('no flame');
      if (!me.godMode) throw new Error('Infinite Aura required');
      const voter = await ctx.db.getUserById(v.voterId);
      if (!voter) throw new Error('voter gone');
      if (voter.godMode) throw new Error('This admirer is anonymous 🔒');
      /* 15A: **unlimited**, and on every flame. Two rules died here — a cap of two names, and a
         requirement that the person had picked you twice. Infinite Aura's promise on the paywall is
         "first names on every flame you get" and "works on the flames already sitting there", so any
         surviving limit would make that copy false. `bonusRevealsUsed` is no longer read or written;
         old rows keep the field harmlessly. */
      const revealedVoters = (me.revealedVoters as string[]) || [];
      if (!revealedVoters.includes(v.voterId)) {
        await ctx.db.updateUser(me.id, { revealedVoters: [...revealedVoters, v.voterId] });
      }
      return { name: `${voter.firstName} ${voter.lastName}`, bonusRevealsLeft: 0 };
    },

    boostRandom: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const { boostRandomCost, boostRandomUses } = ctx.tuning;
      const newCoins = await ctx.db.adjustCoins(me.id, -boostRandomCost);
      if (newCoins === null) throw new Error(`You need ${boostRandomCost} coins`);
      await ctx.db.createBoost({ id: 'bst_' + crypto.randomUUID().slice(0, 12), byUserId: me.id, targetId: null, remaining: boostRandomUses });
      return { coins: newCoins, message: `You'll appear in ${boostRandomUses} random polls 🔥` };
    },
    boostCrush: async (_: unknown, args: { targetId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const { boostCrushCost, boostCrushUses } = ctx.tuning;
      const t = await ctx.db.getUserById(args.targetId);
      if (!t || t.id === me.id) throw new Error('Pick a valid crush');
      const newCoins = await ctx.db.adjustCoins(me.id, -boostCrushCost);
      if (newCoins === null) throw new Error(`You need ${boostCrushCost} coins`);
      await ctx.db.createBoost({ id: 'bst_' + crypto.randomUUID().slice(0, 12), byUserId: me.id, targetId: t.id, remaining: boostCrushUses });
      return { coins: newCoins, message: `You'll show up in ${t.firstName}'s polls 💘` };
    },
    shopBoost: async (_: unknown, args: { cost: number }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const newCoins = await ctx.db.adjustCoins(me.id, -(args.cost | 0));
      if (newCoins === null) throw new Error('not enough coins');
      return { coins: newCoins, message: null };
    },
    // Legacy/dev instant unlock — kept for the web demo. Real iOS uses validateIap below.
    legacyGodMode: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.updateUser(me.id, { godMode: true, godModeExpires: null });
      return true;
    },

    // Real Apple In-App Purchase: verify the StoreKit2 signed transaction, then grant God Mode.
    // Mirrors server.js's /api/iap/validate exactly — same replay protection (each StoreKit
    // transactionId is single-use; renewals get new ids) and expiry handling.
    validateIap: async (_: unknown, args: { signedTransaction: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      let tx;
      try {
        tx = verifySignedTransaction(args.signedTransaction, ctx.env.APPLE_ROOT_CA);
      } catch (e: any) {
        throw new Error('Invalid receipt: ' + e.message);
      }
      const godmodeProducts = (ctx.env.GODMODE_PRODUCT_IDS || DEFAULT_GODMODE_PRODUCTS).split(',');
      if (!godmodeProducts.includes(tx.productId)) throw new Error('Unknown product ' + tx.productId);

      const iapTransactions = (me.iapTransactions as string[]) || [];
      const txId = String(tx.transactionId);
      const already = iapTransactions.includes(txId);
      const newIapTransactions = already ? iapTransactions : [...iapTransactions, txId];

      const expMs = tx.expiresDate ? Number(tx.expiresDate) : null;
      if (expMs && expMs <= Date.now()) {
        await ctx.db.updateUser(me.id, { iapTransactions: newIapTransactions });
        return { godMode: false, expired: true, expires: new Date(expMs).toISOString() };
      }
      const godModeExpires = expMs ? new Date(expMs).toISOString() : null;
      await ctx.db.updateUser(me.id, { iapTransactions: newIapTransactions, godModeExpires, godMode: true });
      return {
        godMode: true,
        expires: godModeExpires,
        environment: tx.environment || null,
        renewed: !already && newIapTransactions.length > 1
      };
    }
  }
};

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });
