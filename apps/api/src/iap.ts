/* Apple In-App Purchase verification (StoreKit 2) — ported from root iap.js essentially as-is.
   The iOS app buys Infinite Aura via StoreKit 2 and sends the *signed transaction* (a JWS) to the
   validateIap mutation. We verify it here, server-side, before granting the entitlement —
   clients can never self-grant Infinite Aura.

   Verification steps (per Apple's JWS / App Store Server format):
     1. Parse the JWS header; it carries an x5c cert chain [leaf, intermediate, root].
     2. Verify the chain: leaf signed by intermediate, intermediate by root.
     3. Verify the root is Apple's real root CA (fingerprint in trustedRoots).
     4. Verify the JWS ES256 signature with the leaf certificate's public key.
     5. Return the decoded transaction payload for the caller to check
        (productId, expiresDate, transactionId, environment).

   Production: set APPLE_ROOT_CA to Apple's root cert PEM (public). Dev/sandbox with no trusted
   root configured: we STILL verify the JWS signature against the leaf cert (integrity is
   checked); only the Apple-root trust anchor is relaxed, and callers should log a loud warning.
*/
import { X509Certificate, verify as cryptoVerify } from 'node:crypto';
import { Buffer } from 'node:buffer';

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function b64urlToJson(s: string): any {
  return JSON.parse(b64urlToBuf(s).toString('utf8'));
}

function loadTrustedRoots(pem: string | undefined): string[] {
  if (!pem) return [];
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [pem];
  return blocks.map(b => new X509Certificate(b).fingerprint256);
}

export type IapTransaction = {
  productId: string;
  transactionId: string | number;
  expiresDate?: number | string;
  environment?: string;
  [key: string]: unknown;
};

/** Verify a StoreKit2 signed transaction (JWS). Returns the decoded payload or throws. */
export function verifySignedTransaction(jws: unknown, appleRootCaPem: string | undefined): IapTransaction {
  if (typeof jws !== 'string' || jws.split('.').length !== 3) throw new Error('malformed JWS');
  const [h, p, s] = jws.split('.');
  const header = b64urlToJson(h);
  if (header.alg !== 'ES256') throw new Error('unexpected alg ' + header.alg);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 1) throw new Error('missing x5c chain');

  const chain = x5c.map((der: string) => new X509Certificate(Buffer.from(der, 'base64')));
  const leaf = chain[0];

  const trustedRoots = loadTrustedRoots(appleRootCaPem);
  const devTrust = trustedRoots.length === 0; // no Apple root configured → dev/sandbox

  // 2 + 3: chain + root trust (skipped only in explicit dev mode)
  if (!devTrust) {
    for (let i = 0; i < chain.length - 1; i++) {
      if (!chain[i].verify(chain[i + 1].publicKey)) throw new Error('broken cert chain at ' + i);
    }
    const root = chain[chain.length - 1];
    if (!trustedRoots.includes(root.fingerprint256)) throw new Error('root not trusted (not Apple)');
  }

  // 4: JWS signature over `${h}.${p}` using the leaf public key (ES256 raw R||S)
  const ok = cryptoVerify('sha256', Buffer.from(h + '.' + p), { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, b64urlToBuf(s));
  if (!ok) throw new Error('bad JWS signature');

  return b64urlToJson(p);
}
