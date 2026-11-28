import { jsonResp, ensureSeedUsers, hashPassword, generateRandomHex } from "../../_auth.js";

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) {
    return jsonResp({ ok: false, error: "未检测到 D1 数据库绑定 (变量名需为 DB)" }, 500);
  }

  try {
    await ensureSeedUsers(db);
    const body = await context.request.json();
    const username = (body && body.username ? String(body.username) : "").trim();
    const password = body && body.password ? String(body.password) : "";

    if (!username || !password) {
      return jsonResp({ ok: false, error: "请输入登录账号与密码" }, 400);
    }

    const userRow = await db.prepare(
      "SELECT id, username, display_name, role, password_salt, password_hash, enabled FROM users WHERE username = ?1"
    ).bind(username).first();

    if (!userRow) {
      return jsonResp({ ok: false, error: "账号不存在或密码错误" }, 401);
    }
    if (!userRow.enabled) {
      return jsonResp({ ok: false, error: "该账号已被管理员停用" }, 403);
    }

    const computedHash = await hashPassword(password, userRow.password_salt);
    if (computedHash !== userRow.password_hash) {
      return jsonResp({ ok: false, error: "账号不存在或密码错误" }, 401);
    }

    const token = generateRandomHex(24);
    const maxAgeSec = 7 * 24 * 3600;
    const expiresAt = Date.now() + maxAgeSec * 1000;
    const nowStr = new Date().toISOString();

    await db.prepare(
      "INSERT INTO user_sessions (token, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)"
    ).bind(token, userRow.id, expiresAt, nowStr).run();

    const cookieStr = `pms_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;

    return jsonResp(
      {
        ok: true,
        user: {
          id: userRow.id,
          username: userRow.username,
          displayName: userRow.display_name,
          role: userRow.role
        }
      },
      200,
      { "Set-Cookie": cookieStr }
    );
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}
