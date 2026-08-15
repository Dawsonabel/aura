import { createSchema } from 'graphql-yoga';
import type { Db } from './db';
import type { RateLimiter } from './ratelimit';

export type GraphQLContext = { db: Db; ratelimit: RateLimiter; ip: string };

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
  type Query {
    schools: [School!]!
    school(id: ID!): School
    user(id: ID!): User
  }
  type Mutation {
    createSchool(name: String!, city: String): School!
    updateSchool(id: ID!, name: String, city: String): School
    deleteSchool(id: ID!): Boolean!
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
    user: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.getUserById(args.id)
  },
  Mutation: {
    createSchool: (_: unknown, args: { name: string; city?: string }, ctx: GraphQLContext) =>
      ctx.db.createSchool({ id: 'sch_' + crypto.randomUUID().slice(0, 12), name: args.name, city: args.city }),
    updateSchool: (_: unknown, args: { id: string; name?: string; city?: string }, ctx: GraphQLContext) =>
      ctx.db.updateSchool(args.id, { name: args.name, city: args.city }),
    deleteSchool: (_: unknown, args: { id: string }, ctx: GraphQLContext) => ctx.db.deleteSchool(args.id)
  }
};

export const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });
