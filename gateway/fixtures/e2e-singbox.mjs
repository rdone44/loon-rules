/**
 * 端到端：跑完整 Worker 请求链拿到 /singbox 的真实响应，
 * 再交给官方 sing-box 1.14.4 的 `check` 验证。
 * 需要 SINGBOX_CLI 环境变量指向 sing-box 可执行文件。
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import worker from "../src/index.js";

const CLI = process.env.SINGBOX_CLI;
if (!CLI) {
  console.log("SKIP: 未设置 SINGBOX_CLI，跳过真内核校验");
  process.exit(0);
}

const b64 = (text) => Buffer.from(text, "utf8").toString("base64");

const TEMPLATE = {
  log: { level: "info", timestamp: true },
  dns: {
    servers: [
      { tag: "dns-remote", type: "https", server: "doh.pub", detour: "🚀 节点选择" },
      { tag: "dns-direct", type: "local" },
    ],
    final: "dns-remote",
  },
  inbounds: [{ type: "tun", tag: "tun-in", address: ["172.19.0.1/30"], auto_route: true }],
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
      { domain_suffix: [".openai.com"], outbound: "🤖 AI 服务" },
    ],
  },
  experimental: { cache_file: { enabled: true } },
};

const CLASH_TEMPLATE = `mixed-port: 7890
proxies: []
proxy-groups:
  - name: 🚀 节点选择
    type: select
    use: [remote]
    proxies: [DIRECT]
rules:
  - MATCH,🚀 节点选择
rule-providers: {}
proxy-providers:
  remote:
    type: http
    url: https://old.example.com/provider/YOUR-PROFILE-ID
    interval: 3600
    path: ./providers/remote.yaml
`;

// 覆盖各协议 + 各地区的节点，含一个必须被拒的 ssr
const SUBSCRIPTION = [
  `ss://${b64("aes-256-gcm:pw")}@203.0.113.10:8388#${encodeURIComponent("🇭🇰 香港 01")}`,
  `ss://${b64("chacha20-ietf-poly1305:pw")}@203.0.113.11:8388#${encodeURIComponent("🇭🇰 香港 02")}`,
  "trojan://pw@203.0.113.12:443?sni=h.example#" + encodeURIComponent("🇯🇵 日本 01"),
  "vless://b831381d-6324-4d53-ad4f-8cda48b30811@203.0.113.13:443?type=ws&security=tls&sni=h.example&path=%2Fws#" + encodeURIComponent("🇯🇵 日本 02"),
  "hysteria2://pw@203.0.113.14:443?sni=h.example#" + encodeURIComponent("🇺🇸 美国 01"),
  "tuic://b831381d-6324-4d53-ad4f-8cda48b30811:pw@203.0.113.15:443?sni=h.example#" + encodeURIComponent("🇺🇸 美国 02"),
  "socks5://u:p@203.0.113.16:1080#" + encodeURIComponent("🇸🇬 新加坡 01"),
  // ssr → 必须被跳过
  "ssr://" + Buffer.from("203.0.113.17:8388:origin:aes-256-cfb:plain:" + Buffer.from("pw").toString("base64") + "/?remarks=" + Buffer.from("🇹🇼 台湾 01").toString("base64")).toString("base64url"),
].join("\n");

const store = new Map();
const env = {
  ACCESS_TOKEN: "test-token",
  CONFIG_URL: "https://example.com/clash.json",
  CONFIG_SINGBOX_URL: "https://example.com/singbox.json",
  CACHE_TTL: "0",
  PROFILES: {
    async get(key) { return store.get(key) ?? null; },
    async put(key, value) { store.set(key, String(value)); },
    async delete(key) { store.delete(key); },
  },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("singbox.json")) {
    return new Response(JSON.stringify(TEMPLATE), { status: 200 });
  }
  if (url.includes("clash.json")) {
    return new Response(CLASH_TEMPLATE, { status: 200 });
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
      config: "https://example.com/clash.json",
      singbox: "https://example.com/singbox.json",
      url: "https://provider.example.com/sub",
    }),
  }),
  env,
  ctx,
);
if (!response.ok) throw new Error("save settings failed: " + (await response.text()));

response = await worker.fetch(new Request(`${base}/singbox?token=test-token`), env, ctx);
if (!response.ok) throw new Error("singbox failed: " + (await response.text()));

const body = await response.text();
writeFileSync(process.env.TEMP + "/gateway-singbox.json", body);
const config = JSON.parse(body);

const nodeOutbounds = config.outbounds.filter(
  (o) => !["selector", "urltest", "direct", "block"].includes(o.type),
);
console.log("端到端生成:");
console.log("  节点数:", nodeOutbounds.length, "->", nodeOutbounds.map((o) => o.tag).join(", "));
console.log("  inbounds:", config.inbounds === undefined ? "已移除" : "存在");
console.log("  自动选择成员:", config.outbounds.find((o) => o.type === "urltest").outbounds.length);

const clashConfig = parseYaml(await (await worker.fetch(new Request(`${base}/sub?token=test-token`), env, ctx)).text());
console.log("  Clash 侧节点数:", clashConfig.proxies?.length);

let output;
try {
  output = execFileSync(CLI, ["check", "-D", process.env.TEMP, "-c", process.env.TEMP + "/gateway-singbox.json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  console.log("\n== 真内核校验 ==");
  console.log("FAIL");
  console.log((error.stderr || error.stdout || String(error)).replace(/\x1b\[[0-9;]*m/g, "").trim().slice(0, 400));
  process.exitCode = 1;
  process.exit();
}

console.log("\n== 真内核校验 ==");
console.log("PASS（sing-box check 退出码 0）");
