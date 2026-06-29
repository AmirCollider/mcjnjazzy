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

import { tg, tgMedia, isAdmin, adminSet, esc, usernameOf, cardText, cardKeyboard, putCommission, setBlocked, listBlocked, getCommission, listCommissions, countCommissions, deleteCommission, getSetting, putSetting, deleteSetting, r2GetRef } from "./_shared.js";

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
    if ((record.fileIds && record.fileIds.length) || (record.r2Keys && record.r2Keys.length)) await resendRefs(env, chatId, record);
    return;
  }

  // resend the client's reference photos on demand
  if (action === "pics") {
    const record = await getRecord(env, arg);
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id });
    const hasRefs = record && ((record.fileIds && record.fileIds.length) || (record.r2Keys && record.r2Keys.length));
    if (!hasRefs) {
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

 // confirmed deletion — removes the record and its R2 reference objects
  if (action === "delyes") {
    await deleteCommission(env, arg);
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
  if (!env.MCJNJCD1) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Storage not configured." });
    return;
  }
  const counts = await countCommissions(env);
  const active = counts.active, done = counts.done;

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
  if (!env.MCJNJCD1) {
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
  if (!env.MCJNJCD1) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Storage not configured." });
    return;
  }
  const records = await listCommissions(env, status === "all" ? "all" : status, 200);

  if (records.length === 0) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Nothing here yet 🫧" });
    return;
  }

  const label = status === "done" ? "✅ Done" : status === "active" ? "🟡 In progress" : "🗂 All";
  await tg(env, "sendMessage", { chat_id: chatId, text: label + " — " + records.length });

  // already newest-first from the query, capped to avoid flooding the chat
  const slice = records.slice(0, 12);

  for (const record of slice) {
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: cardText(record, false),
      parse_mode: "HTML",
      reply_markup: cardKeyboard(record, true)
    });
  }

  if (records.length > slice.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "…and " + (records.length - slice.length) + " more." });
  }
}

// ==========================================
// getRecord() — fetch one commission by id (D1)
// ==========================================
async function getRecord(env, id) {
  return getCommission(env, id);
}

// ==========================================
// resendRefs() — resend a project's reference photos
// fast path: cached Telegram file_ids; durable path: re-upload from R2
// ==========================================
async function resendRefs(env, chatId, record) {
  const caption = "🔗 References · " + record.id + " · @" + (record.handle || "—");
  const ids = (record.fileIds || []).slice(0, 5);

  // 1) fast path — resend by cached Telegram file_id
  if (ids.length) {
    const ok = await sendIdsToChat(env, chatId, ids, caption);
    if (ok) return;
  }

  // 2) durable path — pull the original bytes from R2 and re-upload,
  // then refresh the cached file_ids so the next resend is fast again
  const keys = (record.r2Keys || []).slice(0, 5);
  if (!keys.length || !env.MCJNJCR2) {
    if (!ids.length) await tg(env, "sendMessage", { chat_id: chatId, text: "No saved reference photos for this project 🫧" });
    return;
  }
  const fresh = await uploadFromR2(env, chatId, keys, caption);
  if (fresh.length) {
    record.fileIds = fresh;
    await putCommission(env, record);
  }
}

// ==========================================
// sendIdsToChat() — resend refs by Telegram file_id; true on success
// ==========================================
async function sendIdsToChat(env, chatId, ids, caption) {
  if (!ids.length) return false;
  if (ids.length === 1) {
    let r;
    try { r = await tg(env, "sendDocument", { chat_id: chatId, document: ids[0], caption: caption }); } catch (_) { return false; }
    return !!(r && r.ok);
  }
  const media = ids.map(function (fid, i) {
    const item = { type: "document", media: fid };
    if (i === 0) item.caption = caption;
    return item;
  });
  let r;
  try { r = await tg(env, "sendMediaGroup", { chat_id: chatId, media: media }); } catch (_) { return false; }
  return !!(r && r.ok);
}

// ==========================================
// uploadFromR2() — fetch reference bytes from R2 and upload to a chat,
// returning the freshly captured Telegram file_ids (for cache refresh)
// ==========================================
async function uploadFromR2(env, chatId, keys, caption) {
  const items = [];
  for (let i = 0; i < keys.length; i++) {
    const obj = await r2GetRef(env, keys[i]);
    if (!obj) continue;
    let bytes;
    try { bytes = await obj.arrayBuffer(); } catch (_) { continue; }
    const ctype = (obj.httpMetadata && obj.httpMetadata.contentType) ? obj.httpMetadata.contentType : "application/octet-stream";
    items.push({ blob: new Blob([bytes], { type: ctype }), name: nameFromKey(keys[i]) });
  }
  if (!items.length) return [];

  if (items.length === 1) {
    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", caption);
    fd.append("document", items[0].blob, items[0].name);
    let r;
    try { r = await tgMedia(env, "sendDocument", fd); } catch (_) { return []; }
    return idsFromTgResult(r);
  }

  const fd = new FormData();
  fd.append("chat_id", chatId);
  const media = items.map(function (it, i) {
    const m = { type: "document", media: "attach://file" + i };
    if (i === 0) m.caption = caption;
    fd.append("file" + i, it.blob, it.name);
    return m;
  });
  fd.append("media", JSON.stringify(media));
  let r;
  try { r = await tgMedia(env, "sendMediaGroup", fd); } catch (_) { return []; }
  return idsFromTgResult(r);
}

// ==========================================
// idsFromTgResult() — pull document file_ids out of a Telegram reply
// ==========================================
function idsFromTgResult(r) {
  if (!r || !r.ok || !r.result) return [];
  const arr = Array.isArray(r.result) ? r.result : [r.result];
  const ids = [];
  arr.forEach(function (m) {
    const doc = m && (m.document || (m.photo && m.photo[m.photo.length - 1]));
    if (doc && doc.file_id) ids.push(doc.file_id);
  });
  return ids;
}

// ==========================================
// nameFromKey() — filename for an R2 object key
// ==========================================
function nameFromKey(key) {
  const s = String(key || "ref");
  const slash = s.lastIndexOf("/");
  return slash > -1 ? s.slice(slash + 1) : s;
}

// ==========================================
// handleIgSet() — manually set IG counts (stored in KV, no Facebook)
// /ig                  → show current manual counts
// /ig 10600            → set followers only
// /ig 53 10600 349     → set posts / followers / following
// /ig clear            → remove override (use the Graph API again)
// ==========================================
async function handleIgSet(env, chatId, text) {
  if (!env.MCJNJCD1) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Storage not configured." });
    return;
  }

  let cur = {};
  try { cur = JSON.parse((await getSetting(env, "ig:manual")) || "{}") || {}; } catch (_) { cur = {}; }

if (/\bclear\b/i.test(text)) {
    await deleteSetting(env, "ig:manual");
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

  const saved = await putSetting(env, "ig:manual", JSON.stringify(next));
  if (!saved) {
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
