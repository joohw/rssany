-- RssAny Supabase Schema
-- 在 Supabase Dashboard → SQL Editor 中运行此文件完成建表

-- ─── items ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  url          TEXT UNIQUE NOT NULL,
  source_url   TEXT NOT NULL,
  title        TEXT,
  author       TEXT,          -- JSON 字符串数组，如 ["张三"]
  summary      TEXT,
  content      TEXT,
  image_url    TEXT,
  tags         TEXT,          -- JSON 字符串数组，如 ["AI","科技"]
  translations TEXT,          -- JSON 对象，如 {"zh-CN":{"title":"..."}}
  pub_date     TEXT,          -- ISO 8601 字符串
  fetched_at   TEXT NOT NULL, -- ISO 8601 字符串
  pushed_at    TEXT,          -- ISO 8601 字符串
  search_vector tsvector
);

CREATE INDEX IF NOT EXISTS idx_items_source  ON items(source_url);
CREATE INDEX IF NOT EXISTS idx_items_fetched ON items(fetched_at);
CREATE INDEX IF NOT EXISTS idx_items_pushed  ON items(pushed_at);
CREATE INDEX IF NOT EXISTS idx_items_fts     ON items USING GIN(search_vector);

-- FTS 触发器：title + summary + content + zh-CN 译文
CREATE OR REPLACE FUNCTION items_update_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.summary, '') || ' ' ||
    coalesce(NEW.content, '') || ' ' ||
    coalesce((NEW.translations::json)->>'zh-CN', '')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.search_vector := to_tsvector('simple',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.summary, '') || ' ' ||
    coalesce(NEW.content, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_search_trigger ON items;
CREATE TRIGGER items_search_trigger
BEFORE INSERT OR UPDATE OF title, summary, content, translations ON items
FOR EACH ROW EXECUTE FUNCTION items_update_search_vector();

-- ─── logs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logs (
  id         BIGSERIAL PRIMARY KEY,
  level      TEXT NOT NULL,
  category   TEXT NOT NULL,
  message    TEXT NOT NULL,
  payload    TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_level_created  ON logs(level, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_source_created ON logs(source_url, created_at);

-- ─── users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  provider      TEXT NOT NULL DEFAULT 'local',
  provider_id   TEXT,
  rss_token     TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_rsstoken ON users(rss_token);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

-- ─── user_sources ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_sources (
  id      BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref     TEXT NOT NULL,
  label   TEXT,
  refresh TEXT,
  proxy   TEXT,
  cron    TEXT,
  weight  REAL,
  UNIQUE(user_id, ref)
);

CREATE INDEX IF NOT EXISTS idx_user_sources_user ON user_sources(user_id);

-- ─── user_channels ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_channels (
  channel_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  description TEXT,
  source_refs TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_user_channels_user ON user_channels(user_id);

-- ─── user_items ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_items (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id   TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  pushed_at TEXT,
  read_at   TEXT,
  PRIMARY KEY(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_items_user ON user_items(user_id);

-- ─── user_email_reports ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_email_reports (
  id           BIGSERIAL PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  channel_ids  TEXT,
  schedule     TEXT NOT NULL DEFAULT '0 8 * * *',
  last_sent_at TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  mode         TEXT NOT NULL DEFAULT 'digest',
  extra_prompt TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_email_reports_user ON user_email_reports(user_id);

-- ─── RPC 函数 ─────────────────────────────────────────────────────────────────

-- get_source_stats：每个信源的条目数量与最近更新
CREATE OR REPLACE FUNCTION get_source_stats()
RETURNS TABLE(source_url TEXT, count BIGINT, latest_at TEXT) AS $$
  SELECT
    source_url,
    COUNT(*)::BIGINT AS count,
    MAX(COALESCE(pub_date, fetched_at)) AS latest_at
  FROM items
  GROUP BY source_url
  ORDER BY count DESC;
$$ LANGUAGE sql STABLE;

-- remove_tag_from_all_items：从所有条目中移除指定标签，返回更新条数
CREATE OR REPLACE FUNCTION remove_tag_from_all_items(p_tag TEXT)
RETURNS INT AS $$
DECLARE v_count INT;
BEGIN
  UPDATE items
  SET tags = (
    SELECT CASE
      WHEN count(*) = 0 THEN NULL
      ELSE json_agg(t)::TEXT
    END
    FROM json_array_elements_text(tags::json) AS t
    WHERE LOWER(TRIM(t)) != LOWER(TRIM(p_tag))
  )
  WHERE tags IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM json_array_elements_text(tags::json) AS t
      WHERE LOWER(TRIM(t)) = LOWER(TRIM(p_tag))
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- query_items：通用条目查询（支持 FTS、tag 过滤、多信源）
CREATE OR REPLACE FUNCTION query_items(
  p_source_url  TEXT    DEFAULT NULL,
  p_source_urls TEXT[]  DEFAULT NULL,
  p_author      TEXT    DEFAULT NULL,
  p_q           TEXT    DEFAULT NULL,
  p_tags        TEXT[]  DEFAULT NULL,
  p_since       TEXT    DEFAULT NULL,
  p_until       TEXT    DEFAULT NULL,
  p_limit       INT     DEFAULT 20,
  p_offset      INT     DEFAULT 0
)
RETURNS TABLE(
  id TEXT, url TEXT, source_url TEXT, title TEXT, author TEXT,
  summary TEXT, content TEXT, image_url TEXT, tags TEXT,
  translations TEXT, pub_date TEXT, fetched_at TEXT, pushed_at TEXT,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT i.*,
      COUNT(*) OVER() AS cnt
    FROM items i
    WHERE
      (p_source_url IS NULL OR i.source_url = p_source_url)
      AND (p_source_urls IS NULL OR i.source_url = ANY(p_source_urls))
      AND (p_author IS NULL OR i.author ILIKE '%' || p_author || '%')
      AND (p_q IS NULL OR i.search_vector @@ plainto_tsquery('simple', p_q))
      AND (p_tags IS NULL OR (
        i.tags IS NOT NULL AND (
          SELECT bool_or(LOWER(TRIM(t)) = ANY(
            SELECT LOWER(TRIM(unnest)) FROM unnest(p_tags)
          ))
          FROM json_array_elements_text(i.tags::json) AS t
        )
      ))
      AND (p_since IS NULL OR COALESCE(i.pub_date, i.fetched_at) >= p_since)
      AND (p_until IS NULL OR COALESCE(i.pub_date, i.fetched_at) < p_until)
    ORDER BY COALESCE(i.pub_date, i.fetched_at) DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    f.id, f.url, f.source_url, f.title, f.author, f.summary,
    f.content, f.image_url, f.tags, f.translations, f.pub_date,
    f.fetched_at, f.pushed_at, f.cnt
  FROM filtered f;
END;
$$ LANGUAGE plpgsql STABLE;
