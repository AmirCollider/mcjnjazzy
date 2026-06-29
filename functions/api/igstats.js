// ==========================================
// functions/api/igstats.js
// Instagram stats relay (Graph API) → posts / followers / following
// mcjn_jazzy — Commission Hub
// ==========================================
//
// Route: GET /api/igstats
// Secrets:  IG_USER_ID, IG_ACCESS_TOKEN   (Instagram Graph API, long-lived token)
// Binding (optional): COMMISSIONS (KV) — caches the result for 6h to spare rate limits

import { json, getSetting, putSetting } from "./_shared.js";

const CACHE_KEY = "ig:stats";
const MANUAL_KEY = "ig:manual";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ==========================================
// NOCACHE — never let the browser/edge cache live counts
// (forces a fresh KV read so /ig updates show immediately)
// ==========================================
const NOCACHE = { "Cache-Control": "no-store, max-age=0" };
// ==========================================
// onRequestGet() — return live (or cached) counts
// ==========================================
export async function onRequestGet(context) {
  const { env } = context;

  // ==========================================
  // Manual override (set from the bot's /ig command) — no Facebook needed
  // Only set fields are returned, so unset ones keep the static numbers.
  // ==========================================
 if (env.MCJNJCD1) {
    try {
      const manual = await getSetting(env, MANUAL_KEY);
      if (manual) {
        const m = JSON.parse(manual);
        if (m) {
          const stats = {};
          if (m.posts != null)     stats.posts = m.posts;
          if (m.followers != null) stats.followers = m.followers;
          if (m.following != null) stats.following = m.following;
          if (Object.keys(stats).length) {
            return json({ ok: true, manual: true, stats }, 200, NOCACHE);
          }
        }
      }
    } catch (_) {}
  }

  // serve a fresh-enough cached copy if we have one
  if (env.MCJNJCD1) {
    try {
      const cached = await getSetting(env, CACHE_KEY);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.stats && (Date.now() - obj.at) < TTL_MS) {
          return json({ ok: true, cached: true, stats: obj.stats }, 200, NOCACHE);
        }
      }
    } catch (_) {}
  }

  if (!env.IG_USER_ID || !env.IG_ACCESS_TOKEN) {
    return json({ ok: false, error: "Instagram not configured" }, 200, NOCACHE);
  }

  try {
    const url =
      "https://graph.facebook.com/v22.0/" + env.IG_USER_ID +
      "?fields=media_count,followers_count,follows_count" +
      "&access_token=" + env.IG_ACCESS_TOKEN;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || data.error) {
      return json({ ok: false, error: "Instagram API error" }, 200, NOCACHE);
    }

    const stats = {
      posts: data.media_count || 0,
      followers: data.followers_count || 0,
      following: data.follows_count || 0
    };

    if (env.MCJNJCD1) {
      try {
        await putSetting(env, CACHE_KEY, JSON.stringify({ at: Date.now(), stats }));
      } catch (_) {}
    }
    
    return json({ ok: true, cached: false, stats }, 200, NOCACHE);
  } catch (_) {
    return json({ ok: false, error: "Instagram fetch failed" }, 200, NOCACHE);
  }
}
