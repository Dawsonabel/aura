/* Verifies a Clerk session token from the Authorization header. Networkless — verifyToken() checks
   the JWT signature against Clerk's JWKS public key, no round trip to Clerk per request, which is
   the right fit for a GraphQL context factory that runs on every request. */
import { verifyToken } from '@clerk/backend';

// `role` arrives via a custom session-token claim (Clerk dashboard: Sessions → Customize session
// token → "role": "{{user.public_metadata.role}}") — not a separate Backend API call, so checking
// it costs nothing extra per request, same reasoning as verifyToken() itself being networkless.
export type ClerkClaims = { sub: string; role?: string; [key: string]: unknown };

export async function verifyClerkRequest(req: Request, secretKey: string): Promise<ClerkClaims | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const payload = await verifyToken(token, { secretKey });
    return payload as ClerkClaims;
  } catch (e) {
    // Still treated as "no session" rather than a hard error, but log the reason: silently
    // swallowing this makes a rejected-token bug (wrong key, clock skew, wrong issuer) look
    // identical to "not signed in" from the client's side, which is very hard to diagnose.
    console.warn('[auth] token rejected:', e instanceof Error ? e.message : e);
    return null;
  }
}
