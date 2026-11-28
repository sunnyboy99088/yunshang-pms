export function jsonResp(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateRandomHex(bytesLen = 16) {
  const arr = new Uint8Array(bytesLen);
  crypto.getRandomValues(arr);
  return bufToHex(arr.buffer);
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(saltHex),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return bufToHex(derived);
}

// 首次部署且 users 表为空时，自动在 D1 数据库初始化 1 个管理员账号与 1 个普通收银员账号
export async function ensureSeedUsers(db) {
  const countRow = await db.prepare("SELECT COUNT(*) AS cnt FROM users").first();
  if (countRow && countRow.cnt > 0) return;

  const nowStr = new Date().toISOString();
  const adminSalt = generateRandomHex(16);
  const adminHash = await hashPassword("Admin@123456", adminSalt);

  const cashierSalt = generateRandomHex(16);
  const cashierHash = await hashPassword("Cashier@123456", cashierSalt);

  await db.batch([
    db.prepare(
      "INSERT INTO users (id, username, display_name, role, password_salt, password_hash, enabled, created_at) VALUES (?1, ?2, ?3, 'admin', ?4, ?5, 1, ?6)"
    ).bind("u_admin_01", "admin", "李店长", adminSalt, adminHash, nowStr),
    db.prepare(
      "INSERT INTO users (id, username, display_name, role, password_salt, password_hash, enabled, created_at) VALUES (?1, ?2, ?3, 'cashier', ?4, ?5, 1, ?6)"
    ).bind("u_cashier_01", "cashier01", "张悦", cashierSalt, cashierHash, nowStr)
  ]);
}

export function getCookieValue(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

export async function getAuthenticatedUser(context) {
  const db = context.env.DB;
  if (!db) return null;
  await ensureSeedUsers(db);
  const token = getCookieValue(context.request, "pms_session");
  if (!token) return null;

  const nowMs = Date.now();
  const row = await db.prepare(
    `SELECT u.id, u.username, u.display_name, u.role, u.enabled, s.expires_at
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?1`
  ).bind(token).first();

  if (!row || !row.enabled || row.expires_at < nowMs) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role
  };
}
