// loon-rule-records — 保存 / 展示 Loon「路由规则查看」插件的查询记录
//
//   POST /api/record   插件上报一条记录（需 LOOKUP_TOKEN）
//   GET  /api/records  记录列表（JSON，仅用于调试，需 token）
//   GET  /             网页：最近查询记录 + 统计
//
// 需要的绑定：D1 数据库，变量名 DB
// 需要的密钥：LOOKUP_TOKEN（未设置时拒绝所有写入，即失败关闭）

const MAX_BODY = 64 * 1024;
const MAX_HITS = 40;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function tokenOf(request, url) {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return (request.headers.get('x-loon-token') || url.searchParams.get('t') || '').trim();
}

function authorized(request, url, env) {
  const expected = (env.LOOKUP_TOKEN || '').trim();
  if (!expected) return false; // 没配密钥就不接受写入
  const given = tokenOf(request, url);
  if (!given) return false;
  if (given.length !== expected.length) return false;
  // 定长比较，避免按长度泄漏
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function clip(value, max) {
  const s = value == null ? '' : String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeHits(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_HITS).map((h) => ({
    list: clip(h && h.list, 80),
    policy: clip(h && h.policy, 80),
    rule: clip(h && h.rule, 300),
  }));
}

async function handleRecord(request, env) {
  const url = new URL(request.url);
  if (!authorized(request, url, env)) return json({ ok: false, error: 'unauthorized' }, 401);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: 'payload too large' }, 413);
    body = JSON.parse(raw);
  } catch (err) {
    return json({ ok: false, error: 'invalid json' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid body' }, 400);

  const mode = clip(body.mode, 40) || '未知';
  const target = clip(body.target, 260);
  const policy = clip(body.policy, 80);
  const listName = clip(body.list, 80);
  const rule = clip(body.rule, 300);
  const hits = normalizeHits(body.hits);
  const extra = body.extra && typeof body.extra === 'object' ? JSON.stringify(body.extra).slice(0, 4000) : '';
  const createdAt = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(String(body.ts || '')) ? String(body.ts) : new Date().toISOString();
  const client = clip(request.headers.get('user-agent'), 120);

  await env.DB.prepare(
    `INSERT INTO lookup_record (created_at, mode, target, policy, list_name, rule, hits, extra, client)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(createdAt, mode, target, policy, listName, rule, JSON.stringify(hits), extra, client)
    .run();

  return json({ ok: true });
}

async function handleRecords(request, env) {
  const url = new URL(request.url);
  if (!authorized(request, url, env)) return json({ ok: false, error: 'unauthorized' }, 401);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 1000);
  const q = (url.searchParams.get('q') || '').trim();
  const sql = q
    ? `SELECT * FROM lookup_record WHERE target LIKE ? ORDER BY created_at DESC, id DESC LIMIT ?`
    : `SELECT * FROM lookup_record ORDER BY created_at DESC, id DESC LIMIT ?`;
  const stmt = env.DB.prepare(sql);
  const { results } = q ? await stmt.bind(`%${q}%`, limit).all() : await stmt.bind(limit).all();
  return json({ ok: true, count: results.length, records: results });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage({ records, total, today, topTargets, topPolicies, hasToken }) {
  const cards = [
    ['总记录', total],
    ['今日', today],
  ]
    .map(([k, v]) => `<div class="card"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`)
    .join('');

  const topP = topPolicies.length
    ? topPolicies.map((r) => `<li><code>${esc(r.policy || '(空)')}</code> <b>${esc(r.c)}</b></li>`).join('')
    : '<li class="muted">暂无</li>';
  const topT = topTargets.length
    ? topTargets.map((r) => `<li><code>${esc(r.target || '(空)')}</code> <b>${esc(r.c)}</b></li>`).join('')
    : '<li class="muted">暂无</li>';

  const rows = records
    .map((r) => {
      let hits = [];
      try {
        hits = JSON.parse(r.hits || '[]');
      } catch (e) {
        hits = [];
      }
      const chain = hits.length
        ? `<details><summary>${hits.length} 条命中</summary><ol>${hits
            .map(
              (h, i) =>
                `<li${i === 0 ? ' class="win"' : ''}><code>${esc(h.rule) || '(未记录规则)'}</code> → <b>${esc(
                  h.policy
                )}</b> <span class="muted">${esc(h.list)}</span></li>`
            )
            .join('')}</ol></details>`
        : '<span class="muted">—</span>';
      return `<tr>
  <td class="ts" data-ts="${esc(r.created_at)}">${esc(r.created_at)}</td>
  <td class="mode">${esc(r.mode)}</td>
  <td class="target"><code>${esc(r.target) || '—'}</code></td>
  <td><span class="pill">${esc(r.policy) || '—'}</span></td>
  <td class="muted">${esc(r.list_name) || '—'}</td>
  <td class="chain">${chain}</td>
</tr>`;
    })
    .join('');

  const empty = records.length ? '' : '<tr><td colspan="6" class="muted" style="text-align:center;padding:32px">还没有记录。在 Loon 里跑一次「查域名」，并填好记录服务器和密钥。</td></tr>';
  const tokenWarning = hasToken
    ? ''
    : '<div class="warn">还没设置 <code>LOOKUP_TOKEN</code>，Worker 会拒绝所有写入。先运行 <code>wrangler secret put LOOKUP_TOKEN</code>。</div>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>路由规则查看记录</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 20px 64px; font: 14px/1.6 -apple-system, "Segoe UI", system-ui, sans-serif; background: #f6f7f9; color: #16181d; }
  @media (prefers-color-scheme: dark) { body { background: #101215; color: #e6e8ec; } .card, table { background: #191c21 !important; } th { background: #1f232a !important; } tr:hover td { background: #21252c !important; } .pill { background: #2a2f38 !important; } code { background: #23272f !important; } }
  .wrap { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #71767f; margin: 0 0 20px; font-size: 13px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .card { flex: 1 1 140px; background: #fff; border: 1px solid #e4e6ea; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
  .card span { color: #71767f; font-size: 12px; }
  .card strong { font-size: 20px; font-variant-numeric: tabular-nums; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  @media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
  .panel { background: #fff; border: 1px solid #e4e6ea; border-radius: 10px; padding: 12px 14px; }
  .panel h2 { font-size: 13px; margin: 0 0 8px; color: #71767f; font-weight: 600; }
  .panel ol { margin: 0; padding-left: 20px; }
  .panel li { margin: 2px 0; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
  input[type=search] { flex: 1 1 240px; padding: 8px 10px; border: 1px solid #d8dbe0; border-radius: 8px; background: #fff; color: inherit; font: inherit; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e4e6ea; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eceef1; vertical-align: top; }
  th { background: #fafbfc; font-size: 12px; font-weight: 600; color: #71767f; position: sticky; top: 0; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafbfc; }
  code { background: #f1f3f5; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; word-break: break-all; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #eef1f4; font-size: 12px; white-space: nowrap; }
  .muted { color: #8a9099; }
  .ts { white-space: nowrap; font-variant-numeric: tabular-nums; color: #71767f; font-size: 12.5px; }
  .mode { white-space: nowrap; }
  details summary { cursor: pointer; color: #3b6ef5; }
  details ol { margin: 6px 0 0; padding-left: 20px; }
  details li.win code { background: #e6f4ea; }
  .warn { background: #fff4e5; border: 1px solid #f5d9a8; padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; }
  footer { margin-top: 18px; color: #8a9099; font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>路由规则查看记录</h1>
  <p class="sub">数据来自 Loon 插件「路由规则查看」的上报，存储于 Cloudflare D1。</p>
  ${tokenWarning}
  <div class="cards">${cards}</div>
  <div class="cols">
    <div class="panel"><h2>最常查询的域名</h2><ol>${topT}</ol></div>
    <div class="panel"><h2>最常命中的策略</h2><ol>${topP}</ol></div>
  </div>
  <div class="toolbar">
    <input id="q" type="search" placeholder="过滤：域名 / 策略 / 规则关键字">
  </div>
  <table id="tbl">
    <thead><tr><th>时间</th><th>模式</th><th>目标</th><th>生效策略</th><th>规则表</th><th>命中链路</th></tr></thead>
    <tbody>${rows}${empty}</tbody>
  </table>
  <footer>只显示最近 ${records.length} 条。时间按浏览器时区显示。</footer>
</div>
<script>
  // 时间本地化
  for (const el of document.querySelectorAll('.ts')) {
    const raw = el.dataset.ts;
    const d = new Date(raw);
    if (!isNaN(d)) el.textContent = d.toLocaleString();
  }
  // 客户端过滤
  const q = document.getElementById('q');
  const rows = Array.from(document.querySelectorAll('#tbl tbody tr'));
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    for (const tr of rows) {
      if (tr.children.length < 6) continue;
      tr.style.display = !v || tr.textContent.toLowerCase().includes(v) ? '' : 'none';
    }
  });
</script>
</body>
</html>`;
}

async function handlePage(env) {
  const limit = 200;
  const { results: records } = await env.DB.prepare(
    `SELECT id, created_at, mode, target, policy, list_name, rule, hits FROM lookup_record ORDER BY created_at DESC, id DESC LIMIT ?`
  )
    .bind(limit)
    .all();

  const total = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM lookup_record`).first()) || { c: 0 };
  const today = (await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM lookup_record WHERE date(created_at) = date('now')`
  ).first()) || { c: 0 };
  const { results: topTargets } = await env.DB.prepare(
    `SELECT target, COUNT(*) AS c FROM lookup_record WHERE target <> '' GROUP BY target ORDER BY c DESC LIMIT 8`
  ).all();
  const { results: topPolicies } = await env.DB.prepare(
    `SELECT policy, COUNT(*) AS c FROM lookup_record WHERE policy <> '' GROUP BY policy ORDER BY c DESC LIMIT 8`
  ).all();

  return new Response(
    renderPage({
      records,
      total: total.c,
      today: today.c,
      topTargets,
      topPolicies,
      hasToken: Boolean((env.LOOKUP_TOKEN || '').trim()),
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/api/record') {
        if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
        return await handleRecord(request, env);
      }
      if (path === '/api/records') {
        if (request.method !== 'GET') return json({ ok: false, error: 'GET only' }, 405);
        return await handleRecords(request, env);
      }
      if (path === '/' && request.method === 'GET') return await handlePage(env);
      return json({ ok: false, error: 'not found' }, 404);
    } catch (err) {
      return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
