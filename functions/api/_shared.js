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
// rowToRecord() — map a D1 row to a commission record
// ==========================================
function rowToRecord(row) {
  if (!row) return null;
  let fileIds = [], r2Keys = [];
  try { fileIds = JSON.parse(row.file_ids || "[]") || []; } catch (_) { fileIds = []; }
  try { r2Keys  = JSON.parse(row.r2_keys  || "[]") || []; } catch (_) { r2Keys  = []; }
  return {
    id:        row.id,
    method:    row.method   || "",
    handle:    row.handle   || "",
    paypal:    row.paypal   || "",
    address1:  row.address1 || "",
    state:     row.state    || "",
    postcode:  row.postcode || "",
    country:   row.country  || "",
    type:      row.type     || "",
    usage:     row.usage    || "",
    stream:    row.stream   || "",
    refs:      row.refs     || "",
    extra:     row.extra    || "",
    estimate:  row.estimate || "",
    files:     row.files    || 0,
    status:    row.status === "done" ? "done" : "active",
    fileIds:   fileIds,
    r2Keys:    r2Keys,
    createdAt: row.created_at || 0
  };
}

// ==========================================
// putCommission() — upsert a record in D1
// ==========================================
export async function putCommission(env, record) {
  if (!env.MCJNJCD1) return;
  const fileIds = JSON.stringify(record.fileIds || []);
  const r2Keys  = JSON.stringify(record.r2Keys  || []);
  try {
    await env.MCJNJCD1.prepare(
      'INSERT INTO commissions ' +
      '(id, method, handle, paypal, address1, state, postcode, country, ' +
      'type, "usage", stream, refs, extra, estimate, files, status, ' +
      'file_ids, r2_keys, created_at) ' +
      'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19) ' +
      'ON CONFLICT(id) DO UPDATE SET ' +
      'method=?2, handle=?3, paypal=?4, address1=?5, state=?6, postcode=?7, country=?8, ' +
      'type=?9, "usage"=?10, stream=?11, refs=?12, extra=?13, estimate=?14, ' +
      'files=?15, status=?16, file_ids=?17, r2_keys=?18'
    ).bind(
      record.id, record.method || "", record.handle || "", record.paypal || "",
      record.address1 || "", record.state || "", record.postcode || "", record.country || "",
      record.type || "", record.usage || "", record.stream || "", record.refs || "",
      record.extra || "", record.estimate || "", record.files || 0,
      record.status || "active", fileIds, r2Keys, record.createdAt || Date.now()
    ).run();
  } catch (_) {}
}

// ==========================================
// getCommission() — fetch one record from D1
// ==========================================
export async function getCommission(env, id) {
  if (!env.MCJNJCD1 || !id) return null;
  try {
    const row = await env.MCJNJCD1.prepare("SELECT * FROM commissions WHERE id = ?1").bind(id).first();
    return rowToRecord(row);
  } catch (_) { return null; }
}

// ==========================================
// listCommissions() — newest-first records, optionally by status
// ==========================================
export async function listCommissions(env, status, limit) {
  if (!env.MCJNJCD1) return [];
  const cap = limit || 200;
  try {
    let stmt;
    if (status === "done") {
      stmt = env.MCJNJCD1.prepare("SELECT * FROM commissions WHERE status = 'done' ORDER BY created_at DESC LIMIT ?1").bind(cap);
    } else if (status === "active") {
      stmt = env.MCJNJCD1.prepare("SELECT * FROM commissions WHERE status IS NOT 'done' ORDER BY created_at DESC LIMIT ?1").bind(cap);
    } else {
      stmt = env.MCJNJCD1.prepare("SELECT * FROM commissions ORDER BY created_at DESC LIMIT ?1").bind(cap);
    }
    const res = await stmt.all();
    return (res && res.results ? res.results : []).map(rowToRecord);
  } catch (_) { return []; }
}

// ==========================================
// countCommissions() — { active, done } tallies
// ==========================================
export async function countCommissions(env) {
  const out = { active: 0, done: 0 };
  if (!env.MCJNJCD1) return out;
  try {
    const res = await env.MCJNJCD1.prepare("SELECT status, COUNT(*) AS n FROM commissions GROUP BY status").all();
    (res && res.results ? res.results : []).forEach(function (r) {
      if (r.status === "done") out.done += r.n || 0; else out.active += r.n || 0;
    });
  } catch (_) {}
  return out;
}

// ==========================================
// deleteCommission() — remove a record + its R2 reference objects
// ==========================================
export async function deleteCommission(env, id) {
  if (!env.MCJNJCD1 || !id) return false;
  let keys = [];
  try {
    const row = await env.MCJNJCD1.prepare("SELECT r2_keys FROM commissions WHERE id = ?1").bind(id).first();
    if (row) { try { keys = JSON.parse(row.r2_keys || "[]") || []; } catch (_) { keys = []; } }
  } catch (_) {}
  try { await env.MCJNJCD1.prepare("DELETE FROM commissions WHERE id = ?1").bind(id).run(); }
  catch (_) { return false; }
  if (env.MCJNJCR2 && keys.length) {
    for (const k of keys) { try { await env.MCJNJCR2.delete(k); } catch (_) {} }
  }
  return true;
}

// ==========================================
// getSetting() / putSetting() / deleteSetting() — key/value store (D1)
// ==========================================
export async function getSetting(env, key) {
  if (!env.MCJNJCD1 || !key) return null;
  try {
    const row = await env.MCJNJCD1.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first();
    return row ? row.value : null;
  } catch (_) { return null; }
}

export async function putSetting(env, key, value) {
  if (!env.MCJNJCD1 || !key) return false;
  try {
    await env.MCJNJCD1.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) " +
      "ON CONFLICT(key) DO UPDATE SET value=?2, updated_at=?3"
    ).bind(key, String(value), Date.now()).run();
    return true;
  } catch (_) { return false; }
}

export async function deleteSetting(env, key) {
  if (!env.MCJNJCD1 || !key) return false;
  try { await env.MCJNJCD1.prepare("DELETE FROM settings WHERE key = ?1").bind(key).run(); return true; }
  catch (_) { return false; }
}

// ==========================================
// r2PutRef() / r2GetRef() — reference image bytes in R2 (permanent)
// ==========================================
export async function r2PutRef(env, key, body, contentType) {
  if (!env.MCJNJCR2) return false;
  try {
    await env.MCJNJCR2.put(key, body, { httpMetadata: contentType ? { contentType: contentType } : undefined });
    return true;
  } catch (_) { return false; }
}

export async function r2GetRef(env, key) {
  if (!env.MCJNJCR2 || !key) return null;
  try { return await env.MCJNJCR2.get(key); } catch (_) { return null; }
}

// ==========================================
// normUser() — normalized (lowercased) TG username
// ==========================================
export function normUser(handle) {
  const u = usernameOf(handle);
  return u ? u.toLowerCase() : null;
}

// ==========================================
// isBlocked() — is this customer on the blocklist? (D1)
// ==========================================
export async function isBlocked(env, handle) {
  if (!env.MCJNJCD1) return false;
  const u = normUser(handle);
  if (!u) return false;
  try {
    const row = await env.MCJNJCD1.prepare("SELECT username FROM blocklist WHERE username = ?1").bind(u).first();
    return !!row;
  } catch (_) {
    return false;
  }
}

// ==========================================
// setBlocked() — add/remove a username on the blocklist (D1)
// ==========================================
export async function setBlocked(env, handle, blocked) {
  if (!env.MCJNJCD1) return false;
  const u = normUser(handle);
  if (!u) return false;
  try {
    if (blocked) {
      await env.MCJNJCD1.prepare(
        "INSERT INTO blocklist (username, created_at) VALUES (?1, ?2) ON CONFLICT(username) DO NOTHING"
      ).bind(u, Date.now()).run();
    } else {
      await env.MCJNJCD1.prepare("DELETE FROM blocklist WHERE username = ?1").bind(u).run();
    }
    return true;
  } catch (_) {
    return false;
  }
}

// ==========================================
// listBlocked() — all blocked usernames (D1)
// ==========================================
export async function listBlocked(env) {
  if (!env.MCJNJCD1) return [];
  try {
    const res = await env.MCJNJCD1.prepare("SELECT username FROM blocklist ORDER BY created_at DESC").all();
    return (res && res.results ? res.results : []).map(function (r) { return r.username; });
  } catch (_) { return []; }
}
