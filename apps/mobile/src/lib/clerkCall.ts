type ClerkError = { message: string; longMessage?: string };

/* Clerk's signals API has two different failure channels, and only one of them is a returned
   value: *server* errors come back as `{ error }`, but client-side precondition violations THROW
   (e.g. `signIn.phoneCode.sendCode()` with an empty phoneNumber throws
   "cannot be called without an phoneNumber if an existing signIn does not exist").

   Handling only the returned `{ error }` lets those throws escape as an uncaught promise
   rejection — in dev that's a full-screen redbox, in production a silently dead button. This
   normalizes both channels into "a message, or null on success" so callers just render it. */
export async function callClerk(fn: () => Promise<{ error: ClerkError | null }>): Promise<string | null> {
  try {
    const { error } = await fn();
    return error ? (error.longMessage ?? error.message) : null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Something went wrong. Try again.';
  }
}
