/**
 * Clash 节点（parser.js 的输出）→ sing-box outbound。
 *
 * 字段映射以 sing-box v1.14.4 的 option/*.go 与官方文档为准，
 * 每条映射都用真实内核 `sing-box check` 验过，不支持的直接 skip 而不是产出脏字段。
 */

/** sing-box 支持的 shadowsocks method（含 2022 与 SSR 遗留，均来自 option/shadowsocks.go 的 enum） */
const SS_METHODS = new Set([
  "none",
  "aes-128-gcm",
  "aes-192-gcm",
  "aes-256-gcm",
  "chacha20-ietf-poly1305",
  "xchacha20-ietf-poly1305",
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "2022-blake3-chacha20-poly1305",
  "aes-128-ctr",
  "aes-192-ctr",
  "aes-256-ctr",
  "aes-128-cfb",
  "aes-192-cfb",
  "aes-256-cfb",
  "rc4-md5",
  "chacha20-ietf",
  "xchacha20",
]);

/** sing-box 的 utls fingerprint 取值（option/tls.go）；clash 侧的常见写法先归一化 */
const UTLS_FINGERPRINTS = new Set([
  "chrome", "firefox", "edge", "safari", "360", "qq", "ios", "android", "random", "randomized",
  "chrome_psk", "chrome_psk_shuffle", "chrome_padding_psk_shuffle", "chrome_pq", "chrome_pq_psk",
]);

const CLASH_FP_ALIASES = {
  chrome: "chrome",
  chromium: "chrome",
  firefox: "firefox",
  safari: "safari",
  edge: "edge",
  ios: "ios",
  android: "android",
  random: "random",
  randomized: "random",
  randomized_ja3: "random",
};

/** base64 / base64url → 字节数；解不出来返回 -1 */
function base64ByteLength(value) {
  const text = String(value).replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(text)) return -1;
  if (text.length % 4 === 1) return -1;
  return Math.floor(text.length * 3 / 4);
}

/**
 * reality public_key 必须是 32 字节 X25519。
 * 不合法时内核直接在 initialize 阶段 FATAL（实测：invalid public_key），所以这里先挡掉。
 */
function validRealityKey(value) {
  return typeof value === "string" && base64ByteLength(value) === 32;
}

/** clash 的 plugin-opts 转成 sing-box 的 plugin_opts 字符串（SIP003 语法） */
function sip003Options(pairs) {
  return pairs
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => (value === true ? key : `${key}=${value}`))
    .join(";");
}

/** clash 的 ss plugin 名 → sing-box 认可的 SIP003 名（只支持 obfs-local 与 v2ray-plugin） */
function mapShadowsocksPlugin(plugin, opts) {
  const name = String(plugin || "").toLowerCase();
  const source = opts && typeof opts === "object" ? opts : {};
  const host = source.host || "";

  if (name === "obfs" || name === "obfs-local" || name === "simple-obfs") {
    // 核心里注册的插件名只有 obfs-local；别名一律归一化，否则 plugin not found
    return {
      plugin: "obfs-local",
      plugin_opts: sip003Options([["obfs", source.mode || "http"], ["obfs-host", host]]),
    };
  }
  if (name === "v2ray-plugin") {
    return {
      plugin: "v2ray-plugin",
      plugin_opts: sip003Options([
        ["mode", source.mode || "websocket"],
        ["tls", source.tls === true ? true : ""],
        ["host", host],
        ["path", source.path || ""],
      ]),
    };
  }
  return null;
}

/** clash 的 network / ws-opts / grpc-opts → sing-box 的 transport（option/v2ray_transport.go） */
function buildTransport(proxy) {
  const network = String(proxy.network || "tcp").toLowerCase();
  const ws = proxy["ws-opts"] || {};
  const grpc = proxy["grpc-opts"] || {};
  const h2 = proxy["h2-opts"] || {};
  const headers = ws.headers || {};
  const wsHost = headers.Host || headers.host || "";
  const wsPath = ws.path || "/";

  switch (network) {
    case "":
    case "tcp":
      return null;
    case "ws":
      return { type: "ws", path: wsPath, ...(wsHost ? { headers: { Host: wsHost } } : {}) };
    case "grpc":
      return { type: "grpc", service_name: grpc["grpc-service-name"] || "" };
    case "h2":
      return { type: "http", path: h2.path || "/", ...(h2.host ? { host: h2.host } : {}) };
    case "http":
      return {
        type: "http",
        path: proxy["http-opts"]?.path?.[0] || "/",
        ...(proxy["http-opts"]?.headers?.Host ? { host: proxy["http-opts"].headers.Host } : {}),
      };
    case "httpupgrade":
      return { type: "httpupgrade", path: wsPath, ...(wsHost ? { host: wsHost } : {}) };
    case "quic":
      return { type: "quic" };
    default:
      return undefined; // 未知传输层 → 调用方 skip
  }
}

/**
 * clash 的 TLS 相关字段 → sing-box tls（option/tls.go 的 OutboundTLSOptions）。
 * 返回 undefined 表示该组合无法表达（调用方 skip）。
 */
function buildTls(proxy, options = {}) {
  const reality = proxy["reality-opts"];
  const enabled = proxy.tls === true || options.forceTls === true || Boolean(reality);

  const tls = {};
  if (enabled) tls.enabled = true;

  const serverName = proxy.servername || proxy.sni || proxy["server-name"] || "";
  if (serverName) tls.server_name = serverName;
  if (proxy["skip-cert-verify"] === true) tls.insecure = true;
  if (Array.isArray(proxy.alpn) && proxy.alpn.length > 0) tls.alpn = proxy.alpn;

  const fingerprint = CLASH_FP_ALIASES[String(proxy["client-fingerprint"] || "").toLowerCase()];
  if (fingerprint && UTLS_FINGERPRINTS.has(fingerprint)) {
    tls.utls = { enabled: true, fingerprint };
  }

  if (reality && typeof reality === "object") {
    const publicKey = reality["public-key"] || reality["public_key"] || "";
    if (!validRealityKey(publicKey)) {
      return { error: "reality public_key 不是合法的 32 字节 X25519 密钥" };
    }
    // reality 必须落在 tls 里；顶层 reality-opts 会被解码器拒（实测 unknown field）
    tls.enabled = true;
    tls.reality = { enabled: true, public_key: publicKey };
    const shortId = reality["short-id"] || reality["short_id"] || "";
    if (shortId) tls.reality.short_id = String(shortId);
    // reality 的握手必须走 uTLS，缺省用 chrome
    if (!tls.utls) tls.utls = { enabled: true, fingerprint: "chrome" };
  }

  return Object.keys(tls).length > 0 ? tls : null;
}

/**
 * 单个 Clash 节点 → sing-box outbound。
 * 返回 { outbound } 或 { skip: 原因 }。
 */
export function toOutbound(proxy) {
  if (!proxy || !proxy.name || !proxy.server || !proxy.port) {
    return { skip: "缺少 name/server/port" };
  }

  const base = { tag: String(proxy.name), server: String(proxy.server), server_port: Number(proxy.port) };
  const type = String(proxy.type || "").toLowerCase();

  switch (type) {
    case "ss":
    case "shadowsocks": {
      const method = String(proxy.cipher || "").toLowerCase();
      if (!SS_METHODS.has(method)) return { skip: `sing-box 不支持 ss 加密方式 ${method || "(空)"}` };
      const outbound = { type: "shadowsocks", ...base, method, password: String(proxy.password || "") };
      if (proxy.plugin) {
        const plugin = mapShadowsocksPlugin(proxy.plugin, proxy["plugin-opts"]);
        if (!plugin) return { skip: `sing-box 只支持 obfs-local / v2ray-plugin，拒绝 ${proxy.plugin}` };
        outbound.plugin = plugin.plugin;
        if (plugin.plugin_opts) outbound.plugin_opts = plugin.plugin_opts;
      }
      return { outbound };
    }

    case "ssr":
    case "shadowsocksr":
      // sing-box 1.6.0 起硬删除，内核直接 FATAL
      return { skip: "sing-box 已移除 ShadowsocksR 支持（1.6.0 起）" };

    case "vmess": {
      const transport = buildTransport(proxy);
      if (transport === undefined) return { skip: `不支持传输层 ${proxy.network}` };
      const outbound = {
        type: "vmess",
        ...base,
        uuid: String(proxy.uuid || ""),
        security: String(proxy.cipher || "auto").toLowerCase(),
        alter_id: Number(proxy.alterId || 0),
      };
      const tls = buildTls(proxy);
      if (tls && tls.error) return { skip: tls.error };
      if (tls) outbound.tls = tls;
      if (transport) outbound.transport = transport;
      return { outbound };
    }

    case "vless": {
      const transport = buildTransport(proxy);
      if (transport === undefined) return { skip: `不支持传输层 ${proxy.network}` };
      const outbound = { type: "vless", ...base, uuid: String(proxy.uuid || "") };
      if (proxy.flow) outbound.flow = String(proxy.flow);
      const tls = buildTls(proxy);
      if (tls && tls.error) return { skip: tls.error };
      if (tls) outbound.tls = tls;
      if (transport) outbound.transport = transport;
      return { outbound };
    }

    case "trojan": {
      const transport = buildTransport(proxy);
      if (transport === undefined) return { skip: `不支持传输层 ${proxy.network}` };
      const outbound = {
        type: "trojan",
        ...base,
        password: String(proxy.password || ""),
        // trojan 恒走 TLS
        tls: null,
      };
      const tls = buildTls(proxy, { forceTls: true });
      if (tls && tls.error) return { skip: tls.error };
      outbound.tls = tls || { enabled: true };
      if (transport) outbound.transport = transport;
      return { outbound };
    }

    case "hysteria2":
    case "hy2": {
      const outbound = { type: "hysteria2", ...base, password: String(proxy.password || "") };
      const obfsName = String(proxy.obfs || "").toLowerCase();
      if (obfsName && obfsName !== "none") {
        // sing-box 只认 salamander / gecko，clash 侧一般只写 salamander
        outbound.obfs = {
          type: obfsName === "gecko" ? "gecko" : "salamander",
          password: String(proxy["obfs-password"] || ""),
        };
      }
      const tls = buildTls(proxy, { forceTls: true });
      if (tls && tls.error) return { skip: tls.error };
      outbound.tls = tls || { enabled: true };
      return { outbound };
    }

    case "tuic": {
      const uuid = String(proxy.uuid || "");
      // 内核会校验 uuid，非法值 FATAL
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
        return { skip: "tuic 缺少合法 uuid" };
      }
      const outbound = { type: "tuic", ...base, uuid, password: String(proxy.password || "") };
      if (proxy["congestion-controller"]) outbound.congestion_control = String(proxy["congestion-controller"]);
      if (proxy["udp-relay-mode"]) outbound.udp_relay_mode = String(proxy["udp-relay-mode"]);
      const tls = buildTls(proxy, { forceTls: true });
      if (tls && tls.error) return { skip: tls.error };
      outbound.tls = tls || { enabled: true };
      return { outbound };
    }

    case "socks5":
    case "socks": {
      const outbound = { type: "socks", ...base, version: "5" };
      if (proxy.username) outbound.username = String(proxy.username);
      if (proxy.password) outbound.password = String(proxy.password);
      return { outbound };
    }

    case "http":
    case "https": {
      const outbound = { type: "http", ...base };
      if (proxy.username) outbound.username = String(proxy.username);
      if (proxy.password) outbound.password = String(proxy.password);
      const tls = buildTls(proxy, { forceTls: type === "https" });
      if (tls && tls.error) return { skip: tls.error };
      if (tls) outbound.tls = tls;
      return { outbound };
    }

    default:
      return { skip: `sing-box 侧无对应类型 ${proxy.type}` };
  }
}

/** 批量转换，返回 { outbounds, skipped } */
export function convertNodes(nodes) {
  const outbounds = [];
  const skipped = [];
  const used = new Set();

  for (const node of Array.isArray(nodes) ? nodes : []) {
    const result = toOutbound(node);
    if (result.skip) {
      skipped.push({ name: String(node?.name || ""), reason: result.skip });
      continue;
    }
    // tag 必须唯一，重名的加序号
    const base = result.outbound.tag;
    let tag = base;
    let index = 1;
    while (used.has(tag)) tag = `${base} ${++index}`;
    used.add(tag);
    result.outbound.tag = tag;
    outbounds.push(result.outbound);
  }

  return { outbounds, skipped };
}

/** 和 Clash 侧一致的地区识别表 */
const REGION_TABLE = [
  { name: "🇭🇰 香港", match: ["HK", "HKG", "HONGKONG", "HONG KONG", "香港", "🇭🇰"] },
  { name: "🇹🇼 台湾", match: ["TW", "TWN", "台湾", "臺灣", "台北", "🇹🇼"] },
  { name: "🇯🇵 日本", match: ["JP", "JPN", "JAPAN", "日本", "东京", "大阪", "🇯🇵"] },
  { name: "🇰🇷 韩国", match: ["KR", "KOR", "KOREA", "韩国", "首尔", "🇰🇷"] },
  { name: "🇸🇬 新加坡", match: ["SG", "SGP", "SINGAPORE", "新加坡", "狮城", "🇸🇬"] },
  { name: "🇺🇸 美国", match: ["US", "USA", "AMERICA", "美国", "洛杉矶", "圣何塞", "🇺🇸"] },
  { name: "🇬🇧 英国", match: ["UK", "GB", "GBR", "英国", "伦敦", "🇬🇧"] },
  { name: "🇩🇪 德国", match: ["DE", "GER", "德国", "法兰克福", "🇩🇪"] },
  { name: "🇫🇷 法国", match: ["FR", "FRA", "法国", "巴黎", "🇫🇷"] },
  { name: "🇳🇱 荷兰", match: ["NL", "NLD", "荷兰", "阿姆斯特丹", "🇳🇱"] },
  { name: "🇷🇺 俄罗斯", match: ["RU", "RUS", "俄罗斯", "莫斯科", "🇷🇺"] },
  { name: "🇲🇾 马来西亚", match: ["MY", "MYS", "马来西亚", "吉隆坡", "🇲🇾"] },
  { name: "🇹🇭 泰国", match: ["TH", "THA", "泰国", "曼谷", "🇹🇭"] },
  { name: "🇻🇳 越南", match: ["VN", "VNM", "越南", "🇻🇳"] },
  { name: "🇵🇭 菲律宾", match: ["PH", "PHL", "菲律宾", "🇵🇭"] },
  { name: "🇮🇳 印度", match: ["IN", "IND", "印度", "孟买", "🇮🇳"] },
  { name: "🇮🇩 印尼", match: ["ID", "IDN", "印尼", "雅加达", "🇮🇩"] },
  { name: "🇨🇦 加拿大", match: ["CA", "CAN", "加拿大", "🇨🇦"] },
  { name: "🇦🇺 澳大利亚", match: ["AU", "AUS", "澳大利亚", "澳洲", "悉尼", "🇦🇺"] },
  { name: "🇧🇷 巴西", match: ["BR", "BRA", "巴西", "🇧🇷"] },
  { name: "🇹🇷 土耳其", match: ["TR", "TUR", "土耳其", "🇹🇷"] },
  { name: "🇦🇷 阿根廷", match: ["AR", "ARG", "阿根廷", "🇦🇷"] },
];

function matchRegion(name, region) {
  const upper = String(name).toUpperCase();
  return region.match.some((kw) => {
    if (!/^[A-Z][A-Z ]*$/i.test(kw)) return upper.includes(kw);
    return new RegExp(`(^|[^A-Z])${kw}([^A-Z]|$)`).test(upper);
  });
}

/** 按节点名生成地区 url-test 组 */
export function buildRegionGroups(nodes) {
  const groups = [];
  for (const region of REGION_TABLE) {
    const members = nodes.filter((node) => matchRegion(node.tag, region)).map((node) => node.tag);
    if (members.length === 0) continue;
    groups.push({
      type: "urltest",
      tag: region.name,
      outbounds: members,
      url: "http://www.gstatic.com/generate_204",
      interval: "5m",
      tolerance: 150,
    });
  }
  return groups;
}

/**
 * 把模板 + 节点装配成 sing-box 配置。
 *
 * - 去掉 inbounds：订阅只提供出站侧，入站交给客户端（SFI / Karing / Hiddify）。
 *   同时去掉 route.rules 里对 inbound 的限定，否则 sniff 规则会变成死规则。
 * - urltest 的 outbounds 用节点填满，业务 selector 保持模板原样。
 * - 地区组插在 自动选择 之后并挂进 节点选择。
 */
export function buildConfig(template, nodes) {
  const config = JSON.parse(JSON.stringify(template));
  const { outbounds: nodeOutbounds } = convertNodes(nodes);

  delete config.inbounds;

  const templateOutbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  const nodeTags = nodeOutbounds.map((item) => item.tag);

  for (const outbound of templateOutbounds) {
    if (outbound.type === "urltest" && (!Array.isArray(outbound.outbounds) || outbound.outbounds.length === 0)) {
      outbound.outbounds = nodeTags.slice();
    }
  }

  // Gemini 只走美国节点：模板里 outbounds 留空，这里按节点名筛出美国节点填入。
  // 不能直接引用 "\u{1F1FA}\u{1F1F8} 美国" 地区组——订阅里没有美国节点时
  // buildRegionGroups 不生成该组，引用会变成 outbound not found，sing-box 直接拒绝启动。
  const gemini = templateOutbounds.find((item) => item.tag === "Gemini");
  if (gemini) {
    const usRegion = REGION_TABLE.find((region) => region.name === "🇺🇸 美国");
    const usNodes = usRegion ? nodeOutbounds.filter((node) => matchRegion(node.tag, usRegion)) : [];
    gemini.outbounds = usNodes.map((node) => node.tag);
  }

  const regionGroups = buildRegionGroups(nodeOutbounds);
  const mainSelector = templateOutbounds.find((item) => item.type === "selector" && Array.isArray(item.outbounds));
  if (mainSelector && regionGroups.length > 0) {
    for (const group of regionGroups) {
      const directAt = mainSelector.outbounds.indexOf("direct");
      if (directAt >= 0) mainSelector.outbounds.splice(directAt, 0, group.tag);
      else mainSelector.outbounds.push(group.tag);
    }
  }

  // 节点排在 all 之前、selector 之后，避免 selector 引用顺序问题
  config.outbounds = [...templateOutbounds, ...nodeOutbounds, ...regionGroups];

  // 模板里 sniff 规则限定了 inbound，去掉限定后对所有入站生效
  if (Array.isArray(config.route?.rules)) {
    for (const rule of config.route.rules) delete rule.inbound;
  }

  return { config, nodeCount: nodeOutbounds.length };
}
