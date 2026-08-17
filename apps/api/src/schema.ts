import { createSchema } from 'graphql-yoga';
import type { Db, User } from './db';
import type { RateLimiter } from './ratelimit';
import type { RoundStore } from './rounds';
import { buildRound, notBlocked } from './pollRound';
import { flamesFor } from './flames';
import { verifySignedTransaction } from './iap';

export interface Env {
  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  CLERK_SECRET_KEY: string;
  ALLOWED_ORIGIN?: string; // apps/web's origin, for CORS — see index.ts. Unset in dev, falls back to localhost.
  APPLE_ROOT_CA?: string; // Apple's root cert PEM — see iap.ts. Unset in dev/sandbox (relaxed trust anchor).
  GODMODE_PRODUCT_IDS?: string; // comma-separated StoreKit product IDs, mirrors server.js's GODMODE_PRODUCTS
}

const DEFAULT_GODMODE_PRODUCTS = 'aura.godmode.weekly,aura.godmode.lifetime';

const MIN_AGE = 13; // COPPA-safe floor — mirrors server.js's MIN_AGE exactly, same reasoning

// The full context Yoga hands resolvers — the initial per-request fields (req/env/ip, set in
// index.ts's context factory) plus the derived ones (db/ratelimit/rounds/me). Yoga merges the
// initial context with whatever the `context` factory returns, so this has to describe that
// whole merge, not just the new fields, or its generic and createYoga's fight each other.
export type GraphQLContext = {
  req: Request; env: Env; ip: string;
  db: Db; ratelimit: RateLimiter; rounds: RoundStore;
  me: User | null; // null when unauthenticated — public queries (schools, school, pollLibrary) still work without it
  isAdmin: boolean; // derived from the Clerk role claim, independent of `me` — admins don't get/need a student profile row
};

function requireMe(ctx: GraphQLContext): User {
  if (!ctx.me) throw new Error('Not logged in');
  return ctx.me;
}
function requireAdmin(ctx: GraphQLContext): void {
  if (!ctx.isAdmin) throw new Error('Admin only');
}

// Mirrors POLL_LIB in server.js — static template list for the admin "add from library" UI, not DB-backed.
const POLL_LIB: [string, string, string][] = [
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
    friendIds: [ID!]
    blocked: [ID!]
    hideTopFlames: Boolean
    photo: String
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
    godMode: Boolean!
    unread: Boolean!
    anonymous: Boolean!
    initial: String
    name: String
    repeatAdmirer: Boolean!
    pickCount: Int!
    ts: String!
  }
  type FlamesResult {
    flames: [Flame!]!
    coins: Int!
    godMode: Boolean!
    bonusRevealsLeft: Int!
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
    suggestions: Suggestions!
    friends: [User!]!
    blocked: [User!]!
    notifications: [Notification!]!
    pollRound: PollRound!
    flames: FlamesResult!
  }
  type Mutation {
    createSchool(name: String!, city: String): School!
    updateSchool(id: ID!, name: String, city: String): School
    deleteSchool(id: ID!): Boolean!
    createPoll(emoji: String!, text: String!, color: String!, schoolId: ID, enabled: Boolean): Poll!
    updatePoll(id: ID!, emoji: String, text: String, color: String, enabled: Boolean, schoolId: ID): Poll
    deletePoll(id: ID!): Boolean!
    deleteVote(id: ID!): Boolean!
    resolveReport(id: ID!): Report
    adminUpdateUser(
      id: ID!, schoolId: ID, grade: String, coins: Int, godMode: Boolean,
      firstName: String, lastName: String, username: String
    ): User
    adminDeleteUser(id: ID!): Boolean!

    updateMe(
      firstName: String, lastName: String, username: String, gender: String, grade: String,
      age: Int, schoolId: ID, photo: String, onboarded: Boolean, hideTopFlames: Boolean
    ): User!
    deleteMe: Boolean!
    block(userId: ID!): [ID!]!
    unblock(userId: ID!): [ID!]!
    addFriend(userId: ID!): [ID!]!
    removeFriend(userId: ID!): [ID!]!
    reportUser(userId: ID, reason: String): Boolean!
    markNotificationsRead: Boolean!
    vote(questionId: ID!, targetId: ID!, roundId: ID!): VoteResult!
    completeRound(roundId: ID!): RoundCompleteResult!
    markFlamesRead: Boolean!
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
      parent.schoolId ? ctx.db.getSchool(parent.schoolId) : null
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

    suggestions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      if (!me.schoolId) return { contacts: [], fof: [] };
      const friendIds = (me.friendIds as string[]) || [];
      const mates = (await ctx.db.getUsersBySchool(me.schoolId, me.id)).filter(u => !friendIds.includes(u.id) && notBlocked(me, u));
      const half = Math.ceil(mates.length / 2);
      return { contacts: mates.slice(0, half), fof: mates.slice(half) };
    },
    friends: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.getUsersByIds((me.friendIds as string[]) || []);
    },
    blocked: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.getUsersByIds((me.blocked as string[]) || []);
    },
    notifications: (_: unknown, __: unknown, ctx: GraphQLContext) => (requireMe(ctx).notifications as unknown[]) || [],
    pollRound: (_: unknown, __: unknown, ctx: GraphQLContext) => buildRound(ctx.db, ctx.rounds, requireMe(ctx)),
    flames: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const list = await flamesFor(ctx.db, me);
      const bonusRevealsUsed = (me.bonusRevealsUsed as number) || 0;
      return { flames: list, coins: me.coins as number, godMode: !!me.godMode, bonusRevealsLeft: me.godMode ? 2 - bonusRevealsUsed : 0 };
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
    deleteVote: (_: unknown, args: { id: string }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.deleteVote(args.id); },
    resolveReport: (_: unknown, args: { id: string }, ctx: GraphQLContext) => { requireAdmin(ctx); return ctx.db.resolveReport(args.id); },

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
      },
      ctx: GraphQLContext
    ) => {
      const me = requireMe(ctx);
      const fields: Record<string, unknown> = {};
      if (args.firstName !== undefined) fields.firstName = str(args.firstName, 40).trim();
      if (args.lastName !== undefined) fields.lastName = str(args.lastName, 40).trim();
      if (args.username !== undefined) fields.username = str(args.username, 30).replace(/[^a-zA-Z0-9_.]/g, '');
      if (args.gender !== undefined && ['boy', 'girl', 'nonbinary'].includes(args.gender)) fields.gender = args.gender;
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

    block: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const target = await ctx.db.getUserById(args.userId);
      const meBlocked = (me.blocked as string[]) || [];
      if (target && args.userId !== me.id && !meBlocked.includes(args.userId)) {
        const blocked = [...meBlocked, args.userId];
        const friendIds = ((me.friendIds as string[]) || []).filter(id => id !== args.userId);
        await ctx.db.updateUser(me.id, { blocked, friendIds });
        const targetFriendIds = (target.friendIds as string[]) || [];
        if (targetFriendIds.includes(me.id)) {
          await ctx.db.updateUser(target.id, { friendIds: targetFriendIds.filter(id => id !== me.id) });
        }
        return blocked;
      }
      return meBlocked;
    },
    unblock: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const blocked = ((me.blocked as string[]) || []).filter(id => id !== args.userId);
      await ctx.db.updateUser(me.id, { blocked });
      return blocked;
    },
    addFriend: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const other = await ctx.db.getUserById(args.userId);
      const meFriends = (me.friendIds as string[]) || [];
      if (other && !meFriends.includes(args.userId)) {
        const friendIds = [...meFriends, args.userId];
        await ctx.db.updateUser(me.id, { friendIds });
        const otherFriends = (other.friendIds as string[]) || [];
        if (!otherFriends.includes(me.id)) await ctx.db.updateUser(other.id, { friendIds: [...otherFriends, me.id] });
        return friendIds;
      }
      return meFriends;
    },
    removeFriend: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const friendIds = ((me.friendIds as string[]) || []).filter(id => id !== args.userId);
      await ctx.db.updateUser(me.id, { friendIds });
      const other = await ctx.db.getUserById(args.userId);
      if (other) await ctx.db.updateUser(other.id, { friendIds: ((other.friendIds as string[]) || []).filter(id => id !== me.id) });
      return friendIds;
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
        if (round.votedQ.length >= 12) throw new Error('round full');
        round.votedQ.push(args.questionId);
        round.answered = round.votedQ.length;
        await ctx.rounds.save(args.roundId, round);
      }
      await ctx.db.createVote({
        id: 'vote_' + crypto.randomUUID().slice(0, 12),
        voterId: me.id, targetId: args.targetId, questionId: args.questionId, emoji: q.emoji, text: q.text, color: q.color
      });
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
      const earned = me.godMode ? 4 : 2;
      const newCoins = await ctx.db.adjustCoins(me.id, earned);
      return { coins: newCoins, earned, already: false };
    },

    markFlamesRead: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.markAllVotesReadForTarget(me.id);
      return true;
    },
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
      const newCoins = await ctx.db.adjustCoins(me.id, -1);
      if (newCoins === null) throw new Error('no coins');
      await ctx.db.markVoteRevealed(v.id);
      return { ok: true, coins: newCoins };
    },
    revealFlameName: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const v = await ctx.db.getVoteForTarget(args.id, me.id);
      if (!v) throw new Error('no flame');
      if (!me.godMode) throw new Error('God Mode required');
      const voter = await ctx.db.getUserById(v.voterId);
      if (!voter) throw new Error('voter gone');
      if (voter.godMode) throw new Error('This admirer is anonymous 🔒');
      const pickCount = await ctx.db.countVotesFromVoterToTarget(v.voterId, me.id);
      if (pickCount < 2) throw new Error('Only works for someone who picked you twice');
      let bonusRevealsUsed = (me.bonusRevealsUsed as number) || 0;
      const revealedVoters = (me.revealedVoters as string[]) || [];
      if (!revealedVoters.includes(v.voterId)) {
        if (bonusRevealsUsed >= 2) throw new Error('No bonus reveals left');
        bonusRevealsUsed += 1;
        await ctx.db.updateUser(me.id, { revealedVoters: [...revealedVoters, v.voterId], bonusRevealsUsed });
      }
      return { name: `${voter.firstName} ${voter.lastName}`, bonusRevealsLeft: 2 - bonusRevealsUsed };
    },

    boostRandom: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const COST = 100;
      const newCoins = await ctx.db.adjustCoins(me.id, -COST);
      if (newCoins === null) throw new Error('You need 100 coins');
      await ctx.db.createBoost({ id: 'bst_' + crypto.randomUUID().slice(0, 12), byUserId: me.id, targetId: null, remaining: 3 });
      return { coins: newCoins, message: "You'll appear in 3 random polls 🔥" };
    },
    boostCrush: async (_: unknown, args: { targetId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const COST = 300;
      const t = await ctx.db.getUserById(args.targetId);
      if (!t || t.id === me.id) throw new Error('Pick a valid crush');
      const newCoins = await ctx.db.adjustCoins(me.id, -COST);
      if (newCoins === null) throw new Error('You need 300 coins');
      await ctx.db.createBoost({ id: 'bst_' + crypto.randomUUID().slice(0, 12), byUserId: me.id, targetId: t.id, remaining: 6 });
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
