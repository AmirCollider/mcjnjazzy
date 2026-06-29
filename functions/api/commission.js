// ==========================================
// functions/api/commission.js
// Form Intake → store in KV + notify Telegram
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: POST /api/commission
// Secrets:  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Binding:  COMMISSIONS (KV)  — optional but recommended

import { tg, tgMedia, json, esc, cardText, cardKeyboard, putCommission, isBlocked, genId, priceEstimate, broadcast, chatIds, r2PutRef } from "./_shared.js";
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
    const required = ["method", "handle", "address1", "state", "postcode", "country", "type", "usage", "stream", "extra"];
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

    if (!env.TELEGRAM_BOT_TOKEN || chatIds(env).length === 0) {
      return json({ ok: false, error: "Server not configured" }, 500);
    }

    // build + persist the commission record
   const record = {
      id: genId(),
      method: String(data.method).trim(),
      handle: String(data.handle).trim(),
      paypal: data.paypal ? String(data.paypal).trim() : "",
      address1: String(data.address1).trim(),
      state: String(data.state).trim(),
      postcode: String(data.postcode).trim(),
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

   // notify every owner (AmirCollider + McjnJazzy) with action buttons
    const sends = await broadcast(env, "sendMessage", {
      text: cardText(record, true),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: cardKeyboard(record, false)
    });

    if (!sends.some(function (r) { return r && r.ok; })) {
      return json({ ok: false, error: "Telegram rejected the message" }, 502);
    }

    // forward reference images to every owner, then remember their
    // Telegram file_ids (fast-path cache) + R2 object keys (permanent),
    // so the bot can always resend them even if Telegram drops the file_ids
    if (files.length) {
      const stored = await sendReferenceImages(env, record, files);
      if (stored && (stored.fileIds.length || stored.r2Keys.length)) {
        record.fileIds = stored.fileIds;
        record.r2Keys  = stored.r2Keys;
        await putCommission(env, record);
      }
    }

    return json({ ok: true });
  } catch (_) {
    return json({ ok: false, error: "Bad request" }, 400);
  }
}

// ==========================================
// sendReferenceImages() — persist images to R2, notify EVERY owner
// 1) write the real bytes to R2 first (permanent source of truth)
// 2) upload once to the first owner, capture Telegram file_ids (cache)
// 3) re-send to the other owners by file_id (no re-upload)
// Returns { fileIds, r2Keys } for persistence on the record.
// AmirCollider Games — Commission Hub
// ==========================================
async function sendReferenceImages(env, record, files) {
  const batch = files.slice(0, 5);
  if (!batch.length) return { fileIds: [], r2Keys: [] };
  const caption = "🔗 References · " + record.id + " · @" + (record.handle || "—");

  // 1) permanent storage — survives Telegram file_id invalidation
  const r2Keys = await persistRefsToR2(env, record, batch);

  const targets = chatIds(env);
  if (!targets.length) return { fileIds: [], r2Keys: r2Keys };

  // 2) upload the real bytes to the first reachable owner, capture file_ids
  let fileIds = [];
  let uploadedTo = -1;
  for (let i = 0; i < targets.length && !fileIds.length; i++) {
    fileIds = await uploadRefs(env, targets[i], batch, caption);
    if (fileIds.length) uploadedTo = i;
  }

  // 3) re-send to every other owner by file_id (cheap, no re-upload)
  if (fileIds.length) {
    for (let t = 0; t < targets.length; t++) {
      if (t === uploadedTo) continue;
      await sendByFileIds(env, targets[t], fileIds, caption);
    }
  }

  return { fileIds: fileIds, r2Keys: r2Keys };
}

// ==========================================
// persistRefsToR2() — store reference bytes permanently in R2
// returns the object keys saved on the record (source of truth)
// ==========================================
async function persistRefsToR2(env, record, batch) {
  if (!env.MCJNJCR2) return [];
  const keys = [];
  for (let i = 0; i < batch.length; i++) {
    const file = batch[i];
    const key = "refs/" + record.id + "/" + (i + 1) + extOf(file);
    let bytes;
    try { bytes = await file.arrayBuffer(); } catch (_) { continue; }
    const ok = await r2PutRef(env, key, bytes, file.type || "application/octet-stream");
    if (ok) keys.push(key);
  }
  return keys;
}

// ==========================================
// extOf() — pick a file extension from name/type
// ==========================================
function extOf(file) {
  const name = (file && file.name) ? String(file.name) : "";
  const dot = name.lastIndexOf(".");
  if (dot > -1 && dot < name.length - 1) return name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const type = (file && file.type) ? String(file.type) : "";
  if (/png/i.test(type))   return ".png";
  if (/jpe?g/i.test(type)) return ".jpg";
  if (/webp/i.test(type))  return ".webp";
  if (/gif/i.test(type))   return ".gif";
  return ".img";
}

// ==========================================
// uploadRefs() — upload reference bytes to one chat, return file_ids
// ==========================================
async function uploadRefs(env, chatId, batch, caption) {
  if (batch.length === 1) {
    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", caption);
    fd.append("document", batch[0], batch[0].name || "ref1");
    try { return idsFromResult(await tgMedia(env, "sendDocument", fd)); } catch (_) { return []; }
  }
  const fd = new FormData();
  fd.append("chat_id", chatId);
  const media = batch.map(function (file, i) {
    const item = { type: "document", media: "attach://file" + i };
    if (i === 0) item.caption = caption;
    fd.append("file" + i, file, file.name || ("ref" + (i + 1)));
    return item;
  });
  fd.append("media", JSON.stringify(media));
  try { return idsFromResult(await tgMedia(env, "sendMediaGroup", fd)); } catch (_) { return []; }
}

// ==========================================
// idsFromResult() — pull document file_ids out of a Telegram reply
// (handles both sendDocument and sendMediaGroup shapes)
// ==========================================
function idsFromResult(r) {
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
// sendByFileIds() — resend already-uploaded refs to one chat by file_id
// ==========================================
async function sendByFileIds(env, chatId, fileIds, caption) {
  const ids = (fileIds || []).slice(0, 5);
  if (!ids.length) return;
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
// onRequestGet() — guard against GET probes
// ==========================================
export function onRequestGet() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}
