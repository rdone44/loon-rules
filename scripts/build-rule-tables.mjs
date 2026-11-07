// 由 rules/exceptions.csv 生成各客户端所需的规则表。
// 只做格式转换，不判断业务；策略组名直接取自 CSV 第三列。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "rules", "exceptions.csv");
const outDir = join(root, "rules", "generated");

const ALLOWED = new Set(["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD"]);
// 策略组名用于文件名，只保留 ASCII 安全字符
const SLUGS = { AppleID: "appleid", MissAV: "missav", AI: "ai", 全球拦截: "adblock" };

const rows = [];
const errors = [];
for (const line of readFileSync(source, "utf8").split(/\r?\n/)) {
  const text = line.trim();
  if (!text || text.startsWith("#")) continue;
  const parts = text.split(",").map((item) => item.trim());
  if (parts.length !== 3) {
    errors.push(`列数应为 3：${text}`);
    continue;
  }
  const [type, value, policy] = parts;
  if (!ALLOWED.has(type)) {
    errors.push(`不支持的规则类型 ${type}：${text}`);
    continue;
  }
  if (!value) {
    errors.push(`规则值为空：${text}`);
    continue;
  }
  if (!SLUGS[policy]) {
    errors.push(`未登记的策略组 ${policy}：${text}`);
    continue;
  }
  rows.push({ type, value, policy });
}

if (errors.length > 0) {
  console.error(`源表有问题，未生成任何文件：\n${errors.join("\n")}`);
  process.exit(1);
}

const groups = new Map();
for (const row of rows) {
  const key = row.policy;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

// 同一规则出现在多个策略组时，先出现者生效；后续客户端匹配顺序与此一致
const seen = new Map();
for (const row of rows) {
  const key = `${row.type}|${row.value}`;
  const first = seen.get(key);
  if (first && first !== row.policy) {
    console.error(`同一规则被分到不同策略组：${key}（${first} / ${row.policy}）`);
    process.exit(1);
  }
  seen.set(key, row.policy);
}

/** Loon / Shadowrocket / mihomo 共用的文本格式 */
function toText(slug, entries) {
  return entries.map((row) => `${row.type},${row.value}`).join("\n") + "\n";
}

/** sing-box source 格式；按类型合并同组条目 */
function toSingbox(entries) {
  const domains = [];
  const suffixes = [];
  const keywords = [];
  for (const row of entries) {
    if (row.type === "DOMAIN") domains.push(row.value);
    else if (row.type === "DOMAIN-SUFFIX") suffixes.push(row.value);
    else keywords.push(row.value);
  }
  const rule = {};
  if (domains.length > 0) rule.domain = domains;
  if (suffixes.length > 0) rule.domain_suffix = suffixes;
  if (keywords.length > 0) rule.domain_keyword = keywords;
  return JSON.stringify({ version: 3, rules: [rule] }, null, 2) + "\n";
}

mkdirSync(outDir, { recursive: true });
const written = [];
for (const [policy, entries] of groups) {
  const slug = SLUGS[policy];
  writeFileSync(join(outDir, `${slug}.list`), toText(slug, entries));
  writeFileSync(join(outDir, `${slug}.json`), toSingbox(entries));
  written.push(`${slug}: ${entries.length} 条`);
}
console.log(`由 ${rows.length} 条源规则生成 ${groups.size} 个策略组：\n${written.join("\n")}`);
