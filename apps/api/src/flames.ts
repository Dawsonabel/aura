/* Ports server.js's flamesFor() exactly — the anonymous-voter (God Mode) rule, the coin-reveal
   hint, and the bonus-name-reveal logic are the trickiest business rules in the app and already
   have real test coverage (test/flames.test.js) documenting the intended behavior to match. */
import type { Db, User } from './db';
import { notBlocked } from './pollRound';
import type { Tuning } from './tuning';

export type Flame = {
  id: string; emoji: string; q: string; color: string;
  gender: string; grade: string;
  revealed: boolean; godMode: boolean; unread: boolean; anonymous: boolean;
  /** 16A: the grade tile is bought separately from the initial. */
  gradeRevealed: boolean;
  initial: string | null; name: string | null;
  repeatAdmirer: boolean; pickCount: number; ts: string;
  /** True when the voter's gender/grade were withheld because their cohort is too small to hide in. */
  detailHidden: boolean;
};

/** Matches 12A's "flames disappear after 30 days ✨". */
export const FLAME_LIFETIME_DAYS = 30;

/* The anonymity floor.

   A flame's subtitle names the voter's gender and grade — "a girl in 11th grade picked you". That is
   only anonymous if enough people match it. In a school with four girls in 11th, it narrows the sender
   to a one-in-four guess, and spending a coin for the first initial usually makes it unique. For an app
   whose entire promise is "they never find out it was you", that's the promise failing precisely where
   the school is smallest — which is also where everyone knows everyone.

   So below a threshold of people sharing a (gender, grade) cohort, both attributes are withheld and the
   flame reads "someone at your school" instead. The threshold is tuning.cohortFloor — tunable, but
   lowering it trades away real anonymity rather than buying growth.

   The coin-revealed initial is deliberately NOT suppressed: it's opt-in, it costs something, and it is
   the game. This floor is about what leaks for free. */
/** The window "N people picked you this week" counts over. */
const WEEK_DAYS = 7;

function initial(u: User): string {
  return String((u.firstName as string) || '?').charAt(0).toUpperCase();
}

/* Distinct people who picked this user in the last week — the Inbox subtitle's number.

   A count, never identities: it's derived from the same filtered vote set the flames come from, so
   blocked and expired votes are already excluded, and nothing about *who* leaves this function. */
export function admirersThisWeek(flames: { voterId: string; ts: string }[]): number {
  const cutoff = Date.now() - WEEK_DAYS * 86400_000;
  const recent = flames.filter(f => new Date(f.ts).getTime() >= cutoff);
  return new Set(recent.map(f => f.voterId)).size;
}

export type FlamesFor = { flames: Flame[]; admirerCount: number };

/* Returns the flames *and* the distinct-admirer count together, rather than exposing a second
   function: the count needs voter ids, and those must not leave this module. One query either way. */
export async function flamesFor(db: Db, user: User, tuning: Tuning): Promise<FlamesFor> {
  const revealedVoters = (user.revealedVoters as string[]) || [];
  const allVotes = await db.getRawVotesForTarget(user.id);
  const voterIds = [...new Set(allVotes.map(v => v.voterId))];
  const voters = await db.getUsersByIds(voterIds);
  const voterOf = new Map(voters.map(v => [v.id, v]));

  /* Blocking hides that person's flames. It's a read-time filter, not a delete: the vote rows stay,
     so unblocking brings the flames back — which is why the blocked list's copy says exactly that
     rather than promising they're gone for good.

     Mutual, via the same notBlocked() the round eligibility uses: "you both disappear from each
     other's grid" cuts both ways, so a flame from someone who blocked *you* is hidden too. A vote
     whose voter no longer exists is kept — a deleted account isn't a blocked one, and those already
     render as an unknown admirer. */
  const cutoff = Date.now() - tuning.flameLifetimeDays * 86400_000;
  const votes = allVotes.filter(v => {
    const voter = voterOf.get(v.voterId);
    if (voter && !notBlocked(user, voter)) return false;
    /* 12A's Inbox footer states "flames disappear after 30 days". Enforced here as a read-time
       window rather than a delete job, for the same reason as the block filter above: no destructive
       background work, and the claim on screen becomes true. The rows stay for admin/analytics. */
    return new Date(v.ts).getTime() >= cutoff;
  });

  /* Cohort sizes for the anonymity floor, one aggregate for the whole school. Skipped entirely when
     there are no flames to label. */
  const cohortSize = new Map<string, number>();
  if (votes.length > 0 && user.schoolId) {
    for (const row of await db.getCohortCounts(user.schoolId as string)) {
      cohortSize.set(`${row.gender ?? ''}|${row.grade ?? ''}`, row.n);
    }
  }
  const tooSmallToHideIn = (voter: User | null): boolean => {
    if (!voter) return false; // a deleted voter already shows no attributes
    const n = cohortSize.get(`${String(voter.gender ?? '')}|${String(voter.grade ?? '')}`) ?? 0;
    return n < tuning.cohortFloor;
  };

  // pickCount needs, per voter, how many total votes they've cast at this target — compute once.
  const countsByVoter = new Map<string, number>();
  for (const v of votes) countsByVoter.set(v.voterId, (countsByVoter.get(v.voterId) || 0) + 1);

  const flames = votes.map(v => {
    const voter = voterOf.get(v.voterId) || null;
    const gm = !!user.godMode;
    const anonymous = !!(voter && voter.godMode);
    /* Membership buys the clue, it doesn't skip the card.

       These two used to be `|| gm`, which handed a member every clue already open — no tap, no foil,
       no scratch. That's the wrong thing to sell: the scratch *is* the product, and Infinite Aura's
       promise is that it costs nothing, not that it's over before you get there. A member's tiles
       arrive sealed and priced FREE, and revealClue charges them nothing (see schema.ts).

       `!anonymous` on both: a sender with Infinite Aura is hidden from everyone, and that has to hold
       retroactively. Someone can pay to open a grade tile and *then* the sender becomes a member —
       these are recomputed per request, so the grade goes back in the envelope rather than staying out
       because of a flag set before the sender was entitled to hide. */
    const hintShown = v.revealed && !anonymous;
    const pickCount = countsByVoter.get(v.voterId) || 0;
    const nameShown = revealedVoters.includes(v.voterId) && !!voter;
    /* 16A moved the grade behind a coin, which narrows what the anonymity floor has to cover.

       The floor exists so the *free* attributes can't identify anyone: in a school with four girls in
       11th, "a girl in 11th grade" is a one-in-four guess handed over for nothing. Now that only the
       gender tile is free, that's the only one the floor has to withhold — and the grade joins the
       initial as opt-in, paid, and deliberately not suppressed. Same reasoning the initial always had:
       the floor governs what leaks for free, not what the game sells.

       Withheld rather than merely unrendered: the value is blanked in the payload too, so a client that
       ignores `detailHidden` still can't leak it. Doesn't apply once the name is out — by then the
       sender has been identified through the paid path anyway. */
    const detailHidden = !nameShown && tooSmallToHideIn(voter);
    const gradeShown = v.gradeRevealed && !anonymous;
    return {
      id: v.id, emoji: v.emoji, q: v.text, color: v.color,
      gender: detailHidden ? 'private' : voter ? String(voter.gender) : 'nonbinary',
      /* Empty until bought. The tile renders as sealed foil off exactly this, so an unpaid grade must
         not be in the payload at all — not merely hidden by the client. */
      grade: gradeShown ? (voter ? String(voter.grade) : 'your grade') : '',
      /* `hintShown`, not `v.revealed` — the same treatment `gradeRevealed` gets one line over.

         These two disagreed, and the disagreement was visible: membership used to put the initial in
         the payload while leaving this flag false, so the Aura list printed "starts with J" next to a
         clue screen still selling that tile. The invariant both flags now keep is that **a clue is in
         the payload if and only if its tile is open** — which is what makes the list safe to read
         straight off the payload, and what stops any client from being the last line of defence. */
      revealed: hintShown, gradeRevealed: gradeShown, godMode: gm, unread: v.unread, anonymous,
      initial: hintShown && voter ? initial(voter) : null,
      name: nameShown && !anonymous ? `${voter!.firstName} ${voter!.lastName}` : null,
      repeatAdmirer: pickCount >= 2 && !anonymous, pickCount,
      ts: v.ts,
      detailHidden
    };
  });

  return { flames, admirerCount: admirersThisWeek(votes) };
}
