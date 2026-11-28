-- ====================================================================
-- 云上电竞酒店管理系统 PMS · Cloudflare D1 完整关系型数据库结构 (13张表)
-- 包含：真实账号密码表(users)、登录会话表(user_sessions)、外设图片存储(img_data)及全业务表
-- ====================================================================


cfut_ZfibsAjNuW72LkdkvuWAxr0s4XFfwJTBOBwOLIdecef7f8ab


PRAGMA foreign_keys = ON;

-- 1. 员工与管理员真实账号密码表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'cashier')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 2. 登录会话令牌表（7天有效期）
CREATE TABLE IF NOT EXISTS user_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- 3. 系统配置与旅馆业网页抓取配置表
CREATE TABLE IF NOT EXISTS system_config (
  cfg_key TEXT PRIMARY KEY,
  cfg_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 4. 收款与核销渠道表
CREATE TABLE IF NOT EXISTS payment_channels (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL CHECK(channel_type IN ('offline', 'online')),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 5. 旅馆业登记网页按房号缓存库
CREATE TABLE IF NOT EXISTS police_web_registry (
  room_id TEXT PRIMARY KEY,
  guest_name TEXT NOT NULL,
  id_card TEXT NOT NULL,
  phone TEXT NOT NULL,
  reg_time TEXT NOT NULL
);

-- 6. 房间与房价规则表
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  today_day_price REAL NOT NULL DEFAULT 228,
  max_check_in_days INTEGER NOT NULL DEFAULT 1,
  today_hour_price REAL NOT NULL DEFAULT 88,
  default_day_price REAL NOT NULL DEFAULT 228,
  default_hour_price REAL NOT NULL DEFAULT 88,
  ota_bottom_ref REAL NOT NULL DEFAULT 198,
  status TEXT NOT NULL DEFAULT 'free' CHECK(status IN ('free', 'reserved', 'occupied', 'cleaning')),
  pc_cpu TEXT NOT NULL DEFAULT '',
  pc_gpu TEXT NOT NULL DEFAULT '',
  pc_monitor TEXT NOT NULL DEFAULT '',
  pc_ram TEXT NOT NULL DEFAULT '',
  stay_json TEXT,
  updated_at TEXT NOT NULL
);

-- 7. 线上平台待核销与已核销订单池
CREATE TABLE IF NOT EXISTS online_orders (
  order_no TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  id_card TEXT NOT NULL,
  phone TEXT NOT NULL,
  room_type_hint TEXT NOT NULL DEFAULT '',
  days INTEGER NOT NULL DEFAULT 1,
  bottom_price REAL NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  used_room TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- 8. 外设分类表
CREATE TABLE IF NOT EXISTS peripheral_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 9. 外设库存与外设图片台账表（img_data 直接存储 4:3 外设照片 DataURL）
CREATE TABLE IF NOT EXISTS peripherals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  img_data TEXT NOT NULL DEFAULT '',
  rent_fee REAL NOT NULL DEFAULT 5,
  total INTEGER NOT NULL DEFAULT 1,
  available INTEGER NOT NULL DEFAULT 1,
  repair INTEGER NOT NULL DEFAULT 0,
  damaged INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- 10. 网吧外设在借记录表
CREATE TABLE IF NOT EXISTS cafe_rentals (
  id TEXT PRIMARY KEY,
  guest_name TEXT NOT NULL,
  id_card TEXT NOT NULL,
  phone TEXT NOT NULL,
  machine_no TEXT NOT NULL,
  peri_id TEXT NOT NULL,
  peri_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  rent_fee REAL NOT NULL DEFAULT 0,
  deposit REAL NOT NULL DEFAULT 0,
  channel TEXT NOT NULL,
  rent_time TEXT NOT NULL,
  operator TEXT NOT NULL
);

-- 11. 外设报损与售后维修追踪表
CREATE TABLE IF NOT EXISTS peripheral_incidents (
  id TEXT PRIMARY KEY,
  incident_type TEXT NOT NULL CHECK(incident_type IN ('damage', 'repair')),
  peri_id TEXT NOT NULL,
  peri_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  source_label TEXT NOT NULL DEFAULT '',
  guest_name TEXT NOT NULL DEFAULT '',
  fault TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  handle_note TEXT NOT NULL DEFAULT '',
  created_time TEXT NOT NULL,
  operator TEXT NOT NULL
);

-- 12. 外设借还与库存变更审计流水表
CREATE TABLE IF NOT EXISTS peripheral_logs (
  id TEXT PRIMARY KEY,
  log_type TEXT NOT NULL CHECK(log_type IN ('borrow', 'stock')),
  log_time TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_no TEXT NOT NULL DEFAULT '',
  guest_name TEXT NOT NULL DEFAULT '',
  peri_name TEXT NOT NULL,
  action TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  total_after INTEGER NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  operator TEXT NOT NULL
);

-- 13. 营业账目流水、夜审追缴单与交接班快照表
CREATE TABLE IF NOT EXISTS ledger_records (
  id TEXT PRIMARY KEY,
  biz_date TEXT NOT NULL,
  biz_time TEXT NOT NULL,
  shift TEXT NOT NULL,
  room_id TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  pay_mode TEXT NOT NULL CHECK(pay_mode IN ('offline', 'online')),
  channel TEXT NOT NULL,
  biz_type TEXT NOT NULL,
  description TEXT NOT NULL,
  std_fee REAL NOT NULL DEFAULT 0,
  fee REAL NOT NULL DEFAULT 0,
  deposit REAL NOT NULL DEFAULT 0,
  cashier TEXT NOT NULL,
  audit_status TEXT NOT NULL DEFAULT 'pending',
  locked INTEGER NOT NULL DEFAULT 0,
  shift_transfer TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS recovery_orders (
  id TEXT PRIMARY KEY,
  orig_ledger_id TEXT NOT NULL,
  orig_desc TEXT NOT NULL,
  room_id TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  diff_amount REAL NOT NULL,
  reason TEXT NOT NULL,
  created_time TEXT NOT NULL,
  operator TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handover_snapshots (
  id TEXT PRIMARY KEY,
  push_time TEXT NOT NULL,
  biz_date TEXT NOT NULL,
  shift TEXT NOT NULL,
  cashier TEXT NOT NULL,
  offline_net REAL NOT NULL DEFAULT 0,
  online_total REAL NOT NULL DEFAULT 0,
  deposit_net REAL NOT NULL DEFAULT 0,
  room_count INTEGER NOT NULL DEFAULT 0,
  locked_ledger_ids TEXT NOT NULL DEFAULT '[]',
  audit_status TEXT NOT NULL DEFAULT 'pending',
  auditor TEXT NOT NULL DEFAULT '',
  audit_time TEXT NOT NULL DEFAULT '',
  audit_note TEXT NOT NULL DEFAULT ''
);
