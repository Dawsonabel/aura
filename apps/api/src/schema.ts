import { createSchema } from 'graphql-yoga';
import type { Db } from './db';
import type { RateLimiter } from './ratelimit';

export interface Env {
  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
}

// The full context Yoga hands resolvers — the initial per-request fields (req/env/ip, set in
// index.ts's context factory) plus the derived ones (db/ratelimit). Yoga merges the initial
// context with whatever the `context` factory returns, so this has to describe that whole merge,
// not just the new fields, or its generic and createYoga's fight each other.
export type GraphQLContext = { req: Request; env: Env; ip: string; db: Db; ratelimit: RateLimiter };

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
    firstName: String
    lastName: String
    username: String
    gender: String
    grade: String
    age: Int
    onboarded: Boolean
    coins: Int
    godMode: Boolean
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
    polls: [Poll!]!
    pollLibrary: [PollLibItem!]!
    votes(limit: Int): [Vote!]!
    reports: [Report!]!
    adminStats: AdminStats!
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
  }
`;

const resolvers = {
  Query: {
    schools: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const { success } = await ctx.ratelimit.limit(ctx.ip);
      if (!success) throw new Error('Too many requests');
      return ctx.db.getSchoolsWithUserCounts();
    },
    school: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.getSchool(args.id),
    user: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.getUserById(args.id),
    polls: (_: unknown, __: unknown, ctx: GraphQLContext) => ctx.db.getPolls(),
    pollLibrary: () => POLL_LIB.map(([emoji, text, color]) => ({ emoji, text, color })),
    votes: (_: unknown, args: { limit?: number }, ctx: GraphQLContext) => ctx.db.getVotes(args.limit),
    reports: (_: unknown, __: unknown, ctx: GraphQLContext) => ctx.db.getReports(),
    adminStats: (_: unknown, __: unknown, ctx: GraphQLContext) => ctx.db.getAdminStats()
  },
  Mutation: {
    createSchool: (_: unknown, args: { name: string; city?: string }, ctx: GraphQLContext) =>
      ctx.db.createSchool({ id: 'sch_' + crypto.randomUUID().slice(0, 12), name: args.name, city: args.city }),
    updateSchool: (_: unknown, args: { id: string; name?: string; city?: string }, ctx: GraphQLContext) =>
      ctx.db.updateSchool(args.id, { name: args.name, city: args.city }),
    deleteSchool: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.deleteSchool(args.id),

    createPoll: (
      _: unknown,
      args: { emoji: string; text: string; color: string; schoolId?: string; enabled?: boolean },
      ctx: GraphQLContext
    ) => ctx.db.createPoll({ id: 'pol_' + crypto.randomUUID().slice(0, 12), ...args }),
    updatePoll: (
      _: unknown,
      args: { id: string; emoji?: string; text?: string; color?: string; enabled?: boolean; schoolId?: string },
      ctx: GraphQLContext
    ) => {
      const fields: Record<string, unknown> = { emoji: args.emoji, text: args.text, color: args.color, enabled: args.enabled };
      if ('schoolId' in args) fields.schoolId = args.schoolId;
      return ctx.db.updatePoll(args.id, fields);
    },
    deletePoll: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.deletePoll(args.id),
    deleteVote: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.deleteVote(args.id),
    resolveReport: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.resolveReport(args.id)
  }
};

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });
