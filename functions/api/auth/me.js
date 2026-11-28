import { jsonResp, getAuthenticatedUser } from "../../_auth.js";

export async function onRequestGet(context) {
  try {
    const user = await getAuthenticatedUser(context);
    if (!user) {
      return jsonResp({ ok: false, user: null }, 401);
    }
    return jsonResp({ ok: true, user });
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}
