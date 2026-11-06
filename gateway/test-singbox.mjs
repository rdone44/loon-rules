import { parse as parseYaml } from "yaml";
import { readFile } from "node:fs/promises";
import { buildConfig, buildRegionGroups, convertNodes, toOutbound } from "./src/singbox.js";

const template = JSON.parse(
  await readFile(new URL("../sing-box/config.json", import.meta.url), "utf8"),
);

/* 1) 单节点映射：每类都跑一遍，跳过的要给出原因 */
const cases = [
  { name: "hk-ss", type: "ss", server: "1.2.3.4", port: 8388, cipher: "aes-256-gcm", password: "pw" },
  { name: "hk-ss-2022", type: "ss", server: "1.2.3.4", port: 8388, cipher: "2022-blake3-aes-128-gcm", password: "AAAAAAAAAAAAAAAAAAAAAA==" },
  { name: "hk-ss-obfs", type: "ss", server: "1.2.3.4", port: 8388, cipher: "aes-256-gcm", password: "pw", plugin: "obfs", "plugin-opts": { mode: "http", host: "h.example" } },
  { name: "hk-vmess-ws", type: "vmess", server: "1.2.3.4", port: 443, uuid: "b831381d-6324-4d53-ad4f-8cda48b30811", alterId: 0, cipher: "auto", network: "ws", tls: true, servername: "example.com", "ws-opts": { path: "/ray", headers: { Host: "example.com" } } },
  { name: "hk-vless-ws", type: "vless", server: "1.2.3.4", port: 443, uuid: "b831381d-6324-4d53-ad4f-8cda48b30811", network: "ws", tls: true, "ws-opts": { path: "/x" }, "client-fingerprint": "chrome" },
  { name: "hk-trojan-ws", type: "trojan", server: "1.2.3.4", port: 443, password: "pw", network: "ws", "ws-opts": { path: "/t" } },
  { name: "hk-hy2", type: "hysteria2", server: "1.2.3.4", port: 443, password: "pw", sni: "example.com" },
  { name: "hk-tuic", type: "tuic", server: "1.2.3.4", port: 443, uuid: "b831381d-6324-4d53-ad4f-8cda48b30811", password: "pw", "congestion-controller": "bbr", alpn: ["h3"] },
  { name: "hk-socks", type: "socks5", server: "1.2.3.4", port: 1080, username: "u", password: "p" },
  { name: "hk-ssr", type: "ssr", server: "1.2.3.4", port: 8388, cipher: "aes-256-cfb", password: "pw" },
  { name: "hk-vless-reality-badkey", type: "vless", server: "1.2.3.4", port: 443, uuid: "b831381d-6324-4d53-ad4f-8cda48b30811", network: "tcp", tls: true, "reality-opts": { "public-key": "AAAA", "short-id": "ab" } },
];

console.log("== 单节点映射 ==");
let mapped = 0;
let skipped = 0;
for (const node of cases) {
  const result = toOutbound(node);
  if (result.skip) {
    skipped += 1;
    console.log(`skip  ${node.name}  <-  ${result.skip}`);
  } else {
    mapped += 1;
    console.log(`ok    ${node.name}  ->  ${result.outbound.type}`);
  }
}

/* 2) 整份配置装配：节点填满 自动选择，地区组挂进 节点选择，inbounds 被去掉 */
const goodNodes = cases.map((node) => toOutbound(node)).filter((r) => r.outbound).map((r) => r.outbound);
const { config, nodeCount } = buildConfig(template, cases.filter((n) => !toOutbound(n).skip));

const nodeOutbounds = convertNodes(cases.filter((n) => !toOutbound(n).skip)).outbounds;
const expectedRegions = buildRegionGroups(nodeOutbounds).map((group) => group.tag);

const urltest = config.outbounds.find((o) => o.type === "urltest");
const nodeSelector = config.outbounds.find((o) => o.tag === "节点选择");
const regionGroups = config.outbounds.filter((o) => expectedRegions.includes(o.tag));

console.log("\n== 整份配置 ==");
console.log("inbounds 已移除:", config.inbounds === undefined);
console.log("节点数:", nodeCount, "| 跳过:", skipped, "| 映射成功:", mapped);
console.log("自动选择 outbounds 数量:", urltest.outbounds.length, "(应等于节点数)");
console.log("节点选择 outbounds:", JSON.stringify(nodeSelector.outbounds));
console.log("地区组数量:", regionGroups.length, "->", regionGroups.map((g) => g.tag).join(" "));
console.log("route.rules 里还有 inbound 限定:", config.route.rules.filter((r) => r.inbound).length);

/* 3) 断言：不通过就非零退出 */
const problems = [];
if (config.inbounds !== undefined) problems.push("inbounds 未移除");
if (urltest.outbounds.length !== nodeCount) problems.push("urltest 未填满");
if (regionGroups.length === 0) problems.push("没有生成地区组");
if (config.route.rules.some((r) => r.inbound)) problems.push("route.rules 仍限定 inbound");
if (nodeSelector.outbounds.includes("自动选择") === false) problems.push("节点选择丢失模板成员");
for (const group of regionGroups) {
  if (!nodeSelector.outbounds.includes(group.tag)) problems.push(`地区组 ${group.tag} 未挂进节点选择`);
  if (!Array.isArray(group.outbounds) || group.outbounds.length === 0) problems.push(`地区组 ${group.tag} 没有成员`);
}
if (nodeCount !== goodNodes.length) problems.push("节点数与映射结果不一致");

console.log("\n== 结果 ==");
if (problems.length === 0) {
  console.log("PASS");
} else {
  console.log("FAIL");
  for (const problem of problems) console.log("  - " + problem);
  process.exitCode = 1;
}
