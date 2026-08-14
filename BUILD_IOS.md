# Gas — Native iOS build & go-live handoff

The backend and web app are **real and working** (SQLite storage, phone-code auth, Apple receipt validation, blocking/reporting, admin). This guide turns the web app into a **native iOS app** with Capacitor and takes the three "real" pillars fully live.

> **You need a Mac + Xcode** to build the iOS binary. Everything below is done on the Mac, pointing at this repo. Windows can run the backend and web app, but not compile iOS.

---

## 0. Accounts to line up first
| Need | Why | Cost |
|---|---|---|
| **Apple Developer Program** | Required for IAP, device testing, TestFlight, App Store | $99/yr |
| **Twilio** (paid + US A2P 10DLC) | Real SMS verification codes | ~$1/mo number + ~$0.008/msg + A2P reg |
| **A host** (Render/Railway/Fly/VPS) | The backend must be reachable over HTTPS | free–$7/mo |
| **RevenueCat** (optional, recommended) | Easiest StoreKit subscription handling | free < $2.5k/mo |

---

## 1. Deploy the backend (when you're ready)
The app can't talk to `localhost` from a phone. Host `server.js` somewhere with HTTPS and set env vars:

```bash
NODE_ENV=production \
ADMIN_PASSCODE=<a-strong-secret> \
TWILIO_ACCOUNT_SID=AC... TWILIO_SID=AC...orSK... TWILIO_TOKEN=... TWILIO_FROM=+1... \
APPLE_ROOT_CA=/path/to/AppleRootCA-G3.pem \
GODMODE_PRODUCT_IDS=aura.godmode.weekly \
node server.js
```
- In production the server **refuses to boot** with the default admin passcode.
- Download Apple's root cert (**Apple Root CA - G3**, PEM) from https://www.apple.com/certificateauthority/ and point `APPLE_ROOT_CA` at it. Without it, IAP runs in "dev trust" (signature checked, Apple-root trust relaxed) — fine for testing, **not** for production.

Note your backend URL, e.g. `https://api.yourgasapp.com`.

---

## 2. Point the app at the backend
Edit **`config.js`**:
```js
window.GAS_API_BASE = 'https://api.yourgasapp.com';
```
(Leave empty for same-origin web use.)

---

## 3. Add Capacitor + the iOS project
From the repo root on your Mac:
```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init            # appId: app.gas.clone  appName: Gas  (already in capacitor.config.json)

# Capacitor bundles ONE folder (webDir = "www"). Copy the front-end into it:
mkdir -p www && cp index.html styles.css app.js config.js www/
#   ^ copy any image/font assets too. Do NOT copy server.js / store.js / iap.js / admin.* — those are backend-only.

npx cap add ios
npx cap copy ios
npx cap open ios        # opens Xcode
```
In Xcode: set your Team (signing), a unique Bundle ID (`app.gas.clone`), and run on a simulator or device.

Re-run `cp ... www/ && npx cap copy ios` after any web change.

---

## 4. Native plugins to add
```bash
npm i @capacitor/splash-screen @capacitor/status-bar @capacitor/app
# Contacts (real friend suggestions):
npm i @capacitor-community/contacts
# Push notifications ("A girl gassed you up"):
npm i @capacitor/push-notifications        # + APNs key in Apple Developer + Xcode Push capability
```
Then `npx cap sync ios`.

---

## 5. In-App Purchase (God Mode) — the money path
God Mode is already enforced server-side (`/api/iap/validate` verifies the StoreKit 2 signed transaction; `app.js → purchaseGodModeNative()` posts it). You just wire the client purchase:

**App Store Connect**
1. Create an **Auto-Renewable Subscription**, Product ID **`aura.godmode.weekly`**, price $6.99/week (matches the paywall).
2. Add a **Sandbox test account** (Users and Access → Sandbox).

**Client plugin — pick one:**
- **RevenueCat (recommended):** `npm i @revenuecat/purchases-capacitor`. On purchase, get the StoreKit 2 JWS and pass it as `signedTransaction` to `purchaseGodModeNative()`.
- **@capacitor-community/in-app-purchases** or **cordova-plugin-purchase**: same idea — obtain the signed transaction / JWS and hand it to the server.

Wire the plugin's result into `purchaseGodModeNative()` in `app.js` (it already looks for `signedTransaction | jws | transactionReceipt`). Test on a **real device** with the sandbox account — the server grants God Mode only on a valid receipt, with real expiry, and auto-downgrades when the sub lapses.

---

## 6. TestFlight → App Store
1. Xcode → Product → Archive → Distribute → App Store Connect.
2. Add testers in TestFlight (works with sandbox IAP).
3. Fill App Privacy (you collect phone numbers + contacts), age rating, and review notes → submit.

---

## 7. Before real users (please read)
This app collects **minors' phone numbers and contacts** and enables **anonymous messages between teens**. That carries real obligations:
- **COPPA** (under-13), parental consent, and clear data handling / deletion (you have `DELETE /api/me`).
- A visible **privacy policy** + **report/block** (you have report/block) are typically required for App Store review of social apps.
- Strongly consider **18+ / limited test cohorts first**, and legal review before a public launch.

---

## Status of the three "real" pillars
| Pillar | Backend | What's left |
|---|---|---|
| **Database** | ✅ SQLite (WAL), durable, tested | Swap to Postgres at scale |
| **SMS** | ✅ Twilio integration wired | Your paid Twilio creds + A2P |
| **Apple IAP** | ✅ StoreKit2 receipt verification + entitlements, tested | App Store Connect product + client plugin (§5) |

`ADMIN.md` / `README.md` cover running the server and admin dashboard.
