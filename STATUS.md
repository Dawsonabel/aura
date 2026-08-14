# Where we're at — 2026-08-07

Branch: `claude/aura-local-testing-w7kkaf`

Goal of this session: get the app onto a real phone for testing, without a Mac
and without a deployed backend yet.

---

## Done

**The app runs with no server behind it.** `server.js` is still the real
backend, but the phone app can now also run entirely in the browser:

| File | What it does |
|------|--------------|
| `browser-backend.js` | Re-implements every REST endpoint from `server.js` against an in-page database saved to `localStorage`. Intercepts `fetch()` for any `/api/…` URL. |
| `storage-fallback.js` | Memory-backed `localStorage` shim. `app.js` reads `localStorage` on line 4, which throws in a sandboxed embed and killed the whole app. |
| `build-static.js` | `node build-static.js` → `dist/aura-demo.html`: one ~1 MB file with fonts (woff2 → data URIs), CSS and all scripts inlined. `dist/` is gitignored — rebuild it, don't commit it. |

**Verified end to end** in a headless iPhone 13 (Chromium/Playwright), zero
console errors:

- Onboarding: age → permissions → grade → school → phone → **real 6-digit code
  check** → name → username → gender → into the app
- A full 12-poll round against real seeded classmates; coins 2 → 4
- Flames landed in the inbox with 💙/💗 gender colors, Reveal buttons, unread badge
- Add / Profile / God Mode banner all render

**One deliberate difference from the real backend.** On a single device you're
the only real player, so classmates gas you back after each round (and 3 welcome
flames on signup). Marked `DEMO:` in `browser-backend.js` — the server does this
from actual users. Nothing else diverges from `server.js` semantics.

---

## Blocked / open

- **The hosted preview link 404s on the phone.** The build was published to a
  private claude.ai artifact
  (`claude.ai/code/artifact/0f123d82-e965-46aa-aa2f-c09a73b422cb`). It loads
  when the browser is signed in to the owning account and shows "page not found"
  when it isn't. Not an app bug. Unresolved as of this writing.
- **No shared network yet.** Each device has its own local database, so two
  phones can't gas each other. That needs the real backend on a public URL.
- **Not in the static build:** the admin dashboard (`/admin`), and
  `/api/iap/validate` returns an error — App Store purchases only work in the
  iOS build.

---

## Next steps, in order

1. **Deploy the real backend.** `render.yaml` is ready — follow
   `DEPLOY_RENDER.md` (New → Blueprint → pick the repo → Apply). Gives a public
   `https://…onrender.com` URL running `server.js` with SQLite.
2. **Point the app at it.** Set `window.GAS_API_BASE` in `config.js` to that
   URL. Then any phone hits one shared network — real multi-user polls, real
   flames between devices — and the browser shim is no longer in the path.
3. **iOS build** per `BUILD_IOS.md` (needs a Mac + Xcode).

Optional: real SMS via the four `TWILIO_*` env vars. Until then, verification
codes show on screen — enforced either way, a wrong code is rejected.

---

## Running it locally

```bash
node server.js                    # real backend  → http://localhost:8777
                                  # admin at /admin, passcode "gas-admin"
node build-static.js              # serverless build → dist/aura-demo.html
```

`dist/aura-demo.html` opens straight from the filesystem — no server, no build
tooling. In the browser console, `gasDemo.reset()` wipes the local network and
`gasDemo.db()` dumps it.
