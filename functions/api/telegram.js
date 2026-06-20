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

import { tg, isAdmin, adminSet, cardText, cardKeyboard, putCommission } from "./_shared.js";

const HELP = [
  "🍓 <b>Jazzy Commission Bot</b>",
  "",
  "/projects — counts + filters",
  "/active — projects in progress",
  "/done — finished projects",
  "/id — show this chat &amp; admin ids",
  "/help — this menu",
  "",
  "On each project: ✅ mark done / ↩️ reopen, 👁 view, 💬 DM the customer."
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

  if (!isAdmin(fromId, env)) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "🔒 This bot is private." });
    return;
  }

  // /command@botname arg -> "/command"
  const cmd = text.split(/\s+/)[0].replace(/@.*$/, "").toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    await tg(env, "sendMessage", { chat_id: chatId, text: HELP, parse_mode: "HTML" });
    return;
  }

  if (cmd === "/id" || cmd === "/whoami") {
    const admins = Array.from(adminSet(env)).join(", ") || "(none set)";
    const body = [
      "🪪 <b>This chat id:</b> <code>" + chatId + "</code>",
      "👤 <b>Your user id:</b> <code>" + (fromId || "?") + "</code>",
      "🛡 <b>Admins:</b> <code>" + admins + "</code>"
    ].join("\n");
    await tg(env, "sendMessage", { chat_id: chatId, text: body, parse_mode: "HTML" });
    return;
  }

  if (cmd === "/projects" || cmd === "/list") {
    await sendSummary(env, chatId);
    return;
  }

  if (cmd === "/active") { await listByStatus(env, chatId, "active"); return; }
  if (cmd === "/done")   { await listByStatus(env, chatId, "done");   return; }

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

  // view full detail
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
  matches.sort((a, b) => (a.name < b.name ? 1 : -1));
  const slice = matches.slice(0, 12);

  for (const k of slice) {
    const m = k.metadata || {};
    const record = {
      id: k.name.replace(/^c:/, ""),
      customer: m.customer || "—",
      paintingClass: m.paintingClass || "—",
      deadline: m.deadline || "—",
      status: m.status === "done" ? "done" : "active",
      brief: "",
      refs: ""
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
