/* Verifies a Clerk session token from the Authorization header. Networkless — verifyToken() checks
   the JWT signature against Clerk's JWKS public key, no round trip to Clerk per request, which is
   the right fit for a GraphQL context factory that runs on every request. */
import { verifyToken } from '@clerk/backend';

export type ClerkClaims = { sub: string; [key: string]: unknown };

export async function verifyClerkRequest(req: Request, secretKey: string): Promise<ClerkClaims | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const payload = await verifyToken(token, { secretKey });
    return payload as ClerkClaims;
  } catch {
    return null; // invalid/expired token — treated as "no session", not a hard error
  }
}
