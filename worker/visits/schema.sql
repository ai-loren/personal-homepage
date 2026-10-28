-- 旅人：浏览器第一次来时生成的随机 ID，一个浏览器一行。
CREATE TABLE IF NOT EXISTS travelers (
  id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  visits INTEGER NOT NULL
);

-- 每次到访一行：只记国家/地区和来源站点，不记 IP。
CREATE TABLE IF NOT EXISTS visits (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  traveler TEXT NOT NULL,
  at INTEGER NOT NULL,
  country TEXT NOT NULL,
  referrer TEXT NOT NULL
);

-- 页面上的两个总数。和上面两张表在同一个事务里更新，读它不用扫表。
CREATE TABLE IF NOT EXISTS totals (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO totals (name, value) VALUES ('travelers', 0), ('visits', 0);

-- 同一来源当天能登记多少个新旅人。source 是「当天随机盐 + IP」的哈希，第二天盐换掉就对不上了。
CREATE TABLE IF NOT EXISTS arrivals (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, source)
);

CREATE TABLE IF NOT EXISTS salts (
  day TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
