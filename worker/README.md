# worker/ — Loon「路由规则查看」记录后端

存 Loon 插件 `RuleLookup` 的查询结果，并在网页上看历史。跑在 Cloudflare Workers + D1 上。

```
POST /api/record    插件上报一条记录（需 LOOKUP_TOKEN）
GET  /api/records   记录列表 JSON（需 token，调试用）
GET  /              网页：最近 200 条 + 统计
```

## 结构

| 文件 | 说明 |
|---|---|
| `src/index.js` | Worker 入口：写入、查询、渲染网页，无第三方依赖 |
| `schema.sql` | D1 表 `lookup_record` 与索引 |
| `wrangler.toml` | Worker 名 `loon-rule-records`，D1 绑定名 `DB` |

## 首次部署

```bash
cd worker
wrangler d1 create loon-rule-records          # 把返回的 database_id 填进 wrangler.toml
wrangler d1 execute loon-rule-records --remote --file schema.sql
wrangler secret put LOOKUP_TOKEN              # 自己定一个足够长的随机串
wrangler deploy
```

部署后地址形如 `https://loon-rule-records.<你的子域>.workers.dev`。

## 接到 Loon 里

插件「路由规则查看」的两个参数：

| 参数 | 填什么 |
|---|---|
| `记录服务器` | Worker 地址，如 `https://loon-rule-records.rdone.workers.dev`（结尾不要带 `/`） |
| `记录密钥` | 与 `LOOKUP_TOKEN` 完全相同 |

两个都填了才会记录；留空则插件行为和以前一致，只弹通知。上报是「先展示、后发送」，失败只写日志（`RuleLookup: 记录上报 - 失败 …`），不影响查询结果，2.5 秒超时也不会卡住脚本。

> 密钥只存在 Loon 的插件设置里，**不要写进 `.lpx`**：本仓库是公开的，提交上去等于公开。

## 安全模型

- 没设置 `LOOKUP_TOKEN` 时一律拒绝写入（失败关闭），网页仍可读
- 写入要求 Bearer / `x-loon-token` 头，长度相等再做定长比较
- 单条 body 上限 64KB，`hits` 最多 40 条，各字段截断存储
- 网页是公开可读的（不含密钥），不想公开就在 Cloudflare 上加 Access 或把 Worker 关掉 workers.dev 路由

## 维护

```bash
# 清空记录
wrangler d1 execute loon-rule-records --remote --command "DELETE FROM lookup_record;"

# 只留最近 1000 条
wrangler d1 execute loon-rule-records --remote --command \
  "DELETE FROM lookup_record WHERE id NOT IN (SELECT id FROM lookup_record ORDER BY id DESC LIMIT 1000);"

# 换密钥（记得同步改 Loon 里的「记录密钥」）
wrangler secret put LOOKUP_TOKEN
```
