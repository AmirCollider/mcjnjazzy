// ==========================================
// functions/api/commission.js
// Form Intake → store in KV + notify Telegram
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: POST /api/commission
// Secrets:  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Binding:  COMMISSIONS (KV)  — optional but recommended

import { tg, json, esc, cardText, cardKeyboard, putCommission, isBlocked, genId, priceEstimate } from "./_shared.js";
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
    const required = ["method", "handle", "country", "type", "usage", "stream", "refs", "extra"];
    for (const field of required) {
      if (!data[field] || String(data[field]).trim() === "") {
        return json({ ok: false, error: "Missing field: " + field }, 400);
      }
    }

    // all agreements must be accepted (incl. the final "read everything" gate)
    const a = data.agree || {};
    if (!a.tos || !a.draw || !a.refund || !a.time || !a.pay || !a.all) {
      return json({ ok: false, error: "Agreements required" }, 400);
    }

    // blocked customers can't submit — tell them clearly
    if (await isBlocked(env, data.handle)) {
      return json({ ok: false, blocked: true, error: "blocked" }, 403);
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ ok: false, error: "Server not configured" }, 500);
    }

    // build + persist the commission record
    const record = {
      id: genId(),
      method: String(data.method).trim(),
      handle: String(data.handle).trim(),
      paypal: data.paypal ? String(data.paypal).trim() : "",
      country: String(data.country).trim(),
      type: String(data.type).trim(),
      usage: String(data.usage).trim(),
      stream: String(data.stream).trim(),
      refs: String(data.refs).trim(),
      extra: String(data.extra).trim(),
      estimate: priceEstimate(data.type, data.usage, data.stream),
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
