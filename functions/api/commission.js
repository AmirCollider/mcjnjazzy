// ==========================================
// functions/api/commission.js
// Form Intake → store in KV + notify Telegram
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: POST /api/commission
// Secrets:  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Binding:  COMMISSIONS (KV)  — optional but recommended

import { tg, json, esc, cardText, cardKeyboard, putCommission } from "./_shared.js";

// ==========================================
// onRequestPost() — entry point for POST
// ==========================================
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const data = await request.json();

    // honeypot: bots fill hidden fields. Pretend success, send nothing.
    if (data.website && String(data.website).trim() !== "") {
      return json({ ok: true });
    }

    // server-side validation (never trust the client)
    const required = ["customer", "paintingClass", "brief", "deadline"];
    for (const field of required) {
      if (!data[field] || String(data[field]).trim() === "") {
        return json({ ok: false, error: "Missing field: " + field }, 400);
      }
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ ok: false, error: "Server not configured" }, 500);
    }

    // build + persist the commission record
    const id = Date.now().toString();
    const record = {
      id: id,
      customer: String(data.customer).trim(),
      paintingClass: String(data.paintingClass).trim(),
      brief: String(data.brief).trim(),
      refs: data.refs ? String(data.refs).trim() : "",
      deadline: String(data.deadline).trim(),
      status: "active",
      createdAt: Date.now()
    };

    await putCommission(env, record);

    // notify Jazzy with action buttons
    const tgData = await tg(env, "sendMessage", {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: cardText(record, true),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: cardKeyboard(record, false)
    });

    if (!tgData.ok) {
      return json({ ok: false, error: "Telegram rejected the message" }, 502);
    }

    return json({ ok: true });
  } catch (_) {
    return json({ ok: false, error: "Bad request" }, 400);
  }
}

// ==========================================
// onRequestGet() — guard against GET probes
// ==========================================
export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
