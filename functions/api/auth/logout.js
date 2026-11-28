import { jsonResp, getCookieValue } from "../../_auth.js";

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const token = getCookieValue(context.request, "pms_session");
    if (db && token) {
      await db.prepare("DELETE FROM user_sessions WHERE token = ?1").bind(token).run();
    }
    return jsonResp(
      { ok: true },
      200,
      { "Set-Cookie": "pms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" }
    );
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}
