// ==========================================
// functions/api/igstats.js
// Instagram stats relay (Graph API) → posts / followers / following
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: GET /api/igstats
// Secrets:  IG_USER_ID, IG_ACCESS_TOKEN   (Instagram Graph API, long-lived token)
// Binding (optional): COMMISSIONS (KV) — caches the result for 6h to spare rate limits

import { json } from "./_shared.js";

const CACHE_KEY = "ig:stats";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ==========================================
// onRequestGet() — return live (or cached) counts
// ==========================================
export async function onRequestGet(context) {
  const { env } = context;

  // serve a fresh-enough cached copy if we have one
  if (env.COMMISSIONS) {
    try {
      const cached = await env.COMMISSIONS.get(CACHE_KEY);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.stats && (Date.now() - obj.at) < TTL_MS) {
          return json({ ok: true, cached: true, stats: obj.stats });
        }
      }
    } catch (_) {}
  }

  if (!env.IG_USER_ID || !env.IG_ACCESS_TOKEN) {
    return json({ ok: false, error: "Instagram not configured" });
  }

  try {
    const url =
      "https://graph.facebook.com/v22.0/" + env.IG_USER_ID +
      "?fields=media_count,followers_count,follows_count" +
      "&access_token=" + env.IG_ACCESS_TOKEN;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      return json({ ok: false, error: "Instagram API error" });
    }

    const stats = {
      posts: data.media_count || 0,
      followers: data.followers_count || 0,
      following: data.follows_count || 0
    };

    if (env.COMMISSIONS) {
      try {
        await env.COMMISSIONS.put(CACHE_KEY, JSON.stringify({ at: Date.now(), stats }));
      } catch (_) {}
    }

    return json({ ok: true, cached: false, stats });
  } catch (_) {
    return json({ ok: false, error: "Instagram fetch failed" });
  }
}
