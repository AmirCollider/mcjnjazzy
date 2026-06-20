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
| Telegram relay (Pages Function) | ✅ Built |
| Reference **links** in form | ✅ Built |
| Reference **file upload** | 🔜 Phase 2 |
| Spam protection (Turnstile) | 🔜 Phase 2 |
| Real content (links, age, avatar) | ⏳ Needs your input — search for `FILL` |
| Deployed to Cloudflare Pages | ⏳ Your step |
| Telegram secrets set | ⏳ Your step |

**Where it's going next:** deploy → set secrets → replace `FILL` placeholders →
test one real submission → (later) add file upload + Turnstile.

---

## 📁 Files

```
jazzy-hub/
├── index.html                  Page shell — ID card, links, commission form
├── styles.css                  Theme tokens, layout, signature status sticker
├── app.js                      Client validation + POST to /api/commission
├── functions/
│   └── api/
│       └── commission.js       Edge relay → Telegram (holds the bot token)
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

## 🗺️ Data Map

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
