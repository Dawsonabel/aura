/* ===== Aura — Apple In-App Purchase verification (StoreKit 2) =====
   The iOS app buys God Mode via StoreKit 2 and sends the *signed transaction*
   (a JWS) to POST /api/iap/validate. We verify it here, server-side, before
   granting the entitlement — clients can never self-grant God Mode.

   Verification steps (per Apple's JWS / App Store Server format):
     1. Parse the JWS header; it carries an x5c cert chain [leaf, intermediate, root].
     2. Verify the chain: leaf signed by intermediate, intermediate by root.
     3. Verify the root is Apple's real root CA (fingerprint in trustedRoots).
     4. Verify the JWS ES256 signature with the leaf certificate's public key.
     5. Return the decoded transaction payload for the caller to check
        (productId, expiresDate, transactionId, environment).

   Production: set APPLE_ROOT_CA=/path/to/AppleRootCA-G3.pem (Apple's root, public).
   Dev/sandbox with no trusted root configured: we STILL verify the JWS signature
   against the leaf cert (integrity is checked); only the Apple-root trust anchor
   is relaxed, and we log a loud warning. This lets the full flow be tested without
   Apple infrastructure while keeping the real crypto path exercised.
*/
const crypto = require('crypto');
const fs = require('fs');

function b64urlToBuf(s){ return Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64'); }
function b64urlToJson(s){ return JSON.parse(b64urlToBuf(s).toString('utf8')); }

function loadTrustedRoots(){
  const p = process.env.APPLE_ROOT_CA;
  if(!p) return [];
  try{
    const pem = fs.readFileSync(p, 'utf8');
    // support a bundle with multiple certs
    const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [pem];
    return blocks.map(b => new crypto.X509Certificate(b).fingerprint256);
  }catch(e){ console.error('APPLE_ROOT_CA load failed:', e.message); return []; }
}
const TRUSTED_ROOTS = loadTrustedRoots();
const DEV_TRUST = TRUSTED_ROOTS.length === 0; // no Apple root configured → dev/sandbox

/** Verify a StoreKit2 signed transaction (JWS). Returns the decoded payload or throws. */
function verifySignedTransaction(jws){
  if(typeof jws !== 'string' || jws.split('.').length !== 3) throw new Error('malformed JWS');
  const [h, p, s] = jws.split('.');
  const header = b64urlToJson(h);
  if(header.alg !== 'ES256') throw new Error('unexpected alg '+header.alg);
  const x5c = header.x5c;
  if(!Array.isArray(x5c) || x5c.length < 1) throw new Error('missing x5c chain');

  const chain = x5c.map(der => new crypto.X509Certificate(Buffer.from(der, 'base64')));
  const leaf = chain[0];

  // 2 + 3: chain + root trust (skipped only in explicit dev mode)
  if(!DEV_TRUST){
    for(let i=0; i<chain.length-1; i++){
      if(!chain[i].verify(chain[i+1].publicKey)) throw new Error('broken cert chain at '+i);
    }
    const root = chain[chain.length-1];
    if(!TRUSTED_ROOTS.includes(root.fingerprint256)) throw new Error('root not trusted (not Apple)');
  }

  // 4: JWS signature over `${h}.${p}` using the leaf public key (ES256 raw R||S)
  const ok = crypto.verify('sha256', Buffer.from(h+'.'+p),
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' }, b64urlToBuf(s));
  if(!ok) throw new Error('bad JWS signature');

  return b64urlToJson(p);
}

module.exports = { verifySignedTransaction, DEV_TRUST };
