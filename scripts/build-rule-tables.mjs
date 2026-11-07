// 由 rules/*.csv 生成各客户端所需的规则表。
// 只做格式转换，不判断业务；策略组名取自 CSV 第三列，无策略列的源表输出为固定文件名。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "rules", "generated");

const ALLOWED = new Set(["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD"]);
// 策略组名用于文件名，只保留 ASCII 安全字符
const SLUGS = { AppleID: "appleid", MissAV: "missav", AI: "ai", 全球拦截: "adblock", 节点选择: "node-select", 加密货币: "crypto" };

// policyColumn=false 的源表不带策略列，输出固定 slug
const SOURCES = [
  { file: "exceptions.csv", policyColumn: true },
  { file: "personal.csv", policyColumn: false, slug: "personal" },
];

const errors = [];

/** 读一张源表，返回条目；列数问题写入 errors */
function readSource(spec) {
  const rows = [];
  const source = join(root, "rules", spec.file);
  for (const line of readFileSync(source, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const parts = text.split(",").map((item) => item.trim());
    const expected = spec.policyColumn ? 3 : 2;
    if (parts.length !== expected) {
      errors.push(`${spec.file} 列数应为 ${expected}：${text}`);
      continue;
    }
    const [type, value, policy] = parts;
    if (!ALLOWED.has(type)) {
      errors.push(`${spec.file} 不支持的规则类型 ${type}：${text}`);
      continue;
    }
    if (!value) {
      errors.push(`${spec.file} 规则值为空：${text}`);
      continue;
    }
    if (spec.policyColumn && !SLUGS[policy]) {
      errors.push(`${spec.file} 未登记的策略组 ${policy}：${text}`);
      continue;
    }
    rows.push(spec.policyColumn ? { type, value, policy } : { type, value, slug: spec.slug });
  }
  return rows;
}

/** Loon / Shadowrocket / mihomo 共用的文本格式 */
function toText(entries) {
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

// 先读全部源表，有任何问题就不写任何文件，避免半个状态
const all = new Map();
for (const spec of SOURCES) {
  for (const row of readSource(spec)) {
    const slug = spec.policyColumn ? SLUGS[row.policy] : row.slug;
    if (!all.has(slug)) all.set(slug, []);
    all.get(slug).push(row);
  }
}

if (errors.length > 0) {
  console.error(`源表有问题，未生成任何文件：\n${errors.join("\n")}`);
  process.exit(1);
}

// 同一规则出现在多个策略组时，先出现者生效；后续客户端匹配顺序与此一致
const seen = new Map();
for (const rows of all.values()) {
  for (const row of rows) {
    const key = `${row.type}|${row.value}`;
    const first = seen.get(key);
    const slug = row.slug ?? SLUGS[row.policy];
    if (first && first !== slug) {
      console.error(`同一规则被分到不同策略组：${key}（${first} / ${slug}）`);
      process.exit(1);
    }
    seen.set(key, slug);
  }
}

mkdirSync(outDir, { recursive: true });
const written = [];
for (const [slug, rows] of all) {
  writeFileSync(join(outDir, `${slug}.list`), toText(rows));
  writeFileSync(join(outDir, `${slug}.json`), toSingbox(rows));
  written.push(`${slug}: ${rows.length} 条`);
}
console.log(`由 ${[...all.values()].reduce((sum, rows) => sum + rows.length, 0)} 条源规则生成 ${all.size} 张表：\n${written.join("\n")}`);
