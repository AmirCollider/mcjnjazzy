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
// json() — JSON Response helper
// ==========================================
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
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
// adminSet() — who may control the bot
// (ADMIN_IDS + the notification chat, deduped)
// ==========================================
export function adminSet(env) {
  const ids = new Set();
  if (env.ADMIN_IDS) {
    String(env.ADMIN_IDS).split(",").forEach((x) => {
      const v = x.trim();
      if (v) ids.add(v);
    });
  }
  if (env.TELEGRAM_CHAT_ID) ids.add(String(env.TELEGRAM_CHAT_ID).trim());
  return ids;
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
  const lines = [
    "🍓 <b>COMMISSION</b> · " + statusBadge(record.status),
    "👤 <b>From:</b> " + esc(record.customer),
    "🎨 <b>Type:</b> " + esc(record.paintingClass),
    "📅 <b>Deadline:</b> " + esc(record.deadline)
  ];
  if (full) {
    lines.push("", "📝 " + esc(record.brief || "—"));
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
  rows.push(first);

  const u = usernameOf(record.customer);
  if (u) {
    rows.push([
      { text: "💬 DM @" + u, url: "https://t.me/" + u },
      { text: "🚫 Block", callback_data: "blk:" + u }
    ]);
  }

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
      customer: record.customer,
      paintingClass: record.paintingClass,
      deadline: record.deadline
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
