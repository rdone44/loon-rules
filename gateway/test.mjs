import { parse } from "yaml";
import worker from "./src/index.js";

const b64 = (text) => Buffer.from(text, "utf8").toString("base64");

const makeConfig = (extraGroup) => `mixed-port: 7890
proxies: []
proxy-groups:
  - name: 🚀 节点选择
    type: select
    use: [remote]
    proxies: [DIRECT]
${extraGroup ? `  - name: ${extraGroup}\n    type: select\n    use: [remote]\n    proxies: [DIRECT]\n` : ""}rules:
  - MATCH,🚀 节点选择
rule-providers:
  ai:
    type: http
    behavior: domain
    format: mrs
    url: https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/openai.mrs
    path: ./ruleset/ai.mrs
    interval: 86400
proxy-providers:
  remote:
    type: http
    url: https://old.example.com/provider/YOUR-PROFILE-ID
    interval: 3600
    path: ./providers/remote.yaml
`;

let currentConfig = makeConfig("");

const SINGBOX_TEMPLATE = {
  log: { level: "info", timestamp: true },
  dns: {
    servers: [
      { tag: "dns-remote", type: "https", server: "doh.pub", detour: "🚀 节点选择" },
      { tag: "dns-direct", type: "local" },
    ],
    final: "dns-remote",
  },
  inbounds: [
    { type: "tun", tag: "tun-in", address: ["172.19.0.1/30"], auto_route: true },
  ],
  outbounds: [
    { type: "selector", tag: "🚀 节点选择", outbounds: ["♻️ 自动选择", "direct"] },
    { type: "urltest", tag: "♻️ 自动选择", outbounds: [], url: "https://www.gstatic.com/generate_204" },
    { type: "selector", tag: "🤖 AI 服务", outbounds: ["♻️ 自动选择", "direct"] },
    { type: "direct", tag: "direct" },
  ],
  route: {
    auto_detect_interface: true,
    default_domain_resolver: "dns-direct",
    final: "🚀 节点选择",
    rules: [
      { inbound: "tun-in", action: "sniff" },
      { rule_set: "ai", outbound: "🤖 AI 服务" },
    ],
  },
  experimental: { cache_file: { enabled: true } },
};

const SUBSCRIPTION = [
  `ss://${b64("aes-256-gcm:pw")}@203.0.113.10:8388#Test-A`,
  "trojan://pw@203.0.113.11:443#Test-B",
  `ss://${b64("aes-256-gcm:pw")}@203.0.113.12:8388#${encodeURIComponent("🇭🇰 香港 01")}`,
  `ss://${b64("aes-256-gcm:pw")}@203.0.113.13:8388#${encodeURIComponent("🇯🇵 日本 01")}`,
].join("\n");

// 带地区名的节点，用于验证 sing-box 侧地区组

const store = new Map();
const env = {
  ACCESS_TOKEN: "test-token",
  SUBSCRIPTION_URL: "",
  CONFIG_URL: "https://example.com/config-a.yaml",
  CONFIG_SINGBOX_URL: "https://example.com/singbox-a.json",
  CACHE_TTL: "0",
  PROFILES: {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async delete(key) {
      store.delete(key);
    },
  },
};

const ctx = { waitUntil() {}, passThroughOnException() {} };

let singboxTemplateFetches = 0;
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("config-a.yaml")) {
    return new Response(currentConfig, { status: 200, headers: { "content-type": "text/yaml" } });
  }
  if (url.includes("singbox-a.json")) {
    singboxTemplateFetches += 1;
    return new Response(JSON.stringify(SINGBOX_TEMPLATE), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("provider.example.com")) {
    return new Response(b64(SUBSCRIPTION), { status: 200 });
  }
  return new Response("unexpected " + url, { status: 500 });
};

const base = "https://gateway.example.com";
const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

let response = await worker.fetch(
  new Request(`${base}/api/settings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      config: "https://example.com/config-a.yaml",
      url: "https://provider.example.com/sub",
    }),
  }),
  env,
  ctx,
);
console.log("save settings:", response.status, await response.text());

response = await worker.fetch(new Request(`${base}/api/settings`, { headers }), env, ctx);
console.log("get settings:", response.status, await response.text());

response = await worker.fetch(new Request(`${base}/sub?token=test-token`), env, ctx);
let config = parse(await response.text());
console.log(
  "sub:",
  response.status,
  "| proxies:",
  config.proxies?.length,
  "| groups with use:",
  (config["proxy-groups"] || []).filter((g) => g.use).length,
  "| provider block:",
  Boolean(config["proxy-providers"]),
  "| rules remote:",
  config["rule-providers"].ai.url.startsWith("https://"),
);

response = await worker.fetch(new Request(`${base}/provider?token=test-token`), env, ctx);
console.log("provider:", response.status, "| nodes:", parse(await response.text()).proxies.map((p) => p.name).join(", "));

/* ---- sing-box 订阅 ---- */
response = await worker.fetch(new Request(`${base}/singbox?token=test-token`), env, ctx);
const sbConfig = JSON.parse(await response.text());
const sbUrltest = sbConfig.outbounds.find((o) => o.type === "urltest");
const sbRegion = sbConfig.outbounds.filter((o) => o.type === "urltest" && o.tag !== sbUrltest.tag);
console.log(
  "singbox:",
  response.status,
  "| content-type:",
  response.headers.get("content-type"),
  "| nodes:",
  sbConfig.outbounds.filter((o) => !["selector", "urltest", "direct", "block"].includes(o.type)).length,
  "| inbounds:",
  sbConfig.inbounds === undefined ? "removed" : "present",
  "| 自动选择 members:",
  sbUrltest.outbounds.length,
  "| 地区组:",
  sbRegion.length,
  "| 绑定 inbound 的规则:",
  (sbConfig.route.rules || []).filter((r) => r.inbound).length,
);

const assetProblems = [];
const check = (condition, label) => { if (!condition) assetProblems.push(label); };
check(response.status === 200, "singbox 状态码非 200");
check(response.headers.get("content-type").includes("json"), "singbox content-type 不是 json");
check(sbConfig.inbounds === undefined, "singbox 配置没有去掉 inbounds");
check(sbUrltest.outbounds.length > 0, "singbox 自动选择没有成员");
check(sbRegion.length > 0, "singbox 没有生成地区组（节点名含 🇭🇰/🇯🇵）");
check(
  sbConfig.outbounds.some((o) => o.tag === "🇭🇰 香港") && sbConfig.outbounds.some((o) => o.tag === "🇯🇵 日本"),
  "地区组未按节点名生成",
);
const sbMain = sbConfig.outbounds.find((o) => o.tag === "🚀 节点选择");
for (const group of sbRegion) {
  check(sbMain.outbounds.includes(group.tag), `地区组 ${group.tag} 未挂进 节点选择`);
}
check((sbUrltest.outbounds || []).every((tag) => sbConfig.outbounds.some((o) => o.tag === tag)), "自动选择引用了不存在的 tag");
check((sbConfig.route.rules || []).every((r) => !r.inbound), "singbox 规则仍限定 inbound");
check((sbConfig.route.rules || []).some((r) => r.action === "sniff"), "singbox 缺少 sniff 规则");
for (const group of sbRegion) {
  check(group.outbounds.length > 0, `地区组 ${group.tag} 没有成员`);
  check(group.outbounds.every((tag) => sbConfig.outbounds.some((o) => o.tag === tag)), `地区组 ${group.tag} 引用了不存在的 tag`);
}

// Satelite 的订阅解析只需要真实出站节点，不能包含策略组或内置出口。
const templateFetchesBeforeNodes = singboxTemplateFetches;
response = await worker.fetch(new Request(`${base}/singbox?token=test-token&format=nodes`), env, ctx);
const sateliteConfig = await response.json();
const expectedNodes = sbConfig.outbounds.filter((outbound) => typeof outbound.server === "string");
check(response.status === 200, `sing-box 节点订阅返回 ${response.status}`);
check(response.headers.get("content-type")?.includes("application/json"), "节点订阅不是 JSON");
check(response.headers.get("cache-control") === "no-store", "节点订阅应禁止缓存");
check(Object.keys(sateliteConfig).length === 1 && Array.isArray(sateliteConfig.outbounds), "节点订阅应只包含 outbounds 数组");
check(JSON.stringify(sateliteConfig.outbounds) === JSON.stringify(expectedNodes), "节点订阅与完整配置中的实际节点不一致");
check(sateliteConfig.outbounds.every((outbound) => typeof outbound.server === "string"), "节点订阅包含策略组或内置出口");
check(Number(response.headers.get("x-node-count")) === expectedNodes.length, "节点订阅数量头不正确");
check(singboxTemplateFetches === templateFetchesBeforeNodes, "节点订阅不应依赖完整配置模板");

// 无 token 必须 401，节点订阅同样需要认证。
response = await worker.fetch(new Request(`${base}/singbox`), env, ctx);
check(response.status === 401, `singbox 无 token 返回 ${response.status}，应为 401`);
response = await worker.fetch(new Request(`${base}/singbox?format=nodes`), env, ctx);
check(response.status === 401, `singbox 节点订阅无 token 返回 ${response.status}，应为 401`);

currentConfig = makeConfig("🆕 新分组");
response = await worker.fetch(new Request(`${base}/sub?token=test-token`), env, ctx);
config = parse(await response.text());
console.log("hot update:", response.status, "| new group:", config["proxy-groups"].some((g) => g.name === "🆕 新分组"));

response = await worker.fetch(
  new Request(`${base}/api/settings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ config: "https://example.com/config-a.yaml", url: "http://127.0.0.1/sub" }),
  }),
  env,
  ctx,
);
console.log("private url:", response.status, await response.text());

response = await worker.fetch(
  new Request(`${base}/api/settings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config: "https://example.com/config-a.yaml", url: "https://provider.example.com/sub" }),
  }),
  env,
  ctx,
);
console.log("no token:", response.status);

response = await worker.fetch(
  new Request(`${base}/api/settings`, { method: "DELETE", headers }),
  env,
  ctx,
);
console.log("clear:", response.status);

response = await worker.fetch(new Request(`${base}/provider?token=test-token`), env, ctx);
console.log("provider after clear:", response.status);

const page = await worker.fetch(new Request(`${base}/`), env, ctx);
const html = await page.text();
console.log("page:", page.status, "| form:", html.includes('id="token"'), "| csp script:", (page.headers.get("content-security-policy") || "").includes("script-src"));

/* ---- 汇总 ---- */
console.log("\n== 结果 ==");
if (assetProblems.length === 0) {
  console.log("PASS");
} else {
  console.log("FAIL");
  for (const problem of assetProblems) console.log("  - " + problem);
  process.exitCode = 1;
}
