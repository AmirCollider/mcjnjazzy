// ==========================================
// functions/api/telegram.js
// Telegram Webhook — commands & buttons
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: POST /api/telegram   (set this as the bot webhook)
// Secrets:  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET, ADMIN_IDS
// Binding:  COMMISSIONS (KV)
//
// Admins = ADMIN_IDS (comma-separated numeric ids) + TELEGRAM_CHAT_ID.

import { tg, isAdmin, adminSet, esc, usernameOf, cardText, cardKeyboard, putCommission, setBlocked, listBlocked } from "./_shared.js";

const HELP = [
  "🍓 <b>Jazzy Commission Bot</b>",
  "",
  "/projects — counts + filters",
  "/active — projects in progress",
  "/done — finished projects",
  "/block @user — stop someone submitting",
  "/unblock @user — let them submit again",
 "/blocked — list blocked people",
  "/ig — set IG counts manually (no Facebook)",
  "/id — show this chat &amp; admin ids",
  "/help — this menu",
  "",
  "On each project: ✅ done / ↩️ reopen, 👁 view, 📎 photos, 💬 DM, 🚫 block, 🗑 delete."
].join("\n");

// ==========================================
// onRequestPost() — webhook entry point
// ==========================================
export async function onRequestPost(context) {
  const { request, env } = context;

  // verify the request really comes from Telegram
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let update;
  try { update = await request.json(); } catch (_) { return new Response("ok"); }

  try {
    if (update.message) await handleMessage(update.message, env);
    else if (update.callback_query) await handleCallback(update.callback_query, env);
  } catch (_) {
    // swallow errors so Telegram does not retry endlessly
  }

  // always 200 — tells Telegram the update was received
  return new Response("ok");
}

export function onRequestGet() {
  return new Response("ok");
}

// ==========================================
// handleMessage() — text commands
// ==========================================
async function handleMessage(message, env) {
  const chatId = message.chat.id;
  const fromId = message.from ? message.from.id : null;
  const text = (message.text || "").trim();

  if (!text.startsWith("/")) return;

  // /command@botname arg -> "/command"
  const cmd = text.split(/\s+/)[0].replace(/@.*$/, "").toLowerCase();

  // ==========================================
  // /id — OPEN to everyone, so a future admin can read their
  // numeric user id and hand it over to be put in ADMIN_IDS.
  // (The admin list is only revealed to existing admins.)
  // ==========================================
  if (cmd === "/id" || cmd === "/whoami") {
    const youAreAdmin = isAdmin(fromId, env);
    const lines = [
      "🪪 <b>This chat id:</b> <code>" + chatId + "</code>",
      "👤 <b>Your user id:</b> <code>" + (fromId || "?") + "</code>",
      "🛡 <b>Admin access:</b> " + (youAreAdmin ? "✅ yes" : "🔒 no")
    ];
    if (youAreAdmin) {
      const admins = Array.from(adminSet(env)).join(", ") || "(none set)";
      lines.push("👑 <b>Admins:</b> <code>" + admins + "</code>");
    }
    await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
    return;
  }

  if (!isAdmin(fromId, env)) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "🔒 This bot is private." });
    return;
  }

  if (cmd === "/start" || cmd === "/help") {
    await tg(env, "sendMessage", { chat_id: chatId, text: HELP, parse_mode: "HTML" });
    return;
  }

  if (cmd === "/projects" || cmd === "/list") {
    await sendSummary(env, chatId);
    return;
  }

  if (cmd === "/active") { await listByStatus(env, chatId, "active"); return; }
  if (cmd === "/done")   { await listByStatus(env, chatId, "done");   return; }

  if (cmd === "/block" || cmd === "/unblock") {
    const arg = text.split(/\s+/)[1] || "";
    const u = usernameOf(arg);
    if (!u) {
      await tg(env, "sendMessage", { chat_id: chatId, text: "Usage: " + cmd + " @username" });
      return;
    }
    const block = cmd === "/block";
    const ok = await setBlocked(env, u, block);
    await tg(env, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: ok
        ? (block ? "🚫 Blocked @" : "✅ Unblocked @") + esc(u)
        : "Couldn't update the blocklist — is storage configured?"
    });
    return;
  }

  if (cmd === "/blocked") { await sendBlockedList(env, chatId); return; }

  if (cmd === "/ig" || cmd === "/stats") { await handleIgSet(env, chatId, text); return; }

  await tg(env, "sendMessage", { chat_id: chatId, text: "Unknown command. Try /help" });
}

// ==========================================
// handleCallback() — inline button presses
// ==========================================
async function handleCallback(cb, env) {
  const fromId = cb.from ? cb.from.id : null;
  const chatId = cb.message ? cb.message.chat.id : null;
  const messageId = cb.message ? cb.message.message_id : null;
  const data = cb.data || "";

  if (!isAdmin(fromId, env)) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "🔒 Private", show_alert: true });
    return;
  }

  const sep = data.indexOf(":");
  const action = sep === -1 ? data : data.slice(0, sep);
  const arg = sep === -1 ? "" : data.slice(sep + 1);

  // filter buttons from the summary
  if (action === "list") {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
    if (arg === "active") return listByStatus(env, chatId, "active");
    if (arg === "done")   return listByStatus(env, chatId, "done");
    return listByStatus(env, chatId, "all");
  }

  // view full detail (+ resend any saved reference photos)
  if (action === "view") {
    const record = await getRecord(env, arg);
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
    if (!record) return;
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: cardText(record, true),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: cardKeyboard(record, false)
    });
    if (record.fileIds && record.fileIds.length) await resendRefs(env, chatId, record);
    return;
  }

  // resend the client's reference photos on demand
  if (action === "pics") {
    const record = await getRecord(env, arg);
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
    if (!record || !record.fileIds || !record.fileIds.length) {
      await tg(env, "sendMessage", { chat_id: chatId, text: "No saved reference photos for this project 🫧" });
      return;
    }
    await resendRefs(env, chatId, record);
    return;
  }

  // toggle status
  if (action === "done" || action === "active") {
    const record = await getRecord(env, arg);
    if (!record) {
      await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Not found" });
      return;
    }
    record.status = action === "done" ? "done" : "active";
    await putCommission(env, record);

    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: cardText(record, true),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: cardKeyboard(record, false)
    });
    await tg(env, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: record.status === "done" ? "Marked done ✅" : "Reopened ↩️"
    });
    return;
  }

  // block a customer (from a project card)
  if (action === "blk") {
    const ok = await setBlocked(env, arg, true);
    await tg(env, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: ok ? "Blocked @" + arg + " 🚫" : "Couldn't block",
      show_alert: true
    });
    return;
  }

  // unblock a customer (from the /blocked list)
  if (action === "unblk") {
    const ok = await setBlocked(env, arg, false);
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: ok ? "Unblocked ✅" : "Couldn't unblock" });
    if (ok && messageId) {
      await tg(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: "✅ <b>Unblocked</b> @" + esc(arg),
        parse_mode: "HTML"
      });
    }
    return;
  }

  // delete a project — ask to confirm first
  if (action === "del") {
    const record = await getRecord(env, arg);
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
    if (!record) return;
    await tg(env, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [[
          { text: "🗑 Yes, delete", callback_data: "delyes:" + arg },
          { text: "↩️ Keep it", callback_data: "delno:" + arg }
        ]]
      }
    });
    return;
  }

  // confirmed deletion
  if (action === "delyes") {
    if (env.COMMISSIONS) {
      try { await env.COMMISSIONS.delete("c:" + arg); } catch (_) {}
    }
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: "🗑 <b>Deleted</b> · <code>" + arg + "</code>",
      parse_mode: "HTML"
    });
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Deleted 🗑" });
    return;
  }

  // cancelled deletion — restore the card buttons
  if (action === "delno") {
    const record = await getRecord(env, arg);
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Kept ✨" });
    if (!record) return;
    await tg(env, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: cardKeyboard(record, false)
    });
    return;
  }

  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
}
// ==========================================
// sendSummary() — counts + filter buttons
// ==========================================
async function sendSummary(env, chatId) {
  if (!env.COMMISSIONS) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Storage not configured." });
    return;
  }
  const keys = await listKeys(env);
  let active = 0, done = 0;
  keys.forEach((k) => { (k.metadata && k.metadata.status === "done") ? done++ : active++; });

  await tg(env, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: "🗂 <b>Projects</b>\n🟡 in progress: " + active + "\n✅ done: " + done,
    reply_markup: {
      inline_keyboard: [[
        { text: "🟡 In progress (" + active + ")", callback_data: "list:active" },
        { text: "✅ Done (" + done + ")", callback_data: "list:done" }
      ], [
        { text: "🗂 All", callback_data: "list:all" }
      ]]
    }
  });
}

// ==========================================
// sendBlockedList() — blocked usernames + unblock buttons
// ==========================================
async function sendBlockedList(env, chatId) {
  if (!env.COMMISSIONS) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Storage not configured." });
    return;
  }
  const users = await listBlocked(env);
  if (users.length === 0) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "No one is blocked 🌿" });
    return;
  }
  await tg(env, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: "🚫 <b>Blocked</b> — " + users.length
  });
  for (const u of users.slice(0, 30)) {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: "🚫 @" + esc(u),
      reply_markup: { inline_keyboard: [[{ text: "✅ Unblock @" + u, callback_data: "unblk:" + u }]] }
    });
  }
}

// ==========================================
// listByStatus() — send each matching project
// ==========================================
async function listByStatus(env, chatId, status) {
  if (!env.COMMISSIONS) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Storage not configured." });
    return;
  }
  const keys = await listKeys(env);
  const matches = keys.filter((k) => {
    const s = k.metadata && k.metadata.status === "done" ? "done" : "active";
    return status === "all" ? true : s === status;
  });

  if (matches.length === 0) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Nothing here yet 🫧" });
    return;
  }

  const label = status === "done" ? "✅ Done" : status === "active" ? "🟡 In progress" : "🗂 All";
  await tg(env, "sendMessage", { chat_id: chatId, text: label + " — " + matches.length });

  // newest first, capped to avoid flooding the chat
  matches.sort((a, b) => ((b.metadata && b.metadata.createdAt) || 0) - ((a.metadata && a.metadata.createdAt) || 0));
  const slice = matches.slice(0, 12);

  for (const k of slice) {
    const m = k.metadata || {};
    const record = {
      id: k.name.replace(/^c:/, ""),
      method: m.method || "",
      handle: m.handle || "—",
      type: m.type || "—",
      usage: m.usage || "—",
      estimate: m.estimate || "",
      files: m.files || 0,
      status: m.status === "done" ? "done" : "active",
      extra: "",
      refs: "",
      country: "",
      stream: "",
      paypal: ""
    };
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: cardText(record, false),
      parse_mode: "HTML",
      reply_markup: cardKeyboard(record, true)
    });
  }

  if (matches.length > slice.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "…and " + (matches.length - slice.length) + " more." });
  }
}

// ==========================================
// listKeys() — all commission keys from KV
// ==========================================
async function listKeys(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.COMMISSIONS.list({ prefix: "c:", cursor });
    out.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

// ==========================================
// getRecord() — fetch one commission by id
// ==========================================
async function getRecord(env, id) {
  if (!env.COMMISSIONS || !id) return null;
  const raw = await env.COMMISSIONS.get("c:" + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// ==========================================
// resendRefs() — resend a project's stored reference photos
// ==========================================
async function resendRefs(env, chatId, record) {
  const ids = (record.fileIds || []).slice(0, 5);
  if (!ids.length) return;
  const caption = "🔗 References · " + record.id + " · @" + (record.handle || "—");
  if (ids.length === 1) {
    try { await tg(env, "sendDocument", { chat_id: chatId, document: ids[0], caption: caption }); } catch (_) {}
    return;
  }
  const media = ids.map(function (fid, i) {
    const item = { type: "document", media: fid };
    if (i === 0) item.caption = caption;
    return item;
  });
  try { await tg(env, "sendMediaGroup", { chat_id: chatId, media: media }); } catch (_) {}
}

// ==========================================
// handleIgSet() — manually set IG counts (stored in KV, no Facebook)
// /ig                  → show current manual counts
// /ig 10600            → set followers only
// /ig 53 10600 349     → set posts / followers / following
// /ig clear            → remove override (use the Graph API again)
// ==========================================
async function handleIgSet(env, chatId, text) {
  if (!env.COMMISSIONS) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Storage not configured." });
    return;
  }

  let cur = {};
  try { cur = JSON.parse((await env.COMMISSIONS.get("ig:manual")) || "{}") || {}; } catch (_) { cur = {}; }

  if (/\bclear\b/i.test(text)) {
    try { await env.COMMISSIONS.delete("ig:manual"); } catch (_) {}
    await tg(env, "sendMessage", { chat_id: chatId, text: "🧹 Manual stats cleared — the site will use the Instagram API again (if configured)." });
    return;
  }

  const nums = (text.match(/\d[\d,]*/g) || [])
    .map(function (s) { return parseInt(s.replace(/,/g, ""), 10); })
    .filter(function (n) { return !isNaN(n); });

  if (nums.length === 0) {
    const lines = [
      "📊 <b>Manual IG stats</b>",
      "🖼 posts: <b>" + (cur.posts != null ? cur.posts : "—") + "</b>",
      "👥 followers: <b>" + (cur.followers != null ? cur.followers : "—") + "</b>",
      "➡️ following: <b>" + (cur.following != null ? cur.following : "—") + "</b>",
      "",
      "Set followers: <code>/ig 10600</code>",
      "Set all three: <code>/ig 53 10600 349</code>",
      "Clear override: <code>/ig clear</code>"
    ];
    await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
    return;
  }

  const next = Object.assign({}, cur);
  if (nums.length >= 3) { next.posts = nums[0]; next.followers = nums[1]; next.following = nums[2]; }
  else { next.followers = nums[0]; }
  next.at = Date.now();

  try {
    await env.COMMISSIONS.put("ig:manual", JSON.stringify(next));
  } catch (_) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Couldn't save — is storage configured?" });
    return;
  }

  await tg(env, "sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: "✅ <b>Saved.</b>\n🖼 posts: <b>" + (next.posts != null ? next.posts : "—") +
          "</b>\n👥 followers: <b>" + (next.followers != null ? next.followers : "—") +
          "</b>\n➡️ following: <b>" + (next.following != null ? next.following : "—") + "</b>"
  });
}
