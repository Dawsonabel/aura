# Deploy the Gas backend to Render (for the phone demo)

Goal: get `server.js` running on a public HTTPS URL so your iPhone can reach it.
Everything here is on the web dashboard — no Mac needed for this part.

## 1. Create the service
1. Go to **https://render.com** → sign up (free) with GitHub.
2. **New → Blueprint**.
3. Connect and pick the **`Dawsonabel/aura`** repo. Render reads `render.yaml`.
4. Click **Apply**. It builds and deploys `aura-backend`.

## 2. Grab your URL + admin passcode
- When it goes live you'll get a URL like **`https://aura-backend-XXXX.onrender.com`**. Copy it.
- Open the service → **Environment** → reveal **`ADMIN_PASSCODE`** (Render generated a strong one). That's your login for `/admin`.

## 3. Verify it's up
Visit `https://<your-url>/api/health` — you should see:
```json
{ "ok": true, "service": "aura", "sms": "dev", ... }
```
`"sms":"dev"` means verification codes show **on-screen** (no Twilio needed for the demo).

## 4. Send me the URL
Paste your `onrender.com` URL back to me and I'll point the app (`config.js`) at it, build the web bundle, and prep the Xcode project for your Mac.

---

### Notes
- **Free tier sleeps** after ~15 min idle; first request then takes ~30s to wake. Fine for a demo.
- **Free tier disk is ephemeral** — test accounts reset on redeploy/sleep. To persist: set `plan: starter` and uncomment the `disk:` + `DATA_DIR` blocks in `render.yaml` (~$7/mo).
- **Real SMS later:** add the four `TWILIO_*` env vars in the dashboard (needs a paid Twilio number + US A2P 10DLC). Until then, dev-mode on-screen codes work fine.
- **Admin dashboard:** `https://<your-url>/admin` (use the generated `ADMIN_PASSCODE`).
