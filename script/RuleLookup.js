// RuleLookup.js — Loon 路由规则查看 / 体检脚本
// 引用方：plugin/RuleLookup.lpx（generic 手动触发，参数 {mode, domain}）
// 原理：拉取本仓库的 Loon.conf，解析 [Rule] / [Remote Rule] / [Proxy Group]，
//       再按 Loon 的匹配顺序（本地规则 → 远程表自上而下，首条命中生效）复现匹配结果。
// 要求：Loon 3.5.1(983)+（新版 Script 语法 + [Argument] 对象参数）

const REPO_RAW = 'https://raw.githubusercontent.com/rdone44/loon-rules/main/';
const REPO_CDN = 'https://cdn.jsdelivr.net/gh/rdone44/loon-rules@main/';
const CONF_URLS = [REPO_RAW + 'Loon.conf', REPO_CDN + 'Loon.conf'];

const ARG = (typeof $argument === 'object' && $argument) ? $argument : {};
const MODE = String(ARG.mode || '结构概览');
const QUERY = String(ARG.domain || '').trim();
const BUILTIN = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PROXY', 'PASS'];

// ---------------------------------------------------------------- 工具

function basename(url) {
  const s = url.split('?')[0].split('/');
  return s[s.length - 1] || url;
}

// raw.githubusercontent.com/<owner>/<repo>/<branch>/<path> → jsdelivr 镜像
function mirrorUrls(url) {
  const out = [url];
  const m = String(url).match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  if (m) out.push('https://cdn.jsdelivr.net/gh/' + m[1] + '/' + m[2] + '@' + m[3] + '/' + m[4]);
  return out;
}

function fetchText(urls, cb) {
  const list = Array.isArray(urls) ? urls : mirrorUrls(urls);
  let i = 0;
  (function tryNext() {
    if (i >= list.length) return cb('全部地址都失败：' + list.join(' , '));
    const u = list[i++];
    $httpClient.get({ url: u, timeout: 30000, 'auto-redirect': true }, function (err, resp, data) {
      if (err || !resp || resp.status >= 400 || typeof data !== 'string' || data.length < 16) {
        return setTimeout(tryNext, 0);
      }
      cb(null, data);
    });
  })();
}

// 限并发拉取（4 张表并行），结果按 items 顺序写回
function fetchSeq(items, onEach, done) {
  const results = new Array(items.length);
  const CONC = 4;
  let nextIdx = 0, finished = 0;
  function startOne() {
    if (nextIdx >= items.length) return;
    const idx = nextIdx++;
    const it = items[idx];
    fetchText(it.url, function (err, text) {
      const r = { item: it, text: err ? '' : text, err: err || null };
      results[idx] = r;
      if (onEach) onEach(r);
      finished++;
      if (finished >= items.length) done(results);
      else startOne();
    });
  }
  if (!items.length) return done([]);
  for (let k = 0; k < Math.min(CONC, items.length); k++) startOne();
}

function normDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^\/\//, '');
  s = s.replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return s;
}

function isIPv4(s) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(s); }
function ipv4ToInt(s) {
  const p = s.split('.').map(Number);
  if (p.length !== 4 || p.some(n => isNaN(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function cidrMatch4(ip, cidr) {
  const parts = String(cidr).split('/');
  const base = ipv4ToInt(parts[0]);
  const len = parts.length > 1 ? parseInt(parts[1], 10) : 32;
  const me = ipv4ToInt(ip);
  if (base === null || me === null || isNaN(len)) return false;
  const mask = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
  return ((base & mask) >>> 0) === ((me & mask) >>> 0);
}

// ---------------------------------------------------------------- 解析配置

function parseConf(text) {
  const lines = text.split(/\r?\n/);
  let section = '';
  const conf = { local: [], remote: [], groups: [], general: {} };
  for (let k = 0; k < lines.length; k++) {
    const raw = lines[k];
    const l = raw.trim();
    const head = l.match(/^\[(.+)\]$/);
    if (head) { section = head[1].trim(); continue; }
    if (!l || l[0] === '#' || l.startsWith('//')) continue;

    if (section === 'Rule') {
      const p = l.split(',');
      if (p.length < 2) continue;
      const type = p[0].trim().toUpperCase();
      const isFinal = type === 'FINAL';
      conf.local.push({
        type: type,
        value: isFinal ? '' : p[1].trim(),
        policy: ((isFinal ? p[1] : (p[2] || 'DIRECT')) || 'DIRECT').trim(),
        list: '[本地 Rule]',
        raw: l
      });
    } else if (section === 'Remote Rule') {
      const m = l.match(/^(https?:\/\/\S+?),\s*(.*)$/);
      if (!m) { conf.remote.push({ url: l, policy: 'DIRECT', tag: basename(l), enabled: true, bad: true }); continue; }
      const opt = m[2];
      const pol = (opt.match(/policy\s*=\s*([^,]+)/) || [, 'DIRECT'])[1].trim();
      const tag = (opt.match(/tag\s*=\s*([^,]+)/) || [, basename(m[1])])[1].trim();
      const enabled = !/enabled\s*=\s*false/i.test(opt);
      conf.remote.push({ url: m[1], policy: pol, tag: tag, enabled: enabled });
    } else if (section === 'Proxy Group') {
      const name = l.split('=')[0].trim();
      if (name) conf.groups.push(name);
    } else {
      const i = l.indexOf('=');
      if (i > 0) conf.general[section + '.' + l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  }
  return conf;
}

function listEnabled(conf) {
  return conf.remote.filter(r => r.enabled && !r.bad);
}

// 把本地规则 + 已拉取的表拼成一条有序规则流
// FINAL 在 Loon 里无论写在哪都是最后兜底，这里单独拿出来
function flattenRules(conf, fetched) {
  const rules = [];
  const fallback = [];
  for (const r of conf.local) {
    if (r.type === 'FINAL') { fallback.push(r); continue; }
    rules.push(Object.assign({ order: rules.length }, r));
  }
  for (const f of fetched) {
    if (f.err || !f.text) continue;
    const it = f.item;
    const lines = f.text.split(/\r?\n/);
    for (const raw of lines) {
      const l = raw.trim();
      if (!l || l[0] === '#' || l.startsWith('//')) continue;
      const p = l.split(',');
      if (p.length < 2) continue;
      if (p[0].trim().toUpperCase() === 'FINAL') continue;
      rules.push({
        order: rules.length,
        type: p[0].trim().toUpperCase(),
        value: (p[1] || '').trim(),
        policy: it.policy,
        list: it.tag,
        raw: l
      });
    }
  }
  rules.fallback = fallback;
  return rules;
}

// ---------------------------------------------------------------- 匹配

const DOMAIN_TYPES = { 'DOMAIN': 1, 'DOMAIN-SUFFIX': 1, 'DOMAIN-KEYWORD': 1, 'DOMAIN-WILDCARD': 1 };

function domainHit(rule, d) {
  const v = String(rule.value).toLowerCase();
  if (rule.type === 'DOMAIN') return d === v;
  if (rule.type === 'DOMAIN-SUFFIX') return d === v || d.slice(-(v.length + 1)) === '.' + v;
  if (rule.type === 'DOMAIN-KEYWORD') return d.indexOf(v) >= 0;
  if (rule.type === 'DOMAIN-WILDCARD') { // Loon 3.5.3(1008)+，* ? [...]
    const rx = '^' + v.replace(/[.+^${}()|\\]/g, '\\$&')
      .replace(/\*/g, '[^.]*').replace(/\?/g, '[^.]') + '$';
    try { return new RegExp(rx).test(d); } catch (e) { return false; }
  }
  return false;
}

function ipHit(rule, ip) {
  if (rule.type === 'IP-CIDR' && isIPv4(ip)) return cidrMatch4(ip, rule.value);
  if (rule.type === 'IP-CIDR6') return false; // IPv6 暂不本地计算，见输出说明
  return false;
}

// 匹配顺序（据官方文档 Loon 3.0.3+）：
//   目标是域名 → 先按配置顺序跑全部「域名类规则」；全不命中再解析 DNS 跑 IP 规则
//   目标是 IP   → 只跑 IP 规则
// 所以 IP-CIDR 写在前面也不会抢走后面的域名规则，两者是两轮匹配。
function matchAll(rules, target) {
  const isIP = isIPv4(target);
  const hits = [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (isIP ? ipHit(r, target) : (DOMAIN_TYPES[r.type] && domainHit(r, target))) hits.push(r);
  }
  return hits;
}

// 表里是否存在 IP 类规则（域名查不到时，Loon 会转去跑它们）
function hasIpRules(rules) {
  for (let i = 0; i < rules.length; i++) {
    const t = rules[i].type;
    if (t === 'IP-CIDR' || t === 'IP-CIDR6' || t === 'GEOIP' || t === 'IP-ASN') return true;
  }
  return false;
}

// ---------------------------------------------------------------- 运行态

function runtimeInfo() {
  const info = { raw: null, groups: [], selected: {} };
  try {
    info.raw = JSON.parse($config.getConfig() || '{}');
  } catch (e) { info.raw = {}; }
  const g = info.raw.all_policy_groups || [];
  info.groups = g.map(x => (typeof x === 'string' ? x : (x && (x.name || x.policy_name)) || '')).filter(Boolean);
  return info;
}

function groupExists(name, conf, rt) {
  if (BUILTIN.indexOf(name.toUpperCase()) >= 0) return true;
  if (conf.groups.indexOf(name) >= 0) return true;
  if (rt.groups.indexOf(name) >= 0) return true;
  return false;
}

function currentSelection(name) {
  try {
    const v = $config.getSelectedPolicy(name);
    return v ? String(v) : '';
  } catch (e) { return ''; }
}

function runningModelText(m) {
  const map = { 0: '全局直连', 1: '分流模式', 2: '全局代理' };
  return map[m] !== undefined ? map[m] : ('未知(' + m + ')');
}

// ---------------------------------------------------------------- 输出

const OUT = [];
function say(s) { OUT.push(s); }

function notify(title, subtitle, content) {
  try { $notification.post(title, subtitle, content); } catch (e) {}
}

function finish(subtitle, content) {
  const tail = OUT.length > 10 ? ('\n…共 ' + OUT.length + ' 行，完整清单看 Loon 脚本日志') : '';
  const body = OUT.slice(0, 10).join('\n') + tail;
  console.log('\n===== RuleLookup =====\n' + OUT.join('\n') + '\n======================');
  notify('规则查询 · ' + MODE, subtitle || '', body);
  $done();
}

function fail(msg) {
  say('❌ ' + msg);
  finish('失败', msg);
}

// ---------------------------------------------------------------- 模式 1：结构概览

function runOverview(conf, rt) {
  const enabled = listEnabled(conf);
  const disabled = conf.remote.filter(r => !r.enabled);

  say('【运行态】');
  const rm = rt.raw.running_model;
  say('  模式：' + runningModelText(rm) + '    FINAL：' + (rt.raw.final || '(未读到)'));
  say('  策略组：' + (conf.groups.length ? conf.groups.join(' / ') : '(未读到)'));

  say('\n【本地 [Rule]】' + conf.local.length + ' 条（优先于所有远程表）');
  conf.local.forEach((r, i) => say('  ' + String(i + 1).padStart(2) + '. ' + r.raw));

  say('\n【[Remote Rule]】启用 ' + enabled.length + ' 张表，按下列顺序首条命中生效：');
  let n = 0;
  const bad = [];
  for (const r of conf.remote) {
    if (!r.enabled) { say('  -- ' + r.tag + '（已禁用）'); continue; }
    n++;
    const ok = groupExists(r.policy, conf, rt);
    if (!ok) bad.push(r.tag + ' → ' + r.policy);
    const sel = ok ? currentSelection(r.policy) : '';
    say('  ' + String(n).padStart(2) + '. ' + pad(r.tag, 12) + ' → ' + pad(r.policy, 12) +
      (ok ? (sel ? '（当前 ' + sel + '）' : '') : '⚠ 策略组不存在') +
      '  ' + basename(r.url));
  }
  if (disabled.length) say('  已禁用：' + disabled.map(r => r.tag).join('、'));

  say('\n【一致性检查】');
  if (bad.length) {
    say('  ⚠ 以下表引用的策略组在主配置里找不到（会按"策略组不存在"的兜底逻辑处理）：');
    bad.forEach(b => say('      ' + b));
  } else {
    say('  ✅ 所有远程表引用的策略组都存在');
  }
  const missingTag = conf.remote.filter(r => r.enabled && !r.bad && r.tag === basename(r.url));
  if (missingTag.length) {
    say('  ℹ 以下表没写 tag=，列表里只能看到文件名（不影响分流）：' + missingTag.map(r => basename(r.url)).join('、'));
  }
  const seen = {};
  conf.remote.forEach(r => { seen[r.url] = (seen[r.url] || 0) + 1; });
  const dup = Object.keys(seen).filter(u => seen[u] > 1);
  say(dup.length ? ('  ⚠ 重复引用的表：' + dup.map(u => basename(u) + '×' + seen[u]).join('、')) : '  ✅ 没有重复引用的表');

  const geoip = conf.local.filter(r => r.type === 'GEOIP');
  say(geoip.length ? '  ⚠ 存在 GEOIP 兜底规则：' + geoip.map(r => r.raw).join(' / ') + '（会抢在广告表之前）'
    : '  ✅ 没有 GEOIP 兜底（广告表能轮得到）');

  say('\n【关键 General】');
  ['General.dns-server', 'General.doh-server', 'General.domain-reject-mode', 'General.sni-sniffing', 'General.final'].forEach(k => {
    if (conf.general[k]) say('  ' + k + ' = ' + conf.general[k]);
  });

  finish(enabled.length + ' 张远程表 / ' + conf.local.length + ' 条本地规则',
    'FINAL：' + (rt.raw.final || '?') + '\n模式：' + runningModelText(rm) +
    '\n远程表：' + enabled.length + ' 张\n本地规则：' + conf.local.length + ' 条' +
    (bad.length ? '\n⚠ ' + bad.length + ' 张表的策略组不存在' : ''));
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

// ---------------------------------------------------------------- 模式 2：单域名查询

function runQuery(conf, rt, query) {
  const target = normDomain(query);
  if (!target) return fail('没有填写域名。请在插件参数里填 domain，例如 www.youtube.com');
  const isIP = isIPv4(target);

  const enabled = listEnabled(conf);
  // 域名查询跳过纯 IP 表（ChinaIPs 700KB，只在查 IP 时需要）
  const items = enabled.filter(r => isIP || !/IPs?\.list$/i.test(basename(r.url)));
  console.log('RuleLookup: 查询 ' + target + '，待拉取 ' + items.length + ' 张表');

  fetchSeq(items, null, function (fetched) {
    const failed = fetched.filter(f => f.err);
    const rules = flattenRules(conf, fetched);
    const hits = matchAll(rules, target);
    const fallback = (rules.fallback || []);

    say('\n【命中链路】按 Loon 顺序，第一条即实际生效的策略');
    if (!hits.length) {
      if (fallback.length) {
        say('  ▶ FINAL 兜底：' + fallback[0].raw);
      } else {
        say('  （没有任何规则命中，且主配置没有 FINAL 行）');
      }
    } else {
      hits.forEach((h, i) => {
        const ok = groupExists(h.policy, conf, rt);
        const sel = ok ? currentSelection(h.policy) : '';
        say('  ' + (i === 0 ? '▶' : ' ') + (i + 1) + '. ' + pad(h.list, 12) + ' → ' +
          pad(h.policy, 12) + (i === 0 ? '（生效' + (sel ? '，当前 ' + sel : '') + '）' : '（被前面的规则抢先，不生效）'));
        say('       ' + h.raw);
      });
    }

    const first = hits[0];
    const effective = first || fallback[0];
    if (effective && !groupExists(effective.policy, conf, rt)) {
      say('\n⚠ 生效策略「' + effective.policy + '」在主配置里不是策略组名，也不是 DIRECT/REJECT/PROXY —— 可能是拼写错误或节点名。');
    }

    // 同名规则散落在多张表 → 提示维护冗余
    if (hits.length > 1) {
      const groups = {};
      hits.forEach(h => { groups[h.policy] = (groups[h.policy] || 0) + 1; });
      const keys = Object.keys(groups);
      say('\n【说明】该目标同时命中 ' + hits.length + ' 条规则，涉及策略：' + keys.map(k => k + '×' + groups[k]).join('、') +
        (keys.length > 1 ? '（策略不同，靠前的赢）' : '（策略相同，后面的是死规则）'));
    }

    if (!hits.length && !isIP && hasIpRules(rules)) {
      say('\n⚠ 域名规则全没命中。按 Loon 的顺序，接下来会解析 DNS 再跑 IP 规则（ChinaIPs / Global / Game 等），' +
        '所以最终可能不是 FINAL 而是某个 IP 表。本脚本不做 DNS 解析，要把结果算准就把域名解析出的 IP 拿来查一次。');
    }
    if (isIP) say('\n注意：IP-CIDR6 未在脚本内计算；GEOIP / IP-ASN 需要 Loon 本地数据库，脚本不判定。');
    if (failed.length) say('\n⚠ 有 ' + failed.length + ' 张表拉取失败，结果可能不全：' + failed.map(f => f.item.tag).join('、'));

    const sub = effective ? (effective.policy + ' ← ' + effective.list) : '无规则命中';
    const content = hits.length
      ? (first.raw + '\n→ ' + first.policy + (hits.length > 1 ? '\n另有 ' + (hits.length - 1) + ' 条规则被抢先（详见日志）' : ''))
      : (effective ? ('未命中任何规则，走 ' + effective.raw) : '未命中任何规则');
    finish(sub, target + ' → ' + sub + '\n' + content);
  });
}

// ---------------------------------------------------------------- 模式 3：全量体检

function runAudit(conf, rt) {
  const enabled = listEnabled(conf);
  console.log('RuleLookup: 全量体检，待拉取 ' + enabled.length + ' 张表');

  fetchSeq(enabled, function (r) {
    if (r.err) say('  ✗ ' + r.item.tag + ' 拉取失败');
  }, function (fetched) {
    const rules = flattenRules(conf, fetched);
    const domRules = rules.filter(r => DOMAIN_TYPES[r.type]);
    const ipRules = rules.filter(r => r.type === 'IP-CIDR' || r.type === 'IP-CIDR6' || r.type === 'IP-ASN' || r.type === 'GEOIP');
    const otherRules = rules.filter(r => !DOMAIN_TYPES[r.type] && r.type !== 'IP-CIDR' && r.type !== 'IP-CIDR6' && r.type !== 'IP-ASN' && r.type !== 'GEOIP');
    const kwRules = rules.filter(r => r.type === 'DOMAIN-KEYWORD');
    const exact = new Map();
    for (const r of domRules) {
      const v = String(r.value).toLowerCase();
      if (!exact.has(v)) exact.set(v, r);
    }

    // 域名宇宙：每条域名型规则自身 + 一个子域
    const universe = new Set();
    for (const r of domRules) {
      const v = String(r.value).toLowerCase();
      universe.add(v);
      universe.add('sub.' + v);
    }

    const hitCount = new Map();
    for (const d of universe) {
      const parts = d.split('.');
      let best = null;
      for (let i = 0; i < parts.length; i++) {
        const cand = parts.slice(i).join('.');
        const r = exact.get(cand);
        if (r && (!best || r.order < best.order)) best = r;
      }
      for (const r of kwRules) {
        if ((!best || r.order < best.order) && d.indexOf(String(r.value).toLowerCase()) >= 0) best = r;
      }
      if (best) hitCount.set(best.order, (hitCount.get(best.order) || 0) + 1);
    }

    // 域名规则独占命中情况按表统计；不能据此判断表内 IP / UA 规则是否有效。
    const byList = new Map();
    function entry(r) {
      const k = r.list + '\u0001' + r.policy;
      if (!byList.has(k)) byList.set(k, { list: r.list, policy: r.policy, first: r.order, domainTotal: 0, domainFired: 0, ipTotal: 0, otherTotal: 0 });
      return byList.get(k);
    }
    for (const r of domRules) {
      const e = entry(r);
      e.domainTotal++;
      if (hitCount.has(r.order)) e.domainFired++;
    }
    for (const r of ipRules) entry(r).ipTotal++;
    for (const r of otherRules) entry(r).otherTotal++;

    say('\n【域名规则独占命中率】这是候选域名上的近似统计；同一表仍可能有 IP / UA 等规则生效');
    const rows = Array.from(byList.values()).sort((a, b) => a.first - b.first);
    for (const e of rows) {
      const pct = e.domainTotal ? (100 * e.domainFired / e.domainTotal) : null;
      const ratio = pct === null ? '   n/a' : (pct.toFixed(1) + '%').padStart(6);
      const flag = e.domainTotal && e.domainFired === 0 ? '  域名规则无独占命中' : (pct !== null && pct < 30 ? '  多数域名规则被抢' : '');
      say('  ' + pad(e.list, 12) + pad(e.policy, 12) + ' 域名' + String(e.domainFired).padStart(4) + '/' + String(e.domainTotal).padEnd(4) +
        ' IP' + String(e.ipTotal).padStart(4) + ' 其他' + String(e.otherTotal).padStart(4) + ' 命中率' + ratio + flag);
    }

    // 完全相同的规则行出现在多张表
    const firstByKey = new Map();
    const dupGroups = new Map();
    for (const r of rules) {
      const k = r.type + '|' + String(r.value).toLowerCase();
      if (!firstByKey.has(k)) { firstByKey.set(k, r); continue; }
      const f = firstByKey.get(k);
      if (f.list === r.list && f.policy === r.policy) continue;
      const g = f.list + '[' + f.policy + '] > ' + r.list + '[' + r.policy + ']';
      dupGroups.set(g, (dupGroups.get(g) || 0) + 1);
    }
    say('\n【完全相同的规则行出现在多张表】后表那条永远不会命中');
    if (!dupGroups.size) say('  无');
    Array.from(dupGroups.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .forEach(([g, n]) => say('  ' + g + '  ×' + n));

    // 跨策略的域名遮蔽明细
    const preempt = new Map();
    for (const r of domRules) {
      const v = String(r.value).toLowerCase();
      const parts = v.split('.');
      let winner = null;
      for (let i = 0; i < parts.length; i++) {
        const cand = parts.slice(i).join('.');
        const w = exact.get(cand);
        if (w && w.order < r.order && (!winner || w.order < winner.order)) winner = w;
      }
      for (const k of kwRules) {
        if (k.order < r.order && v.indexOf(String(k.value).toLowerCase()) >= 0 && (!winner || k.order < winner.order)) winner = k;
      }
      if (!winner || winner.list === r.list) continue;
      const g = winner.list + '[' + winner.policy + '] 吃掉 ' + r.list + '[' + r.policy + ']';
      if (!preempt.has(g)) preempt.set(g, []);
      preempt.get(g).push(v + '<-' + String(winner.value));
    }
    say('\n【跨策略抢先】前表把后表的域名抢走（策略不同，后表那条等于失效）');
    if (!preempt.size) say('  无');
    Array.from(preempt.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([g, arr]) => {
      say('  ' + g + '  ×' + arr.length + '  例：' + arr.slice(0, 4).join('、'));
    });

    const noDomainWinner = rows.filter(e => e.domainTotal > 0 && e.domainFired === 0);
    const failed = fetched.filter(f => f.err);
    finish(noDomainWinner.length + ' 张表的域名规则无独占命中',
      '域名样本 ' + universe.size + ' 个 / 规则 ' + rules.length + ' 条' +
      (noDomainWinner.length ? '\n域名规则无独占命中：' + noDomainWinner.map(e => e.list).join('、') : '') +
      '\n脚本未模拟的 IP 规则：' + ipRules.length + ' 条；其他类型：' + otherRules.length + ' 条' +
      (failed.length ? '\n拉取失败：' + failed.map(f => f.item.tag).join('、') : '') +
      '\n详细清单见脚本日志');
  });
}

// ---------------------------------------------------------------- 入口

fetchText(CONF_URLS, function (err, text) {
  if (err) return fail('拉取 Loon.conf 失败：' + err);
  const conf = parseConf(text);
  const rt = runtimeInfo();
  if (!conf.remote.length && !conf.local.length) return fail('Loon.conf 解析不到 [Rule] / [Remote Rule]，可能格式变了');

  if (MODE.indexOf('域名') >= 0 || MODE.indexOf('查询') >= 0) return runQuery(conf, rt, QUERY);
  if (MODE.indexOf('体检') >= 0) return runAudit(conf, rt);
  return runOverview(conf, rt);
});
