# 🍓 mcjn_jazzy — Commission Hub

A minimal "linear hub" for the artist **Jazzy**. At first glance it is an artist
**ID Card**; at second glance it is a cozy **Commission Desk**. A visitor should
understand who Jazzy is, her style, and how to order — in under 10 seconds.

---

## 📊 Project Status

| Item | State |
|------|-------|
| Frontend (ID card + links + form) | ✅ Built |
| Kawaii pastel theme | ✅ Built |
| Dark / light mode toggle (persisted) | ✅ Built |
| Entrance + hover + ambient animations | ✅ Built |
| Favicon + share (og) image | ✅ Built |
| Real social/portfolio links | ✅ Wired |
| Profile photo as avatar (`mcjnjazzyprofile.jpg`) | ✅ Wired |
| Telegram relay (Pages Function) | ✅ Built |
| Reference **links** in form | ✅ Built |
| Bot v2 — commands + buttons | ✅ Built |
| Project storage (Cloudflare KV) | ✅ Built (needs binding) |
| Status tracking (in-progress / done) | ✅ Built |
| DM-the-customer button | ✅ Built (TG usernames only) |
| Deployed to Cloudflare Pages (`mcjnjazzy.pages.dev`) | ✅ Live |
| Telegram secrets set | ✅ Done |
| `/api/commission` reachable | ✅ Verified |
| KV namespace + binding | ⏳ Your step |
| `ADMIN_IDS` + `TELEGRAM_WEBHOOK_SECRET` | ⏳ Your step |
| `setWebhook` registered | ⏳ Your step |
| Jazzy's **age** (chip shows `00`) | ⏳ Replace in `index.html` |
| First real test submission | ⏳ Your step |
| Reference **file upload** | 🔜 Phase 2 |
| Spam protection (Turnstile) | 🔜 Phase 2 |

**Where it's going next:** set the real age → send one real test request →
(later) add file upload + Turnstile.

### Live URLs
- Site: `https://mcjnjazzy.pages.dev/`
- Repo: `https://github.com/AmirCollider/mcjnjazzy`
- API health check (GET): `https://mcjnjazzy.pages.dev/api/commission` → `{"ok":false,"error":"Method not allowed"}`

### Theme behavior
First visit follows the device's system setting; the toggle (top-right) overrides
it and the choice is saved in `localStorage` under the key `theme`.

---

## 📁 Files

```
jazzy-hub/
├── index.html                  Page shell — ID card, links, commission form
├── styles.css                  Theme tokens (light/dark), layout, animations
├── app.js                      Client validation, submit, theme toggle
├── mcjnjazzyprofile.jpg        Jazzy's avatar (repo root)
├── ARTBanner.png               Cover banner, 1376×768 (repo root)
├── ART01.png                   Recent-art showcase, transparent (repo root)
├── ART02.png                   Recent-art showcase, transparent (repo root)
├── ART03.png                   Recent-art showcase, transparent (repo root)
├── functions/
│   └── api/
│       ├── _shared.js          Shared helpers (NOT a route — underscore)
│       ├── commission.js       Form intake → store in KV + notify Telegram
│       └── telegram.js         Bot webhook — commands, status, customer DM
└── README.md                   This file (the source of truth / tracker)
```

- **Frontend** = static, served by Cloudflare Pages.
- **`functions/api/commission.js`** = a Cloudflare Pages Function. The folder name
  `functions/` is special: Pages turns it into the `/api/commission` endpoint
  automatically. No separate Worker is needed for V1.

---

## 🔧 Setup (do these in order)

### 1. Name things
- **Repo / folder:** `jazzy-hub`
- **Cloudflare Pages project:** `jazzy` → gives `jazzy.pages.dev` (attach a custom
  domain later if you buy one).
- **Telegram bot:** display name `Jazzy Commissions`, username `jazzy_commission_bot`
  (must end in `bot` and be unique — pick the closest free one).

### 2. Create the Telegram bot
1. Open Telegram, message **@BotFather**.
2. Send `/newbot`, follow prompts, set the name + username above.
3. Copy the **bot token** it gives you (looks like `123456:ABC-DEF...`).

### 3. Get Jazzy's chat id
1. Jazzy sends **any message** to the new bot (tap Start).
2. In a browser open:
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Find `"chat":{"id":...}` — that number is **`TELEGRAM_CHAT_ID`**.

### 4. Deploy to Cloudflare Pages
1. Push this folder to a GitHub repo (or use **Direct Upload** in Cloudflare).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build settings: **Framework preset = None**, Build command = *(empty)*,
   Output directory = `/` (root). Deploy.

### 5. Add the secrets
Cloudflare → your Pages project → **Settings → Variables and Secrets** →
add two **encrypted** variables, then **redeploy**:
- `TELEGRAM_BOT_TOKEN` = the BotFather token
- `TELEGRAM_CHAT_ID` = the chat id from step 3

### 6. Replace placeholders
Search the project for `FILL` and replace every match:
- `index.html` → social/portfolio URLs, Jazzy's age, optional `avatar.png`.
- (Optional) edit the status text `DTIYS on going!` in `index.html` whenever it changes.

### 7. Test
Open the live site, submit one request, confirm it arrives in Jazzy's Telegram.

---

## 🤖 Bot v2 — Manager Commands

The bot is now two-way. Admins (Jazzy + anyone in `ADMIN_IDS`) can:

| Command | Does |
|---------|------|
| `/projects` | counts + filter buttons (in-progress / done / all) |
| `/active` | list projects in progress |
| `/done` | list finished projects |
| `/id` | show this chat id + the configured admin ids |
| `/help` | command menu |

Each project message carries buttons: **✅ Mark done** / **↩️ Reopen**,
**👁 View** (full brief + references), and **💬 DM @customer**.

**About the DM button (important):** a bot cannot start a chat with a stranger.
The DM button is a `t.me/<handle>` link that opens the chat from *Jazzy's own
account* — and only appears when the customer typed a real **Telegram** username.
If they gave an Instagram/other handle, the message just shows it as text.

Every form submission is now also saved to KV with status `active`, so the
project list survives restarts and can be filtered.

---

## 🔧 Bot v2 — One-Time Setup

### A. Create the KV store
1. Cloudflare → **Storage & Databases → KV → Create namespace**, name it `jazzy_commissions`.
2. Your Pages project → **Settings → Functions → KV namespace bindings → Add**.
   - Variable name: **`COMMISSIONS`** (exact)
   - Namespace: `jazzy_commissions`

### B. Add the env vars (Settings → Variables and Secrets)
- `ADMIN_IDS` — comma-separated numeric Telegram ids allowed to run commands.
  (Jazzy's id is already covered via `TELEGRAM_CHAT_ID`; add her admin's id here.)
  Get an id by messaging **@userinfobot**, or after deploy send `/id` to the bot.
- `TELEGRAM_WEBHOOK_SECRET` — any random string you invent (used to verify webhook calls). Type **Secret**.

### C. Redeploy
Deployments → **Retry deployment** (bindings/vars apply only on a fresh build).

### D. Register the webhook
Open this URL once in a browser (replace `<TOKEN>` and `<SECRET>`):
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mcjnjazzy.pages.dev/api/telegram&secret_token=<SECRET>
```
Expected reply: `{"ok":true,"result":true,...}`

### E. (Optional) Nice command menu
Open this URL once to show commands in Telegram's `/` menu:
```
https://api.telegram.org/bot<TOKEN>/setMyCommands?commands=[{"command":"projects","description":"counts + filters"},{"command":"active","description":"in progress"},{"command":"done","description":"finished"},{"command":"id","description":"chat & admin ids"},{"command":"help","description":"menu"}]
```

### F. Test
Send `/help` to the bot, then `/id`, then submit one commission from the site and
press **✅ Mark done** on the message.

---

## 🗺️ Data Model (KV)

Key `c:<timestamp>` → JSON `{ id, customer, paintingClass, brief, refs, deadline, status, createdAt }`.
`status` is `"active"` or `"done"` and is mirrored in KV metadata so the list/filter
commands stay fast without reading every record.

**Output (what the visitor sees):**
handle `@mcjn_jazzy`, bio (age · ENFP · iPad), live status badge, portfolio
(Pinterest, YouTube) + socials (Instagram, Threads, Twitter/X, TikTok).

**Input (what Jazzy receives via Telegram):**
customer name/handle · painting class · brief · reference links · deadline.

---

## 🔜 Phase 2 — File Upload (planned)

To accept uploaded reference images (not just links):
1. Add `<input type="file" multiple accept="image/*">` to the form.
2. In `app.js`, send `FormData` instead of JSON.
3. In `commission.js`, read the files and forward each with Telegram
   `sendPhoto` / `sendDocument` (multipart). Mind Cloudflare's request-size limit
   and Telegram's per-photo limits.

---

## 🛠️ Editing Convention

Every file uses boxed header comments before each logical block:

```
// ==========================================
// [Module Name / Function Description]
// mcjn_jazzy — Commission Hub
// ==========================================
```

Keep this format when extending the project so the docs stay consistent.
