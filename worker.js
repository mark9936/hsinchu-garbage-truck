/**
 * 新竹市垃圾車即時動態地圖 — Cloudflare Worker 轉接代理
 *
 * 新竹市清運網的 API 沒有開放跨網域（CORS），靜態網頁無法直接讀取，
 * 這支 Worker 只做一件事：把白名單內的查詢轉送給官方 API，並加上 CORS 標頭。
 *
 * 部署後請把下面 ALLOWED_ORIGINS 改成你的 GitHub Pages 網域。
 */

const UPSTREAM = 'https://7966.hccg.gov.tw/WEB/_IMP/API/CleanWeb/';

// 允許呼叫這支代理的網頁來源（不含路徑與結尾斜線）。
// 也可以改在 wrangler.toml 的 [vars] ALLOWED_ORIGINS 以逗號分隔設定。
const ALLOWED_ORIGINS = [
  'https://mark9936.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

// 端點白名單與快取秒數：即時資料 10 秒，路線軌跡等靜態資料 12 小時。
const ENDPOINTS = {
  getPointData: 10,
  getCarLocation: 10,
  getEstData: 10,
  getTimeTable: 10,
  getRouteTrack: 43200,
  getRouteData: 43200,
};

function allowedOrigins(env) {
  const fromEnv = env && typeof env.ALLOWED_ORIGINS === 'string' ? env.ALLOWED_ORIGINS : '';
  const list = fromEnv ? fromEnv.split(',') : ALLOWED_ORIGINS;
  return list.map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
}

function corsHeaders(origin, allowed) {
  const headers = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, allowedOrigins(env));

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ message: 'method not allowed' }, 405, cors);

    const endpoint = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!Object.prototype.hasOwnProperty.call(ENDPOINTS, endpoint)) {
      return json({ message: 'not found' }, 404, cors);
    }
    // 瀏覽器發出的跨網域請求一定帶 Origin；不在名單內就拒絕，避免被其他網站盜用。
    if (origin && !cors['Access-Control-Allow-Origin']) {
      return json({ message: 'origin not allowed' }, 403, cors);
    }

    const ttl = ENDPOINTS[endpoint];
    const upstreamUrl = UPSTREAM + endpoint + url.search;
    const cacheKey = new Request(upstreamUrl, { method: 'GET' });
    const cache = caches.default;

    let cached = null;
    try {
      cached = await cache.match(cacheKey);
    } catch (e) {
      /* 某些環境沒有可用的快取，直接略過 */
    }

    let response = cached;
    if (!response) {
      let upstream;
      try {
        upstream = await fetch(upstreamUrl, {
          headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (hsinchu-garbage-truck proxy)' },
        });
      } catch (e) {
        return json({ message: 'upstream unreachable' }, 502, cors);
      }
      response = new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': upstream.ok ? `public, max-age=${ttl}` : 'no-store',
        },
      });
      if (upstream.ok) {
        try {
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        } catch (e) {
          /* 同上 */
        }
      }
    }

    const out = new Response(response.body, response);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
