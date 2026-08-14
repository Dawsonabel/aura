# Gas clone — full-stack demo

A faithful front-end clone of the shut-down **Gas** app, now with a **real multi-user backend** and an **admin dashboard**. Design-tribute / educational project. No real SMS, no real payments.

## Run it

Requires Node.js and a [Neon](https://neon.tech) Postgres database (free tier is fine).

```
npm install
npm run build          # compiles store.ts → store.js
cp .env.example .env   # fill in DATABASE_URL with your Neon connection string
node --env-file=.env server.js
```

Then open:

- **Phone app:** http://localhost:8777  → best viewed in a phone emulator (Chrome/Edge DevTools → Ctrl+Shift+M → pick an iPhone)
- **Admin dashboard:** http://localhost:8777/admin  → passcode **`aura-admin`**

Change the port or passcode with env vars: `PORT=3000 ADMIN_PASSCODE=secret node server.js`

## Phone verification (real codes)

Sign-up uses **real code verification**: the server generates a random 6-digit code, and login **fails unless the entered code matches** (one-time use, 10-min expiry).

- **Dev mode (default):** no SMS provider configured, so the code is printed to the **server console** and shown on the code screen (`Dev mode — your code is 123456`). Verification is still enforced — a wrong code is rejected.
- **Real SMS (Twilio):** set env vars and real texts are sent (US numbers assumed). Two auth styles:

  **Account SID + Auth Token:**
  ```
  TWILIO_SID=ACxxxx TWILIO_TOKEN=your_auth_token TWILIO_FROM=+1XXXXXXXXXX node server.js
  ```
  **API Key (SK…) + secret** — also needs the Account SID for the URL:
  ```
  TWILIO_ACCOUNT_SID=ACxxxx TWILIO_SID=SKxxxx TWILIO_TOKEN=api_key_secret TWILIO_FROM=+1XXXXXXXXXX node server.js
  ```

  On startup the server prints whether SMS is **LIVE** or in **dev mode**. On a Twilio trial you can only text numbers you've **verified** in the console. You need your own [Twilio](https://www.twilio.com/) account + a from-number; outside the free trial it costs a few cents per message. Any other provider can be swapped into `sendSMS()` in `server.js`.

## How the multi-user part works

1. In the **admin dashboard**, create a school and add students (or use the seeded *Lincoln High* with 16 students).
2. Click **"Log in as ↗"** on two different students in two browser tabs.
3. In one tab, answer polls — you're picking real classmates.
4. Those picks are delivered as **real flames** to the classmate's **Inbox** in the other tab.
5. Turn on **God Mode** (Inbox → "See Who Likes You") to reveal the first initial of whoever picked you.

Self-signup also works: open the app, tap through onboarding (pick your school, then phone → the verification code shows on screen in dev mode), and start playing.

## Feature list (user side)

- **Onboarding:** age → grade → **school picker** → phone → **real code verification** → name → username → gender → photo
- **Polls:** 12 per round, real classmates as choices, per-poll colors, pick → *Tap to continue*
- **Flames inbox:** real votes delivered to you, color-coded by sender gender (💙/💗/💜), reveal hints with coins
- **God Mode:** unlock first-letter hints on everyone, double coins
- **Top Flames:** the polls you've been picked for most, shown on your profile
- **Post on Snap:** share a Gas-branded story card to Snapchat from results or any flame (Web Share API + Save image / Copy link)
- **Coins & Shop:** earn by voting, spend to boost your name in polls
- **Add friends, Edit profile, Manage account, About/FAQ**

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node server: static hosting + REST API |
| `store.ts` | Persistence layer — Neon Postgres, one `kv(coll,id,data)` table (compiles to `store.js`) |
| `index.html` / `styles.css` / `app.js` | The phone app (API-backed) |
| `admin.html` / `admin.js` | Desktop admin dashboard |
| `fonts/` | Bundled Fredoka + Nunito (works offline) |

## Admin dashboard can

- **Schools** — create / edit / delete, see student counts
- **Users** — add students, reassign school & grade inline, edit coins, toggle God Mode, "log in as", delete
- **Poll Questions** — add / edit / enable / disable the compliment prompts (global or per-school)
- **Flames / Activity** — see every vote (who gassed whom) and delete to moderate

## Reset

Stop the server, connect to your Neon database and run `DROP TABLE kv;` (or `DELETE FROM kv;`), then start again for a fresh seeded network.

## Tests

Black-box API tests (`node:test`, zero extra dependencies) — they boot the real server and hit it over HTTP, so they keep passing across storage/framework refactors as long as the API contract doesn't change.

Requires a **second, disposable** Neon branch (Neon dashboard → your project → Branches → New Branch → schema only, no auto-delete) so the suite has something safe to wipe and reseed on every run. Set it as `TEST_DATABASE_URL` in `.env` (see `.env.example`) — it must not be the same value as `DATABASE_URL`, or the suite refuses to run.

```
npm test
```

Current coverage: auth (rate limits, code expiry/attempts), voting integrity (self-vote, cross-school, blocked users, round rules), coins/boosts, IAP validation error paths, admin CRUD (schools/users/polls/votes/reports, gating, rate limits), flame reveal mechanics (coin reveal, anonymous God Mode admirers, reveal-name gating + bonus-reveal cap), and account lifecycle (profile edits, delete cascades). Not yet covered: the IAP happy path (needs a real signed StoreKit2 JWS), friends/notifications/suggestions, and a few minor routes (`/api/health`, `/api/shop/boost`, legacy `/api/godmode`).
