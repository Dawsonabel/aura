import { useEffect, useState } from 'react';

/* Shared countdown for anything rate-limited by Clerk.

   Two screens need this: the welcome screen (Clerk rate-limits the *request* for a code, per
   number) and the verify screen (resend). Getting it wrong on the welcome screen is what made the
   "Too many verification code requests" error a dead end — the server said "wait 30 seconds" and
   the UI offered no timer and left the button enabled, so tapping again just failed again.

   Tracks a deadline rather than decrementing a counter: iOS suspends JS timers while the app is
   backgrounded (which is exactly what happens when the user leaves to read the SMS), so a counter
   under-counts and holds the user past the real window. Deriving from the wall clock self-corrects
   however long the app was away, and doesn't drift. */
export function useCooldown() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (deadline === null) return;
    const read = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setSecondsLeft(read());
    // 500ms so the displayed second is never more than half a second stale.
    const id = setInterval(() => {
      const left = read();
      setSecondsLeft(left);
      if (left === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [deadline]);

  return {
    secondsLeft,
    active: secondsLeft > 0,
    /** mm:ss — "0:30". Derived so a window longer than 59s can't render as "0:90". */
    label: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`,
    start: (seconds: number) => setDeadline(Date.now() + seconds * 1000)
  };
}

/** Clerk's per-number code-request window. Matches the server's own lockout message. */
export const CODE_COOLDOWN_SECONDS = 30;

/* Clerk reports the lockout as a plain message rather than a typed code, so matching the text is
   the only signal available. Kept deliberately loose, and it only ever *adds* a cooldown — a miss
   degrades to the old behaviour (enabled button, server rejects) rather than locking anyone out. */
export function isRateLimited(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('too many') || m.includes('wait at least');
}
