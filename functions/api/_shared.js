// ==========================================
// functions/api/_shared.js
// Shared helpers (NOT a route — leading underscore)
// mcjn_jazzy — Commission Hub
// ==========================================

// ==========================================
// tg() — call the Telegram Bot API
// ==========================================
export async function tg(env, method, payload) {
  const res = await fetch(
    "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
  return res.json();
}

// ==========================================
// tgMedia() — call the Telegram Bot API with multipart (file uploads)
// ==========================================
export async function tgMedia(env, method, form) {
  const res = await fetch(
    "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/" + method,
    { method: "POST", body: form }
  );
  return res.json();
}

// ==========================================
// json() — JSON Response helper (optional extra headers)
// ==========================================
export function json(body, status = 200, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
  });
}

// ==========================================
// genId() — short, human-readable commission id (e.g. JZ-7Q3KP4)
// ==========================================
export function genId() {
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 3; i++) r += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return "JZ-" + t + r;
}

// ==========================================
// priceEstimate() — base × usage + NDA fee (AUD)
// ==========================================
export function priceEstimate(type, usage, stream) {
  const base =
    /Headshot/i.test(type || "") ? 45 :
    /Bust/i.test(type || "")     ? 65 :
    /Half/i.test(type || "")     ? 85 : 0;
  const mult =
    /\+100%|Commercial/i.test(usage || "") ? 1 :
    /\+50%|Monetized/i.test(usage || "")   ? 0.5 : 0;
  const ndaPct = /NDA/i.test(stream || "") ? 0.2 : 0;
  if (!base) return "";
  const total = Math.round((base * (1 + mult + ndaPct)) * 100) / 100;
  return "$" + total.toFixed(2) + " AUD";
}

// ==========================================
// esc() — escape HTML for parse_mode "HTML"
// ==========================================
export function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==========================================
// adminSet() — who may control AND receive from the bot
// Both owners (AmirCollider + McjnJazzy) are treated identically.
// Accepts ids separated by commas, spaces, semicolons, or newlines,
// and ignores stray quotes / @ / other junk — keeps only real numeric ids.
// Legacy ADMIN_IDS / TELEGRAM_CHAT_ID are still honoured if present (migration safety).
// ==========================================
export function adminSet(env) {
  const ids = new Set();
  const add = (raw) => {
    String(raw == null ? "" : raw)
      .split(/[^0-9-]+/)
      .forEach((part) => {
        const v = part.trim();
        if (v && /^-?\d+$/.test(v)) ids.add(v);
      });
  };
  add(env.AmirCollider);
  add(env.McjnJazzy);
  add(env.ADMIN_IDS);
  add(env.TELEGRAM_CHAT_ID);
  return ids;
}

// ==========================================
// chatIds() — every chat that should receive notifications
// (identical to the admin set — both owners get everything)
// ==========================================
export function chatIds(env) {
  return Array.from(adminSet(env));
}

// ==========================================
// broadcast() — send one method/payload to every owner chat
// returns the array of Telegram responses (same order as chatIds)
// ==========================================
export async function broadcast(env, method, payload) {
  const out = [];
  for (const id of chatIds(env)) {
    out.push(await tg(env, method, Object.assign({}, payload, { chat_id: id })));
  }
  return out;
}

export function isAdmin(id, env) {
  return adminSet(env).has(String(id));
}

// ==========================================
// usernameOf() — extract a Telegram @username
// (returns null if the handle is not a valid TG username)
// ==========================================
export function usernameOf(handle) {
  const m = String(handle || "").trim().match(/^@?([A-Za-z0-9_]{4,32})$/);
  return m ? m[1] : null;
}

// ==========================================
// statusBadge() — human label for a status
// ==========================================
export function statusBadge(s) {
  return s === "done" ? "✅ done" : "🟡 in progress";
}

// ==========================================
// cardText() — render a commission as a message
// ==========================================
export function cardText(record, full) {
  const handle = record.handle || "—";
  const via = record.method ? esc(record.method) + " · " + esc(handle) : esc(handle);

  const lines = [
    "🍓 <b>COMMISSION</b> · " + statusBadge(record.status),
    "📨 <b>Via:</b> " + via,
    "🎨 <b>Type:</b> " + esc(record.type || "—"),
    "💸 <b>Usage:</b> " + esc(record.usage || "—")
  ];

  if (record.estimate) lines.push("💰 <b>Est:</b> " + esc(record.estimate));
  const nFiles = parseInt(record.files, 10) || 0;
  if (nFiles) lines.push("📎 <b>Images:</b> " + nFiles + " attached");
 if (full) {
    // ==========================================
    // Billing address — line, state, post code, country
    // ==========================================
    const addr = [record.address1, record.state, record.postcode, record.country]
      .map(function (p) { return (p == null ? "" : String(p)).trim(); })
      .filter(function (p) { return p; })
      .join(", ");
    lines.push("🌍 <b>Billing:</b> " + esc(addr || "—"));
    lines.push("🖼 <b>Share:</b> " + esc(record.stream || "—"));
    if (record.paypal) lines.push("💳 <b>PayPal:</b> " + esc(record.paypal));
    lines.push("", "📝 " + esc(record.extra || "—"));
    lines.push("🔗 " + (record.refs ? esc(record.refs) : "—"));
  }

  lines.push("", "🆔 <code>" + esc(record.id) + "</code>");
  return lines.join("\n");
}

// ==========================================
// cardKeyboard() — inline buttons for a commission
// ==========================================
export function cardKeyboard(record, includeView) {
  const rows = [];

  const toggle = record.status === "done"
    ? { text: "↩️ Reopen", callback_data: "active:" + record.id }
    : { text: "✅ Mark done", callback_data: "done:" + record.id };

  const first = [toggle];
  if (includeView) first.push({ text: "👁 View", callback_data: "view:" + record.id });
  const nFiles = parseInt(record.files, 10) || 0;
  if (nFiles > 0) first.push({ text: "📎 Photos (" + nFiles + ")", callback_data: "pics:" + record.id });
  rows.push(first);

 const u = usernameOf(record.handle);
  const isTg = /telegram/i.test(record.method || "");
  const contact = [];
  if (u && isTg) contact.push({ text: "💬 DM @" + u, url: "https://t.me/" + u });
  if (u) contact.push({ text: "🚫 Block", callback_data: "blk:" + u });
  if (contact.length) rows.push(contact);

  // photos button lives on listed/short cards where View also appears

  rows.push([{ text: "🗑 Delete", callback_data: "del:" + record.id }]);

  return { inline_keyboard: rows };
}

// ==========================================
// putCommission() — write/refresh a record in KV
// (status kept in metadata for cheap listing)
// ==========================================
export async function putCommission(env, record) {
  if (!env.COMMISSIONS) return;
  await env.COMMISSIONS.put("c:" + record.id, JSON.stringify(record), {
    metadata: {
      status: record.status,
      method: record.method,
      handle: record.handle,
      type: record.type,
      usage: record.usage,
      estimate: record.estimate,
      files: record.files || 0,
      createdAt: record.createdAt
    }
  });
}

// ==========================================
// normUser() — normalized (lowercased) TG username
// ==========================================
export function normUser(handle) {
  const u = usernameOf(handle);
  return u ? u.toLowerCase() : null;
}

// ==========================================
// isBlocked() — is this customer on the blocklist?
// ==========================================
export async function isBlocked(env, handle) {
  if (!env.COMMISSIONS) return false;
  const u = normUser(handle);
  if (!u) return false;
  try {
    return (await env.COMMISSIONS.get("blk:" + u)) !== null;
  } catch (_) {
    return false;
  }
}

// ==========================================
// setBlocked() — add/remove a username on the blocklist
// ==========================================
export async function setBlocked(env, handle, blocked) {
  if (!env.COMMISSIONS) return false;
  const u = normUser(handle);
  if (!u) return false;
  try {
    if (blocked) await env.COMMISSIONS.put("blk:" + u, "1", { metadata: { at: Date.now() } });
    else await env.COMMISSIONS.delete("blk:" + u);
    return true;
  } catch (_) {
    return false;
  }
}

// ==========================================
// listBlocked() — all blocked usernames
// ==========================================
export async function listBlocked(env) {
  if (!env.COMMISSIONS) return [];
  const out = [];
  let cursor;
  try {
    do {
      const page = await env.COMMISSIONS.list({ prefix: "blk:", cursor });
      page.keys.forEach((k) => out.push(k.name.replace(/^blk:/, "")));
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
  } catch (_) {}
  return out;
}
