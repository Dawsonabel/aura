/* Ports server.js's flamesFor() exactly — the anonymous-voter (God Mode) rule, the coin-reveal
   hint, and the bonus-name-reveal logic are the trickiest business rules in the app and already
   have real test coverage (test/flames.test.js) documenting the intended behavior to match. */
import type { Db, User } from './db';

export type Flame = {
  id: string; emoji: string; q: string; color: string;
  gender: string; grade: string;
  revealed: boolean; godMode: boolean; unread: boolean; anonymous: boolean;
  initial: string | null; name: string | null;
  repeatAdmirer: boolean; pickCount: number; ts: string;
};

function initial(u: User): string {
  return String((u.firstName as string) || '?').charAt(0).toUpperCase();
}

export async function flamesFor(db: Db, user: User): Promise<Flame[]> {
  const revealedVoters = (user.revealedVoters as string[]) || [];
  const votes = await db.getRawVotesForTarget(user.id);
  const voterIds = [...new Set(votes.map(v => v.voterId))];
  const voters = await db.getUsersByIds(voterIds);
  const voterOf = new Map(voters.map(v => [v.id, v]));

  // pickCount needs, per voter, how many total votes they've cast at this target — compute once.
  const countsByVoter = new Map<string, number>();
  for (const v of votes) countsByVoter.set(v.voterId, (countsByVoter.get(v.voterId) || 0) + 1);

  return votes.map(v => {
    const voter = voterOf.get(v.voterId) || null;
    const gm = !!user.godMode;
    const anonymous = !!(voter && voter.godMode);
    const hintShown = v.revealed || gm;
    const pickCount = countsByVoter.get(v.voterId) || 0;
    const nameShown = revealedVoters.includes(v.voterId) && !!voter;
    return {
      id: v.id, emoji: v.emoji, q: v.text, color: v.color,
      gender: voter ? String(voter.gender) : 'nonbinary',
      grade: voter ? String(voter.grade) : 'your grade',
      revealed: v.revealed, godMode: gm, unread: v.unread, anonymous,
      initial: hintShown && voter && !anonymous ? initial(voter) : null,
      name: nameShown && !anonymous ? `${voter!.firstName} ${voter!.lastName}` : null,
      repeatAdmirer: pickCount >= 2 && !anonymous, pickCount,
      ts: v.ts
    };
  });
}
