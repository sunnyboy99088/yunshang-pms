import { jsonResp, getAuthenticatedUser, hashPassword, generateRandomHex } from "../_auth.js";

export async function onRequestGet(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return jsonResp({ ok: false, error: "请先登录" }, 401);
  if (user.role !== "admin") return jsonResp({ ok: false, error: "仅管理员可查看账号列表" }, 403);

  const db = context.env.DB;
  const res = await db.prepare(
    "SELECT id, username, display_name, role, enabled, created_at FROM users ORDER BY created_at ASC"
  ).all();

  return jsonResp({
    ok: true,
    users: (res.results || []).map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      role: u.role,
      enabled: Boolean(u.enabled),
      createdAt: u.created_at
    }))
  });
}

export async function onRequestPost(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return jsonResp({ ok: false, error: "请先登录" }, 401);
  if (user.role !== "admin") return jsonResp({ ok: false, error: "仅管理员可管理账号" }, 403);

  const db = context.env.DB;
  try {
    const body = await context.request.json();
    const action = body && body.action;

    if (action === "create") {
      const username = String(body.username || "").trim();
      const displayName = String(body.displayName || "").trim();
      const role = body.role === "admin" ? "admin" : "cashier";
      const password = String(body.password || "");
      if (!username || !displayName || password.length < 4) {
        return jsonResp({ ok: false, error: "账号、姓名不能为空，且密码不少于4位" }, 400);
      }
      const exists = await db.prepare("SELECT id FROM users WHERE username = ?1").bind(username).first();
      if (exists) {
        return jsonResp({ ok: false, error: `登录账号【${username}】已存在` }, 400);
      }
      const salt = generateRandomHex(16);
      const pwdHash = await hashPassword(password, salt);
      const id = "u_" + Date.now();
      await db.prepare(
        "INSERT INTO users (id, username, display_name, role, password_salt, password_hash, enabled, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)"
      ).bind(id, username, displayName, role, salt, pwdHash, new Date().toISOString()).run();

      return jsonResp({ ok: true });
    }

    if (action === "update") {
      const id = String(body.id || "");
      const displayName = String(body.displayName || "").trim();
      const role = body.role === "admin" ? "admin" : "cashier";
      const newPassword = String(body.newPassword || "");
      if (!id || !displayName) {
        return jsonResp({ ok: false, error: "缺少账号ID或姓名" }, 400);
      }
      if (role !== "admin") {
        const otherAdmin = await db.prepare(
          "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND enabled = 1 AND id != ?1"
        ).bind(id).first();
        if (!otherAdmin || otherAdmin.cnt === 0) {
          return jsonResp({ ok: false, error: "系统必须保留至少一名启用中的管理员" }, 400);
        }
      }
      if (newPassword) {
        const salt = generateRandomHex(16);
        const pwdHash = await hashPassword(newPassword, salt);
        await db.prepare(
          "UPDATE users SET display_name = ?1, role = ?2, password_salt = ?3, password_hash = ?4 WHERE id = ?5"
        ).bind(displayName, role, salt, pwdHash, id).run();
      } else {
        await db.prepare(
          "UPDATE users SET display_name = ?1, role = ?2 WHERE id = ?3"
        ).bind(displayName, role, id).run();
      }
      return jsonResp({ ok: true });
    }

    if (action === "toggle") {
      const id = String(body.id || "");
      const enabled = body.enabled ? 1 : 0;
      if (!enabled) {
        const otherAdmin = await db.prepare(
          "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND enabled = 1 AND id != ?1"
        ).bind(id).first();
        if (!otherAdmin || otherAdmin.cnt === 0) {
          return jsonResp({ ok: false, error: "不能停用最后一名启用中的管理员" }, 400);
        }
      }
      await db.prepare("UPDATE users SET enabled = ?1 WHERE id = ?2").bind(enabled, id).run();
      if (!enabled) {
        await db.prepare("DELETE FROM user_sessions WHERE user_id = ?1").bind(id).run();
      }
      return jsonResp({ ok: true });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      const otherAdmin = await db.prepare(
        "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND enabled = 1 AND id != ?1"
      ).bind(id).first();
      if (!otherAdmin || otherAdmin.cnt === 0) {
        return jsonResp({ ok: false, error: "不能删除最后一名启用中的管理员" }, 400);
      }
      await db.batch([
        db.prepare("DELETE FROM user_sessions WHERE user_id = ?1").bind(id),
        db.prepare("DELETE FROM users WHERE id = ?1").bind(id)
      ]);
      return jsonResp({ ok: true });
    }

    return jsonResp({ ok: false, error: "未知操作类型" }, 400);
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}
