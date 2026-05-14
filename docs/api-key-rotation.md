# API Key Rotation Guide

This guide covers how to rotate the API keys KONTi's dashboard depends on, without taking the app down. Per the 2026-05-11 meeting, KONTi will run this procedure quarterly as a security baseline.

> **Target audience:** any KONTi staff with the `superadmin` role. After Month 2 of the trial, Carla holds the superadmin token.

---

## Why rotate keys

External services (Anthropic, OpenAI, PDF.co, Google, Asana, Resend) all recommend quarterly key rotation as a security baseline. A stolen key gives an attacker your monthly budget — rotation caps the blast radius if a key leaks via a misplaced screenshot, copy-paste into a chat, or a compromised laptop.

KONTi's app stores every key in an encrypted "managed secrets" store. The `/integrations` page is the single console for view → rotate → test workflow.

---

## What you'll need

- Superadmin login to the KONTi dashboard.
- Account access to each provider (you'll mint a new key in their UI):
  - [console.anthropic.com](https://console.anthropic.com) — API Keys
  - [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  - [app.pdf.co/account/api-keys](https://app.pdf.co/account/api-keys)
  - [resend.com/api-keys](https://resend.com/api-keys)
  - Google Cloud Console (if you wire Drive directly)
  - Asana → My Settings → Apps → Personal Access Tokens

Plan to set aside 30 minutes. The actual rotation per key is ~3 minutes.

---

## Step-by-step procedure (per provider)

### 1. Mint a new key in the provider's console

Each provider has a "Create new key" button. Common patterns:

- **Anthropic / OpenAI / PDF.co:** click `Create new secret key` → give it a name like `KONTi prod 2026-Q3` → copy the value immediately (you won't see it again).
- **Resend:** `Create API Key` → permission `Full access` → name `KONTi prod 2026-Q3` → copy.
- **Asana:** Personal Access Token → name `KONTi prod 2026-Q3` → copy.

> **Do not delete the old key yet.** You'll do that after step 3 confirms the new key works.

### 2. Paste the new key into KONTi's dashboard

1. Log in as `superadmin`.
2. Open **/integrations** from the sidebar.
3. Find the row for the provider you're rotating (e.g. `ANTHROPIC_API_KEY`).
4. Click **Update** → paste the new key → **Save**.

The dashboard encrypts the value before storage; the audit log records `superadmin {your email} rotated ANTHROPIC_API_KEY at {timestamp}`.

### 3. Test it

On the same row, click **Test**. The dashboard runs a low-cost probe:

- **Anthropic:** Sends a 5-token "hello" → must return a valid response.
- **OpenAI:** Same — uses `gpt-4.1-mini` to keep cost negligible.
- **PDF.co:** Hits `/v1/account` → must return 200.
- **Resend:** Sends to `delivered@resend.dev` (a Resend-provided test address) → must return a message id.
- **Asana:** Calls `/users/me` → must return your Asana user JSON.

If the test passes (green check), the new key is active. If it fails (red X):

1. **Don't panic** — the old key is still in the store, so traffic still works.
2. Re-paste; common cause is a stray newline / trailing space.
3. If still failing, re-mint a key in the provider's console and try again.

### 4. Revoke the old key

After the Test step passes, go back to the provider's console and **delete** (or "Revoke") the old key. Most providers list keys by name + last-used date so you can identify the old one easily.

Do this within the same 30-minute window — leaving two valid keys live is the failure mode where leaked keys actually get used in the wild.

### 5. Update Railway env (DR scenario only)

The `/integrations` rotation persists in the database. The `.env` value on Railway only matters as the bootstrap default when the database hasn't been populated (fresh deploy). If you want to ALSO update Railway:

1. Railway → your api-server project → **Variables**.
2. Find the matching env var (e.g. `ANTHROPIC_API_KEY`) → paste new value.
3. Railway auto-redeploys.

**Skip this step in normal rotation.** It only matters if you're rebuilding the database from scratch.

---

## Audit log

Every rotation appears in **/audit** with `actor`, `entity = "managed_secret"`, `type = "secret_rotated"`. Use this to confirm a rotation happened, or to trace who changed what during an incident.

---

## What happens if a rotation fails mid-flight

The managed-secrets store treats the database row as the source of truth. If a "Save" succeeds but "Test" fails, the new key IS already live — fall back to the provider console and re-mint immediately.

If the Railway server is restarted between a Save and a Test, the new key is loaded from the database on boot, so there's no downtime risk.

---

## Annual rotation calendar

KONTi runs rotation on the **first business day of every quarter**:

- 2026-04-01 — Q2
- 2026-07-01 — Q3
- 2026-10-01 — Q4
- 2027-01-02 — Q1

Tatiana (Menatech) will send a calendar invite + reminder email 7 days in advance. Confirm completion by replying to the email; the audit log is the actual proof.

---

## Emergency rotation

If you suspect a key has leaked (e.g. accidentally committed to git, posted in a screenshot, or noticed in a public-repo search):

1. Mint the new key first (Step 1).
2. Update it in KONTi (Step 2) — old key is still live.
3. Test (Step 3).
4. **Immediately revoke the old key** in the provider console — even before the next quarterly rotation. The 30-min window is fine for routine rotation, but emergency rotation should revoke ASAP.
5. Open a ticket with the provider asking for a "key usage report" for the last 90 days — confirms whether the leak resulted in unauthorized use.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Test returns 401 from Anthropic | Pasted with leading/trailing whitespace | Re-paste; check copy-paste source |
| Test returns 403 from PDF.co | Free-tier rate limit (300 req/mo) | Upgrade plan or wait 24h |
| "Audit log isn't recording the rotation" | You weren't logged in as `superadmin` | Re-login as superadmin; the role gate blocks the write silently to non-admins |
| OpenAI test passes but Whisper transcripts still fail | Org-level usage cap | OpenAI dashboard → Limits → raise the cap |

---

_Last updated 2026-05-13 for V1 trial cutover. Update when adding new providers._
