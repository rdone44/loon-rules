-- Loon「路由规则查看」插件的查询记录
CREATE TABLE IF NOT EXISTS lookup_record (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,  -- ISO8601，来自客户端；格式不合法时用服务器时间
  mode       TEXT NOT NULL,  -- 查域名 / 结构概览 / 全量体检
  target     TEXT NOT NULL,  -- 查询的域名或 IP，概览类为空
  policy     TEXT,           -- 生效策略
  list_name  TEXT,           -- 生效规则所在的规则表
  rule       TEXT,           -- 命中的原始规则行
  hits       TEXT,           -- JSON: [{list, policy, rule}]，第 0 条为生效规则
  extra      TEXT,           -- JSON: 体检/概览的附加摘要
  client     TEXT            -- 上报方 User-Agent
);

CREATE INDEX IF NOT EXISTS idx_lookup_created ON lookup_record (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lookup_target  ON lookup_record (target);
CREATE INDEX IF NOT EXISTS idx_lookup_policy  ON lookup_record (policy);
