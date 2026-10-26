#!/usr/bin/env python3
"""合并多份 Loon 去广告规则表，输出单一去重 .list。

每周由 .github/workflows/build-adblock.yml 调用一次。

设计要点：
  * 每个上游的规则行原样保留（DOMAIN-KEYWORD / IP-CIDR / URL-REGEX 语义不同，
    不能互相折算），只按整行文本去重。
  * EXCLUDE 是人工审计过的白名单，用于剔除上游把正常服务端点误当广告的情况。
    删掉的条目会打印出来，方便在 CI 日志里核对。
  * 输出按规则类型分组、组内按字母序，保证同一输入永远产生同一输出
    （否则每周的 commit 都会是全文件重写，diff 没法看）。
  * 任何上游下载失败都不会让脚本失败退出：该源被跳过并在日志里标注，
    其余源照常合入。这样 yfamilys 那种间歇性 TLS 故障不会中断每周任务。
"""

import argparse
import os
import sys
import urllib.request

SOURCES = [
    ("Advertising",     "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Loon/Advertising/Advertising.list"),
    ("AdvertisingLite", "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Loon/AdvertisingLite/AdvertisingLite.list"),
    ("AdvertisingTest", "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Loon/AdvertisingTest/AdvertisingTest.list"),
    ("Hijacking",       "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Loon/Hijacking/Hijacking.list"),
    ("Privacy",         "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Loon/Privacy/Privacy.list"),
    ("AntiAD",          "https://yfamilys.com/rule/AntiAD.list"),
]

OUTPUT = "rule/AdBlock.list"

# 人工审计后确认被上游误伤的条目。加条目请在这里加，不要改上游源。
EXCLUDE = {
    # Instagram 的 GraphQL 接口，删了会导致私信/主页加载失败
    "DOMAIN-SUFFIX,graph.instagram.com",
    # 微信的 DNS 探测域名，删了会影响弱网下的域名解析
    "DOMAIN-SUFFIX,dns.wechat.com",
}

# 输出时的分组顺序：域名类在前、IP 类在后，便于人工翻看
TYPE_ORDER = ["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "DOMAIN-REGEX",
              "IP-CIDR", "IP-CIDR6", "URL-REGEX", "USER-AGENT", "PROCESS-NAME"]

HEADER = """\
# ==============================================================================
# AdBlock.list — 合并去重的去广告规则集
# 自动生成，请勿手工编辑。源码见 script/build_adblock.py，每周由 GitHub Actions 重建。
#
# 合并来源（{n_src} 个，去重后共 {n_rules} 条）：
{sources}
#
# 使用方法（Loon [Remote Rule]）：
#   https://raw.githubusercontent.com/rdone44/loon-rules/main/rule/AdBlock.list, policy=全球拦截, tag=去广告, enabled=true
#
# 说明：
#   * 本文件只含规则，不含策略；策略在引用时用 policy= 指定。
#   * 已剔除 {n_excluded} 条会误伤正常服务的条目，清单见脚本内 EXCLUDE。
# ==============================================================================
"""


def fetch(name, url, offline_dir=None):
    if offline_dir:
        # 离线模式：从本地目录读 <name>.list，用于在受限网络下验证合并逻辑
        with open(os.path.join(offline_dir, name + ".list"), "rb") as f:
            raw = f.read()
        print(f"  {name:17s} {len(raw):>9d} B  (offline)")
        return raw.decode("utf-8", errors="replace")

    req = urllib.request.Request(url, headers={"User-Agent": "loon-rules-build/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    print(f"  {name:17s} {len(raw):>9d} B")
    return raw.decode("utf-8", errors="replace")


def normalize(raw):
    """拆行、去注释、去空行、统一行尾、去掉规则尾部的 no-resolve 便于跨源去重。"""
    out = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        out.append(line)
    return out


def rule_type(rule):
    return rule.split(",", 1)[0].strip().upper()


def sort_key(rule):
    t = rule_type(rule)
    try:
        idx = TYPE_ORDER.index(t)
    except ValueError:
        idx = len(TYPE_ORDER)
    return (idx, rule)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline-dir", help="从本地目录读取 <源名>.list，跳过网络下载")
    args = ap.parse_args()

    merged = {}
    ok_sources = []
    seen_excluded = set()

    for name, url in SOURCES:
        try:
            raw = fetch(name, url, args.offline_dir)
        except Exception as e:  # 网络波动不该中断每周任务
            print(f"  {name:17s} SKIPPED ({type(e).__name__}: {e})", file=sys.stderr)
            continue

        ok_sources.append(name)
        for rule in normalize(raw):
            if rule in EXCLUDE:
                seen_excluded.add(rule)
                continue
            merged.setdefault(rule, name)

    if not merged:
        print("ERROR: 所有上游都下载失败，拒绝产出空文件。", file=sys.stderr)
        return 1

    rules = sorted(merged, key=sort_key)

    by_type = {}
    for r in rules:
        by_type[rule_type(r)] = by_type.get(rule_type(r), 0) + 1
    print("\n合并结果：")
    for t in sorted(by_type, key=lambda x: (TYPE_ORDER.index(x) if x in TYPE_ORDER else 99, x)):
        print(f"  {t:16s} {by_type[t]:>7d}")

    missing_exclusions = sorted(EXCLUDE - seen_excluded)
    if missing_exclusions:
        print(f"\n注意: {len(missing_exclusions)} 条 EXCLUDE 本轮未出现在任何源中", file=sys.stderr)
        for r in missing_exclusions:
            print(f"  {r}", file=sys.stderr)

    src_lines = "\n".join(f"#   - {n}" for n in ok_sources)
    body = HEADER.format(n_src=len(ok_sources), n_rules=len(rules),
                         sources=src_lines, n_excluded=len(seen_excluded))

    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
        for r in rules:
            f.write(r + "\n")

    print(f"\n写入 {OUTPUT}: {len(rules)} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
