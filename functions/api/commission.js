// ==========================================
// functions/api/commission.js
// Form Intake → store in KV + notify Telegram
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: POST /api/commission
// Secrets:  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Binding:  COMMISSIONS (KV)  — optional but recommended

import { tg, tgMedia, json, esc, cardText, cardKeyboard, putCommission, isBlocked, genId, priceEstimate } from "./_shared.js";
// ==========================================
// onRequestPost() — entry point for POST
// ==========================================
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let data;
    const files = [];
    const ctype = request.headers.get("Content-Type") || "";

    if (ctype.includes("multipart/form-data")) {
      const fd = await request.formData();
      try { data = JSON.parse(fd.get("payload") || "{}"); }
      catch (_) { return json({ ok: false, error: "Bad request" }, 400); }
      for (const [key, value] of fd.entries()) {
        if (key === "payload") continue;
        if (value && typeof value.arrayBuffer === "function") {
          const okType = !value.type || /^image\//i.test(value.type);
          if (okType && value.size > 0 && value.size <= 10 * 1024 * 1024 && files.length < 5) {
            files.push(value);
          }
        }
      }
    } else {
      data = await request.json();
    }

    // honeypot: bots fill hidden fields. Pretend success, send nothing.
    if (data.website && String(data.website).trim() !== "") {
      return json({ ok: true });
    }

    // server-side validation (never trust the client)
    // ==========================================
    // Validate required fields
    // refs is optional when reference images are uploaded
    // ==========================================
    const required = ["method", "handle", "country", "type", "usage", "stream", "extra"];
    for (const field of required) {
      if (!data[field] || String(data[field]).trim() === "") {
        return json({ ok: false, error: "Missing field: " + field }, 400);
      }
    }
    if ((!data.refs || String(data.refs).trim() === "") && files.length === 0) {
      return json({ ok: false, error: "Missing field: refs" }, 400);
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
      files: files.length,
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

    // forward reference images (if any) as an album / single document
    if (files.length) {
      await sendReferenceImages(env, record, files);
    }

    return json({ ok: true });
  } catch (_) {
    return json({ ok: false, error: "Bad request" }, 400);
  }
}

// ==========================================
// sendReferenceImages() — post queued images to Telegram
// AmirCollider Games — Commission Hub
// ==========================================
async function sendReferenceImages(env, record, files) {
  const batch = files.slice(0, 5);
  if (!batch.length) return;
  const caption = "🔗 References · " + record.id + " · @" + (record.handle || "—");
  
  // single file → sendDocument; multiple → sendMediaGroup album
  if (batch.length === 1) {
    const fd = new FormData();
    fd.append("chat_id", env.TELEGRAM_CHAT_ID);
    fd.append("caption", caption);
    fd.append("document", batch[0], batch[0].name || "ref1");
    try { await tgMedia(env, "sendDocument", fd); } catch (_) {}
    return;
  }
  
  const fd = new FormData();
  fd.append("chat_id", env.TELEGRAM_CHAT_ID);
  const media = batch.map(function (file, i) {
    const item = { type: "document", media: "attach://file" + i };
    if (i === 0) item.caption = caption;
    fd.append("file" + i, file, file.name || ("ref" + (i + 1)));
    return item;
  });
  fd.append("media", JSON.stringify(media));
  try { await tgMedia(env, "sendMediaGroup", fd); } catch (_) {}
}

// ==========================================
// onRequestGet() — guard against GET probes
// ==========================================
export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
