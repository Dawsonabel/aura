import { createSchema } from 'graphql-yoga';
import { FRIEND_LISTS, type Db, type FriendList, type User } from './db';
import type { RateLimiter } from './ratelimit';
import type { RoundStore } from './rounds';
import { buildRound, notBlocked, notify, rerollChoices, servedRound } from './pollRound';
import { auraBody, sendPush } from './push';
import { aurasFor, flipState, friendActivityFor, friendMilestonesFor } from './auras';
import { boardFor, type BoardScope } from './board';
import { advanceStreak, currentStreak, utcDay } from './streak';
import { superlativesFor } from './profile';
import { verifySignedTransaction } from './iap';
import { POLL_LIB } from './pollLibrary';
import {
  requireDevTools,
  devResetFlips,
  devSeedVotes,
  devAnonymousVote,
  devSeedFriendActivity,
  devClearCards,
  devGrantSparks,
  devResetRounds,
  devSetStreak
} from './devTools';
import type { Tuning } from './tuning';

export interface Env {
  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  CLERK_SECRET_KEY: string;
  ALLOWED_ORIGIN?: string; // apps/web's origin, for CORS — see index.ts. Unset in dev, falls back to localhost.
  REDIS_KEY_PREFIX?: string; // scopes Upstash keys per environment — see makeRateLimiter/makeRoundStore.
  APPLE_ROOT_CA?: string; // Apple's root cert PEM — see iap.ts. Unset in dev/sandbox (relaxed trust anchor).
  INFINITE_AURA_PRODUCT_IDS?: string; // comma-separated StoreKit product IDs, mirrors server.js's INFINITE_AURA_PRODUCTS
  /* Gameplay/economy dials, all optional — see tuning.ts for the full list and defaults. Indexed
     rather than enumerated so adding a dial there doesn't need a matching edit here. */
  [tuningVar: string]: unknown;
}

/* Deliberately still says "godmode", and must keep saying it.

   These are App Store product identifiers — registered with Apple, attached to real purchases, and
   immutable once created. They are an external contract that happens to contain a word this codebase
   no longer uses anywhere else; renaming them here doesn't rename them in App Store Connect, it just
   stops matching the `productId` on incoming receipts, which fails every restore and every renewal.

   Left out of the Flame->Aura / God Mode->Infinite Aura sweep on purpose. If the naming ever has to
   match, that's a new pair of products in App Store Connect plus both strings kept here for anyone
   holding the old ones — not an edit to this line. */
const DEFAULT_INFINITE_AURA_PRODUCTS = 'aura.godmode.weekly,aura.godmode.lifetime';

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

/** One accessor per friend list, since each is read in a dozen places. */
function idList(user: User, key: FriendList): string[] {
  return ((user[key] as string[]) || []).filter(id => typeof id === 'string');
}
const friendsOf = (user: User) => idList(user, 'friends');

/* Where the caller stands with someone. The only thing the friend graph exposes about another person,
   and it's about the *pair*, never about them: it says whether you two are connected, not who else
   they know or how many. */
function friendStateOf(parent: User, me: User | null): string {
  if (!me) return 'none';
  if (parent.id === me.id) return 'self';
  if (friendsOf(me).includes(parent.id)) return 'friends';
  if (idList(me, 'requestsOut').includes(parent.id)) return 'sent';
  if (idList(me, 'requestsIn').includes(parent.id)) return 'received';
  return 'none';
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
    infiniteAura: Boolean
    # Your friends. Mutual and approved: a request is sent, then accepted or denied, and only then does
    # the edge exist. Replaces the old one-directional "following".
    #
    # **Only ever populated for yourself** (or for an admin), and there is deliberately no count field
    # for anyone else either. In a 200-person school a visible friend list is a map of the social
    # graph and a visible count is a popularity score; your own is self-knowledge. The field enforces
    # that rather than trusting callers not to select it on somebody else.
    friends: [ID!]
    # Where you and this person stand, from the caller's side: "self" | "friends" | "sent" (you asked
    # them) | "received" (they asked you) | "none". Viewer-relative and a single value, which is what
    # lets the People screen draw the right button without ever reading anyone's list.
    friendState: String!
    # Rounds ever completed. Drives the "✋ HOLD" teaching chip, which 14A retires after three rounds.
    roundsTotal: Int!
    blocked: [ID!]
    hideTopAuras: Boolean
    photo: String
    # 7A notification preferences. Null means "never set", which the sender reads as its own default
    # (auras/rounds on, friend-joined off) rather than as off — see PREFS in push.ts.
    notifyAuras: Boolean
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
  # One friend of yours getting picked. Deliberately thin — see friendActivityFor in auras.ts.
  # There is no superlative here and no field to put one in: what a friend was picked *for* is theirs
  # to share, not yours to read. Gender is "private" whenever a card would have withheld it, and also
  # whenever the voter has Infinite Aura.
  type FriendActivityEvent {
    id: ID!
    ts: String!
    friendId: ID!
    # First name only.
    friendName: String!
    gender: String!
  }
  # Something a friend has done, rather than something done to them. Unlike FriendActivityEvent this
  # may name a superlative — a milestone is the aggregate ("Emma's won Best smile x5"), which already
  # sits on her publicProfile, where a per-vote prompt would be a new fact about a hidden card.
  # See friendMilestonesFor in auras.ts.
  type FriendMilestone {
    id: ID!
    ts: String!
    friendId: ID!
    friendName: String!
    # "streak" | "superlative"
    kind: String!
    # Days for a streak, wins for a superlative.
    count: Int!
    # The superlative's prompt and emoji. Empty on a streak.
    label: String!
    emoji: String!
  }
  # Picks received across the caller's whole school, last 24h and the 24h before it. The pair is the
  # point: one number is a fact, two is a direction.
  type SchoolPulse {
    today: Int!
    yesterday: Int!
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
    # Rounds left this hour, out of roundsPerHour, and when the allowance refills (the next UTC hour).
    # roundsLeft 0 with no polls is the "out of rounds" state.
    roundsLeft: Int!
    roundsPerHour: Int!
    nextRoundAt: String!
    # What a reroll costs, so the button can show a price without hardcoding one.
    rerollCost: Int!
    # What a single vote pays, so the "+1" that pops on each vote is the served number rather than a
    # literal in the client — same rule as rerollCost above.
    votePayout: Int!
    # Questions already answered in this round.
    #
    # A resumed round hands back *all* of its polls, answered or not, so a client that opens at the
    # first one lands on a question it has already voted on — where voting is a silent no-op and
    # rerolling fails outright with "you already answered that one". The client uses this to open on
    # the first question actually left to play.
    answeredQuestionIds: [ID!]!
    # What finishing this round pays, Infinite Aura rate included. 14A's "can't afford" sheet leads with
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
    # Name reveals a member gets a day. Not a coin price — coins can never buy a name, which is the
    # one thing Infinite Aura sells. Here so the Shop can say what the membership actually gives.
    dailyFlips: Int!
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
  type Aura {
    id: ID!
    emoji: String!
    q: String!
    color: String!
    # Both free on every card — "a girl in 11th grade" is what a face-down card tells you. Blanked
    # together when detailHidden is set (see below). The flip buys the name and only the name.
    gender: String!
    grade: String!
    infiniteAura: Boolean!
    unread: Boolean!
    anonymous: Boolean!
    # Null until flipped. The flip is the only thing that fills this in.
    name: String
    repeatAdmirer: Boolean!
    # The most recent card from its sender. Lets the Activity feed print "that's 6 times" once rather
    # than on all six of that sender's cards — which the client can't work out for itself, since
    # pickCount is on every one of them and voterId is on none. Always false on an anonymous card.
    newestFromSender: Boolean!
    pickCount: Int!
    ts: String!
    # Whether you have already opened this card at full size. NOT the same as flipped: a protected
    # sender's card and one you ran out of flips on can both be opened without ever turning over, and
    # this is what lets the grid stop them looking untouched. Set by markAuraOpened.
    opened: Boolean!
    # True when gender and grade were withheld because too few people at the school share this
    # sender's cohort — see the anonymity floor in auras.ts. Off by default. Both fields are blanked
    # in the payload too, so a client that ignores this flag still can't leak them.
    detailHidden: Boolean!
  }
  type AurasResult {
    auras: [Aura!]!
    coins: Int!
    infiniteAura: Boolean!
    # Distinct people who picked you in the last 7 days — the Inbox subtitle's number. A count only:
    # deriving it server-side is what keeps voter ids out of the client while still letting the
    # screen say "7 people" instead of "7 auras" (one person can send several).
    admirerCount: Int!
    # Name reveals left today, and the daily allowance they count down from. Zero for a non-member —
    # the allowance is what Infinite Aura buys, so there is nothing to count down before that.
    flipsLeft: Int!
    flipsPerDay: Int!
  }
  type RevealNameResult {
    name: String!
    # Flips left after this one. Unchanged when the card was already open — reopening a reveal costs
    # nothing.
    flipsLeft: Int!
  }
  type CoinResult {
    coins: Int!
    message: String
  }
  # What every dev tool returns. One shape for all of them because the client renders them all the
  # same way — a line of text under the button that was just pressed. ok: false is a refusal the
  # tester can act on (no classmates to vote for you, no enabled polls), not a server error.
  type DevResult {
    ok: Boolean!
    message: String!
  }
  type IapResult {
    infiniteAura: Boolean!
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
  # 12A / README §5's Ranks board. A row's rank and aura count are always the true ones; only the
  # identity is masked when the caller has blocked that person (8A "Blocked on the board").
  type BoardEntry {
    rank: Int!
    userId: ID!
    name: String!
    grade: String
    auras: Int!
    blocked: Boolean!
  }
  type Board {
    entries: [BoardEntry!]!
    # The caller's own pinned row — null when they have no auras in the window at all.
    me: BoardEntry
    # Auras needed to reach the top 10, or null when already there / nobody's ranked deep enough.
    aurasToTopTen: Int
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
    auras: Int!
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
    infiniteAura: Int!
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
    # Your own friends, and the people waiting on your answer. Both self-only by construction — there
    # is no argument to ask for anybody else's.
    friends: [User!]!
    friendRequests: [User!]!
    blocked: [User!]!
    notifications: [Notification!]!
    pollRound: PollRound!
    auras: AurasResult!
    # Your friends' picks, for the Activity feed. Self-only — there is no argument to ask for anyone
    # else's, the same as the friends field above.
    friendActivity: [FriendActivityEvent!]!
    # Friend streaks and superlative wins, for the same feed. Self-only, same as friendActivity.
    friendMilestones: [FriendMilestone!]!
    # How busy your school has been. Bare counts — nothing about who, so no privacy surface at all.
    # Its job is the quiet day: a feed that only reflects you back has nothing to say on exactly the
    # days you most need a reason to open it.
    schoolPulse: SchoolPulse!
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
      id: ID!, schoolId: ID, grade: String, coins: Int, infiniteAura: Boolean,
      firstName: String, lastName: String, username: String
    ): User
    adminDeleteUser(id: ID!): Boolean!

    updateMe(
      firstName: String, lastName: String, username: String, gender: String, grade: String,
      age: Int, schoolId: ID, photo: String, onboarded: Boolean, hideTopAuras: Boolean,
      notifyAuras: Boolean, notifyRound: Boolean, notifyFriendJoined: Boolean, quietHours: Boolean,
      socials: SocialsInput
    ): User!
    # 7A: one device's Expo push token, plus its UTC offset so quiet hours can be evaluated in the
    # user's own local time (see inQuietHours in push.ts). Called on every launch once permission is
    # granted, so it has to be idempotent.
    registerPushToken(token: String!, tzOffsetMinutes: Int): Boolean!
    deleteMe: Boolean!
    block(userId: ID!): [ID!]!
    unblock(userId: ID!): [ID!]!
    # The friendship lifecycle. Every one of these returns the caller's own friend list, so a client
    # never has to guess at the new state or refetch to find out.
    #
    # sendFriendRequest is idempotent and self-completing: asking someone who has already asked you
    # accepts theirs instead of leaving two requests crossed in the post.
    sendFriendRequest(userId: ID!): [ID!]!
    cancelFriendRequest(userId: ID!): [ID!]!
    acceptFriendRequest(userId: ID!): [ID!]!
    denyFriendRequest(userId: ID!): [ID!]!
    removeFriend(userId: ID!): [ID!]!
    # Costs coins and replaces one question's four candidates with four different ones.
    rerollQuestion(roundId: ID!, questionId: ID!): RerollResult!
    reportUser(userId: ID, reason: String): Boolean!
    markNotificationsRead: Boolean!
    vote(questionId: ID!, targetId: ID!, roundId: ID!): VoteResult!
    completeRound(roundId: ID!): RoundCompleteResult!
    markAurasRead: Boolean!
    # Records that you opened one card at full size. Free, idempotent, and scoped to your own cards.
    markAuraOpened(id: ID!): Boolean!
    # 16A's clue ladder. clue: "grade" | "initial". Free for Infinite Aura, then the one free daily
    # tile, then coins. Idempotent — re-tapping an open tile never charges twice.
    revealAuraName(id: ID!): RevealNameResult!
    boostRandom: CoinResult!
    boostCrush(targetId: ID!): CoinResult!
    # Dev/demo switch for Infinite Aura. Passing on: false turns it back off, which is the only way to
    # see the free experience once you've granted yourself membership.
    # (No backticks in here — typeDefs is a template literal and they would close it.)
    legacyInfiniteAura(on: Boolean): Boolean!
    validateIap(signedTransaction: String!): IapResult!

    # ---- dev tools ----
    #
    # Every one of these throws unless AURA_DEV_TOOLS is exactly "1", which is set in .dev.vars and
    # deliberately absent from wrangler.toml — production is off because the variable is not there.
    # See devTools.ts for what each does and why it is not reachable any other way.
    #
    # They stay in the schema rather than being spliced in conditionally: a schema that changes shape
    # per environment means the dev and production APIs are not the same API, and an introspection of
    # a locked-down endpoint showing these is not a leak — calling them still throws.
    devResetFlips: DevResult!
    devSeedVotes(count: Int): DevResult!
    # Grants a classmate Infinite Aura so their card reads as anonymous — see devTools.ts. One of the
    # two dev tools that write to an account other than your own, which is why it says whose.
    devAnonymousVote: DevResult!
    # Befriends up to three classmates and seeds picks for them, so the Activity feed has friend rows.
    # Also writes to other people's accounts, and also names them.
    devSeedFriendActivity(count: Int): DevResult!
    devClearCards: DevResult!
    devGrantSparks(amount: Int): DevResult!
    devResetRounds: DevResult!
    devSetStreak(days: Int!): DevResult!
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
    /* ---- self-only fields ----

       The User type is returned for *other people* too (schoolmates, friends, suggestions), and the
       default resolver hands back whatever sits on the row. Without these gates any signed-in student
       could select `schoolmates { blocked coins infiniteAura age }` and read the school's block graph, wallet
       balances, membership status ("nobody can see you have it" is a product promise), ages and
       notification settings in one query. Same shape as the `friends` gate below: your own row (or an
       admin) gets the value, anyone else gets an empty/absent one rather than an error, so a client that
       over-selects degrades quietly. */
    blocked: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? ((parent.blocked as string[]) || []) : [],
    coins: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? ((parent.coins as number) ?? 0) : null,
    infiniteAura: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? !!parent.infiniteAura : null,
    age: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? ((parent.age as number) ?? null) : null,
    hideTopAuras: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? ((parent.hideTopAuras as boolean) ?? null) : null,
    notifyAuras: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id ? ((parent.notifyAuras as boolean) ?? null) : null,
    notifyRound: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id ? ((parent.notifyRound as boolean) ?? null) : null,
    notifyFriendJoined: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id ? ((parent.notifyFriendJoined as boolean) ?? null) : null,
    quietHours: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id ? ((parent.quietHours as boolean) ?? null) : null,
    // Derived, so the raw tokens never leave the server. Self-only like the prefs it sits beside.
    pushEnabled: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id && Array.isArray(parent.pushTokens) && parent.pushTokens.length > 0,
    streak: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? currentStreak(parent) : 0,
    /* Always an object, so clients don't need a null check per platform. Self-only on the User type:
       the sanctioned way to read someone *else's* handles is publicProfile, which checks school and
       blocks first. */
    socials: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin
        ? (parent.socials && typeof parent.socials === 'object' ? parent.socials : {})
        : {},
    /* Always an array — a user with no friends otherwise returns null and every caller needs its own
       fallback.

       Scoped to yourself (admins excepted, since the admin screens list raw rows). Without this gate
       any signed-in student could select `schoolmates { friends }` and read the whole school's social
       graph in one query. Empty rather than an error so a client that over-selects degrades quietly
       instead of failing everything else in the request.

       There is no `friendCount` companion, deliberately. A count is not a list, but in a school this
       size it is still a popularity score, and the number you'd want it for — your own — you can get
       by counting the list you're already allowed to read. */
    friends: (parent: User, _: unknown, ctx: GraphQLContext) =>
      parent.id === ctx.me?.id || ctx.isAdmin ? friendsOf(parent) : [],
    friendState: (parent: User, _: unknown, ctx: GraphQLContext) => friendStateOf(parent, ctx.me ?? null),
    roundsTotal: (parent: User) => (typeof parent.roundsTotal === 'number' ? parent.roundsTotal : 0)
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
      const auras = superlatives.reduce((sum, s) => sum + s.count, 0);

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
        auras,
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
      // `friends`, not the retired `friendIds` — reading the dead field meant existing friends were
      // never filtered out and kept showing up as suggestions.
      const friendIds = friendsOf(me);
      const mates = (await ctx.db.getUsersBySchool(me.schoolId, me.id)).filter(u => !friendIds.includes(u.id) && notBlocked(me, u));
      const half = Math.ceil(mates.length / 2);
      return { contacts: mates.slice(0, half), fof: mates.slice(half) };
    },
    friends: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.getUsersByIds(friendsOf(me));
    },
    /* People waiting on you. Incoming only — your own outgoing requests are readable through
       `friendState` on the person you sent them to, which is where you'd actually look. */
    friendRequests: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.getUsersByIds(idList(me, 'requestsIn'));
    },
    blocked: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      return ctx.db.getUsersByIds((me.blocked as string[]) || []);
    },
    notifications: (_: unknown, __: unknown, ctx: GraphQLContext) => (requireMe(ctx).notifications as unknown[]) || [],
    friendActivity: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      friendActivityFor(ctx.db, requireMe(ctx), ctx.tuning),
    friendMilestones: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      friendMilestonesFor(ctx.db, requireMe(ctx), ctx.tuning),
    schoolPulse: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      // Nobody has joined a school yet — zeroes rather than a whole-table count.
      if (!me.schoolId) return { today: 0, yesterday: 0 };
      const now = Date.now();
      return ctx.db.schoolPulseCounts(
        me.schoolId as string,
        new Date(now - 86400_000).toISOString(),
        new Date(now - 2 * 86400_000).toISOString()
      );
    },
    pollRound: (_: unknown, __: unknown, ctx: GraphQLContext) => servedRound(ctx.db, ctx.rounds, requireMe(ctx), ctx.tuning),

    /* One object rather than a dozen loose fields: the Shop screen needs all of it at once, and keeping
       it together makes it obvious that these are the *same* numbers the resolvers charge — spread
       across the schema they'd invite a second, drifting copy. */
    shop: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const t = ctx.tuning;
      const expires = typeof me.infiniteAuraExpires === 'string' ? me.infiniteAuraExpires : null;
      return {
        coins: (me.coins as number) ?? 0,
        dailyFlips: t.dailyFlips,
        /* The whole-round take, not one of its two parts: a full round pays per vote *and* a completion
           bonus, and the Shop's "Finish today's round +N" is a promise about finishing one. Serving
           just the bonus here would advertise half of what the round actually gives. */
        roundPayout: t.votePayout * t.questionsPerRound + (me.infiniteAura ? t.roundBonusInfiniteAura : t.roundBonus),
        streakBonus: t.streakBonus,
        inviteBonus: t.inviteBonus,
        coinPackSmall: t.coinPackSmall,
        coinPackMedium: t.coinPackMedium,
        coinPackLarge: t.coinPackLarge,
        boostRandomCost: t.boostRandomCost,
        boostRandomUses: t.boostRandomUses,
        boostCrushCost: t.boostCrushCost,
        boostCrushUses: t.boostCrushUses,
        /* `infiniteAura` is still the stored column — 15A renamed the product, not the database. Renaming it
           would be a migration across live rows for no behavioural gain, so the boundary is here. */
        infiniteAura: !!me.infiniteAura,
        infiniteAuraExpires: expires
      };
    },
    auras: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const { auras: list, admirerCount } = await aurasFor(ctx.db, me, ctx.tuning);
      const flips = flipState(me, ctx.tuning);
      return {
        auras: list,
        coins: me.coins as number,
        infiniteAura: !!me.infiniteAura,
        admirerCount,
        flipsLeft: flips.left,
        flipsPerDay: ctx.tuning.dailyFlips
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
    // JSONB merge covers coins/infiniteAura/grade/names; deleteUser already cascades votes via FKs).
    // Prefixed "admin" (unlike updateSchool/deletePoll etc.) specifically so this doesn't read like
    // a self-service pair with updateMe/deleteMe — it edits/deletes *any* user, admin-gated.
    adminUpdateUser: (
      _: unknown,
      args: {
        id: string; schoolId?: string; grade?: string; coins?: number; infiniteAura?: boolean;
        firstName?: string; lastName?: string; username?: string;
      },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const fields: Record<string, unknown> = {};
      if (args.schoolId !== undefined) fields.schoolId = args.schoolId || null;
      if (args.grade !== undefined) fields.grade = args.grade;
      if (args.coins !== undefined) fields.coins = args.coins;
      if (args.infiniteAura !== undefined) fields.infiniteAura = args.infiniteAura;
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
        age?: number; schoolId?: string; photo?: string; onboarded?: boolean; hideTopAuras?: boolean;
        notifyAuras?: boolean; notifyRound?: boolean; notifyFriendJoined?: boolean; quietHours?: boolean;
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
      if (args.hideTopAuras !== undefined) fields.hideTopAuras = !!args.hideTopAuras;
      // 7A prefs. Only written when the client actually sends one, so "never set" stays
      // distinguishable from "set to false" — push.ts's defaults depend on that difference.
      if (args.notifyAuras !== undefined) fields.notifyAuras = !!args.notifyAuras;
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
        /* When each block happened, for 8A's blocked list ("Blocked 3 weeks ago"). Kept in a
           parallel map rather than turning `blocked` into a list of objects: `blocked` is read as
           `string[]` by notBlocked() and every vote/round eligibility check, and reshaping it would
           mean touching all of them plus backfilling live JSONB. Anyone blocked before this shipped
           simply has no entry, which the UI renders as an undated row. */
        const blockedAt = { ...((me.blockedAt as Record<string, string>) || {}), [args.userId]: new Date().toISOString() };
        await ctx.db.updateUser(me.id, { blocked, blockedAt });
        /* Blocking severs the friendship and any request in either direction. Leaving the edge in place
           would keep weighting you into each other's polls, which is the one thing a block must stop —
           and would leave a pending request the blocked person could still accept. */
        for (const key of FRIEND_LISTS) {
          await ctx.db.removeFromIdList(me.id, key, target.id);
          await ctx.db.removeFromIdList(target.id, key, me.id);
        }
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
    /* ---------- friendship ----------

       A friendship is symmetric and approved, which means every one of these writes *both* users' rows.
       They all go through addToIdList/removeFromIdList rather than updateUser: accepting a request
       touches four lists across two rows, and read-modify-write would let two people accepting each
       other at the same moment each save a copy of the graph that omits the other's change.

       Same school only, in the one place it can be enforced — the whole app is school-scoped, and a
       cross-school friendship would weight someone into polls they can't appear in. */
    sendFriendRequest: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const other = await ctx.db.getUserById(args.userId);
      if (!other || other.id === me.id) throw new Error('Pick a valid person');
      if (!me.schoolId || other.schoolId !== me.schoolId) throw new Error('You can only add people at your school');
      if (!notBlocked(me, other)) throw new Error("You can't add someone you blocked");
      if (friendsOf(me).includes(other.id)) return friendsOf(me);

      /* They already asked you — so this accepts rather than queuing a second request pointing the
         other way. Two people tapping Add on each other within a few seconds is common enough that
         leaving both stuck as "sent" would be a dead end neither of them could see the way out of. */
      if (idList(me, 'requestsIn').includes(other.id)) {
        return (resolvers.Mutation as any).acceptFriendRequest(_, args, ctx);
      }
      await ctx.db.addToIdList(other.id, 'requestsIn', [me.id]);
      await ctx.db.addToIdList(me.id, 'requestsOut', [other.id]);
      return friendsOf(me);
    },

    /* Withdrawing your own request. Clears both sides, so a cancelled request leaves nothing behind on
       the other person's screen. */
    cancelFriendRequest: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.removeFromIdList(me.id, 'requestsOut', args.userId);
      await ctx.db.removeFromIdList(args.userId, 'requestsIn', me.id);
      return friendsOf(me);
    },

    acceptFriendRequest: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const other = await ctx.db.getUserById(args.userId);
      if (!other) throw new Error('Pick a valid person');
      /* Checked against the row as it is now, not the one this request started with: a request that
         was cancelled or denied in the meantime must not still be acceptable. */
      if (!idList(me, 'requestsIn').includes(other.id)) throw new Error('No request from that person');
      if (!notBlocked(me, other)) throw new Error("You can't add someone you blocked");

      // The pending edge goes first, so a failure halfway can't leave a friendship with a live request
      // still attached to it.
      await ctx.db.removeFromIdList(me.id, 'requestsIn', other.id);
      await ctx.db.removeFromIdList(other.id, 'requestsOut', me.id);
      await ctx.db.addToIdList(other.id, 'friends', [me.id]);
      return ctx.db.addToIdList(me.id, 'friends', [other.id]);
    },

    /* Denying is silent by design: it clears the request and tells the sender nothing. A "denied"
       notification is a rejection delivered to a teenager by a machine, and the sender can already see
       the request is no longer pending. */
    denyFriendRequest: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.removeFromIdList(me.id, 'requestsIn', args.userId);
      await ctx.db.removeFromIdList(args.userId, 'requestsOut', me.id);
      return friendsOf(me);
    },

    /** Unfriending is mutual — there is no version of this where one side keeps the edge. */
    removeFriend: async (_: unknown, args: { userId: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.removeFromIdList(args.userId, 'friends', me.id);
      return ctx.db.removeFromIdList(me.id, 'friends', args.userId);
    },

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
      /* The round is required, not optional. It used to be `if (round) {...}` — which meant a request
         with a made-up roundId skipped every round check *and still created the vote*: unlimited
         ballot stuffing for a friend, off any screen, with no allowance spent. */
      const round = await ctx.rounds.get(args.roundId);
      if (!round || round.userId !== me.id) throw new Error('no active round');
      const polls = await ctx.db.getPolls();
      const q = polls.find(p => p.id === args.questionId && p.enabled);
      const target = await ctx.db.getUserById(args.targetId);
      if (!q || !target) throw new Error('bad vote');
      if (target.id === me.id) throw new Error('cannot vote for yourself');
      /* Integrity: the target must be one of the candidates this round actually served for this
         question. The old check (same school, or ever boosted) let a script vote for anyone at the
         school on every question regardless of who was on the card — and `hasActiveBoostFor` matched
         spent boosts (`remaining >= 0`), so one boost purchase made its buyer votable forever. The
         served choices already encode every eligibility rule the round build enforces. */
      const servedPoll = round.polls.find(p => p.questionId === args.questionId);
      if (!servedPoll || !servedPoll.choices.some(c => c.id === target.id)) throw new Error('not eligible');
      // Still re-checked at vote time: a block placed mid-round must win over the built round.
      if (!notBlocked(me, target)) throw new Error('not eligible');
      if (round.votedQ.includes(args.questionId)) return { ok: true, dup: true };
      /* Against the round's own length, not a hardcoded 12: questionsPerRound is a tunable dial, and
         raising it used to make every vote past the twelfth throw "round full". */
      if (round.votedQ.length >= round.polls.length) throw new Error('round full');
      round.votedQ.push(args.questionId);
      round.answered = round.votedQ.length;
      await ctx.rounds.save(args.roundId, round);
      await ctx.db.createVote({
        id: 'vote_' + crypto.randomUUID().slice(0, 12),
        voterId: me.id, targetId: args.targetId, questionId: args.questionId, emoji: q.emoji, text: q.text, color: q.color
      });
      /* Paid per vote, after the row exists. Every guard that could reject this vote has already run —
         a duplicate returned above and never reaches here, so a question can only ever pay once, and
         the round's own `votedQ` is what enforces that rather than anything in the wallet. */
      if (ctx.tuning.votePayout > 0) await ctx.db.adjustCoins(me.id, ctx.tuning.votePayout);
      /* "Know the second someone picks you" — the aura push, 7A's whole argument for notifications.
         Inside waitUntil so it never delays or fails the vote (see index.ts), and anonymous exactly
         when the Inbox would be: a Infinite Aura voter stays hidden here too. */
      ctx.waitUntil(sendPush(ctx.db, target, 'aura', auraBody(me, q.text as string, !!me.infiniteAura), { targetId: target.id }));
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
      /* Completing a round is what "played today" means, so the streak advances here rather than on
         opening the app — otherwise it would count visits, which is not what the aura says. Returns
         null for a second round on the same day, in which case there's nothing to write. */
      const nextStreak = advanceStreak(me);
      /* The Shop's "Keep your streak" row. It was advertised and never credited — the bonus lands on
         the completion that *extends* a run (streak 2 and up), not on day one, which is just the round
         doing its job. */
      const keptStreak = nextStreak !== null && nextStreak.streak >= 2;
      /* The completion bonus is for answering *every* question, not for pressing the button. A partial
         round keeps what its votes already paid and earns none of this — otherwise one vote and a tap
         would be worth the same as ten. */
      const answeredAll = round.votedQ.length >= round.polls.length;
      const bonus = answeredAll ? (me.infiniteAura ? ctx.tuning.roundBonusInfiniteAura : ctx.tuning.roundBonus) : 0;
      const streak = keptStreak ? ctx.tuning.streakBonus : 0;
      const newCoins = await ctx.db.adjustCoins(me.id, bonus + streak);
      /* Reported, not credited: the votes were paid as they were cast, so this call only moves the
         bonus and the streak. `earned` is the whole round's take because that's the number the congrats
         screen is answering — "what did this round get me" — and quoting only the bonus there would
         understate it by everything the player just did. */
      const earned = ctx.tuning.votePayout * round.votedQ.length + bonus + streak;
      /* Lifetime completed rounds, written in the same update as the streak so a completion costs one
         write either way. Only used to retire 14A's "✋ HOLD" chip after three rounds — a client-side
         counter would reset on reinstall and re-teach the gesture to someone who already knows it. */
      const roundsTotal = (typeof me.roundsTotal === 'number' ? me.roundsTotal : 0) + 1;
      await ctx.db.updateUser(me.id, { ...(nextStreak ?? {}), roundsTotal });
      return { coins: newCoins, earned, already: false };
    },

    markAurasRead: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.markAllVotesReadForTarget(me.id);
      return true;
    },

    /* One card, opened. The scope is in the WHERE clause (id AND target_id), so passing someone
       else's vote id updates nothing rather than erroring — there is no state to leak either way,
       and a 'not found' would confirm whether an id exists. */
    markAuraOpened: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      await ctx.db.markVoteOpened(args.id, me.id);
      return true;
    },
    /* `revealClue` and `revealAura` lived here — 16A's clue ladder, where coins and a free daily tile
       bought the sender's grade and first initial one scratch-off at a time. The whole ladder is gone:
       a card is face down or it is turned over, and the flip is the only thing that turns it. What that
       removed, in order: the grade and initial tiles, the coin prices on them, the one-free-tile-a-day
       clock, and the two mutations that spent all three. Coins now buy boosts and rerolls only. */
    revealAuraName: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const v = await ctx.db.getVoteForTarget(args.id, me.id);
      if (!v) throw new Error('no aura');
      if (!me.infiniteAura) throw new Error('Infinite Aura required');
      const voter = await ctx.db.getUserById(v.voterId);
      if (!voter) throw new Error('voter gone');
      if (voter.infiniteAura) throw new Error('This admirer is anonymous 🔒');

      /* The daily flip allowance.

         Membership buys *access* to names, not all of them at once. Two a day is what gives the top
         rung a tomorrow — and it's counted per card, so a classmate who picked you five times costs
         five flips rather than collapsing into one.

         Order matters here. An already-open card returns free and unchanged before the allowance is
         even read, so re-opening the reveal screen or tapping a flipped card can never cost anything;
         the counter only moves on the write that actually turned a card over (markVoteNameRevealed
         reports that). Nothing is charged for a blocked flip either — the anonymous check above
         throws first, which is what makes the protected screen's "nothing spent" true. */
      const flips = flipState(me, ctx.tuning);
      if (v.nameRevealed) {
        return { name: `${voter.firstName} ${voter.lastName}`, flipsLeft: flips.left };
      }
      if (flips.left <= 0) {
        throw new Error(
          ctx.tuning.dailyFlips === 0 ? 'Flips are switched off' : "That's both your flips for today — they reset at midnight"
        );
      }
      const opened = await ctx.db.markVoteNameRevealed(v.id);
      // `opened` false means another request turned this card over first; don't bill for it twice.
      const left = opened ? flips.left - 1 : flips.left;
      if (opened) await ctx.db.updateUser(me.id, { flipsOn: flips.day, flipsUsed: flips.used + 1 });
      return { name: `${voter.firstName} ${voter.lastName}`, flipsLeft: left };
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
    /* `shopBoost(cost: Int!)` lived here — a "charge me whatever the client says" mutation. No client
       ever called it, and a client-supplied cost is backwards twice over: a negative cost *minted*
       coins, and a zero cost bought the charge row for free. Prices only ever flow server → client. */
    /* Legacy/dev instant unlock — kept for the web demo. Real iOS uses validateIap below.

       Now takes a direction. It only ever granted membership, which meant that once anyone flipped it
       on there was no way back to the free experience short of editing the database — so the half of
       the product most users will actually see was the half nobody on the team could look at.

       LAUNCH BLOCKER: remove (or admin-gate) this before StoreKit purchases go live, or the paywall
       stays a free button forever. Adding the off switch doesn't widen that hole — the on switch is
       the hole — but it does mean the whole mutation has to go, not just half of it. */
    legacyInfiniteAura: async (_: unknown, args: { on?: boolean }, ctx: GraphQLContext) => {
      const me = requireMe(ctx);
      const on = args.on ?? true;
      await ctx.db.updateUser(me.id, { infiniteAura: on, infiniteAuraExpires: null });
      return on;
    },

    // Real Apple In-App Purchase: verify the StoreKit2 signed transaction, then grant Infinite Aura.
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
      const infiniteAuraProducts = (ctx.env.INFINITE_AURA_PRODUCT_IDS || DEFAULT_INFINITE_AURA_PRODUCTS).split(',');
      if (!infiniteAuraProducts.includes(tx.productId)) throw new Error('Unknown product ' + tx.productId);

      const iapTransactions = (me.iapTransactions as string[]) || [];
      const txId = String(tx.transactionId);
      const already = iapTransactions.includes(txId);
      const newIapTransactions = already ? iapTransactions : [...iapTransactions, txId];

      const expMs = tx.expiresDate ? Number(tx.expiresDate) : null;
      if (expMs && expMs <= Date.now()) {
        await ctx.db.updateUser(me.id, { iapTransactions: newIapTransactions });
        return { infiniteAura: false, expired: true, expires: new Date(expMs).toISOString() };
      }
      const infiniteAuraExpires = expMs ? new Date(expMs).toISOString() : null;
      await ctx.db.updateUser(me.id, { iapTransactions: newIapTransactions, infiniteAuraExpires, infiniteAura: true });
      return {
        infiniteAura: true,
        expires: infiniteAuraExpires,
        environment: tx.environment || null,
        renewed: !already && newIapTransactions.length > 1
      };
    },

    /* ---- dev tools ----

       Thin on purpose. Each one is a gate, a signed-in user, and a call into devTools.ts — the logic
       lives there so this file doesn't grow a second set of rules for writing votes and adjusting
       balances alongside the real ones.

       `requireDevTools` first, before `requireMe`: on an environment where these are switched off the
       answer is "these don't exist here", and that shouldn't depend on whether the caller happens to
       be signed in. */
    devResetFlips: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devResetFlips(ctx.db, requireMe(ctx), ctx.tuning);
    },
    devSeedVotes: async (_: unknown, args: { count?: number }, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devSeedVotes(ctx.db, requireMe(ctx), ctx.tuning, args.count ?? 8);
    },
    devAnonymousVote: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devAnonymousVote(ctx.db, requireMe(ctx));
    },
    devSeedFriendActivity: async (_: unknown, args: { count?: number }, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devSeedFriendActivity(ctx.db, requireMe(ctx), ctx.tuning, args.count ?? 9);
    },
    devClearCards: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devClearCards(ctx.db, requireMe(ctx));
    },
    devGrantSparks: async (_: unknown, args: { amount?: number }, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devGrantSparks(ctx.db, requireMe(ctx), args.amount ?? 50);
    },
    devResetRounds: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devResetRounds(ctx.db, requireMe(ctx), ctx.tuning);
    },
    devSetStreak: async (_: unknown, args: { days: number }, ctx: GraphQLContext) => {
      requireDevTools(ctx.env);
      return devSetStreak(ctx.db, requireMe(ctx), args.days);
    }
  }
};

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });
