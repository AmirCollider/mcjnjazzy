// ==========================================
// functions/api/commission.js
// Server-Side Telegram Relay (Pages Function)
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: POST /api/commission   (auto-mapped by Cloudflare Pages)
// Secrets required (set in Pages dashboard → Settings → Variables):
//   TELEGRAM_BOT_TOKEN   — token from @BotFather
//   TELEGRAM_CHAT_ID     — Jazzy's chat id (where messages are delivered)
//
// The bot token NEVER touches the browser; it lives only here on the edge.

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

    const token  = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return json({ ok: false, error: "Server not configured" }, 500);
    }

    const text = buildMessage(data);

    const tgRes = await fetch(
      "https://api.telegram.org/bot" + token + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "HTML",
          disable_web_page_preview: false
        })
      }
    );

    const tgData = await tgRes.json();
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

// ==========================================
// buildMessage() — format the Telegram card
// ==========================================
function buildMessage(d) {
  const refs = d.refs && d.refs.trim() ? esc(d.refs) : "—";
  return [
    "🍓 <b>NEW COMMISSION REQUEST</b> 🍓",
    "",
    "👤 <b>From:</b> " + esc(d.customer),
    "🎨 <b>Type:</b> " + esc(d.paintingClass),
    "📅 <b>Deadline:</b> " + esc(d.deadline),
    "",
    "📝 <b>Brief:</b>",
    esc(d.brief),
    "",
    "🔗 <b>References:</b>",
    refs
  ].join("\n");
}

// ==========================================
// esc() — escape HTML for Telegram parse_mode
// ==========================================
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==========================================
// json() — JSON response helper
// ==========================================
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
