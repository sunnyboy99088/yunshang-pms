import { onRequestPost as loginPost } from "../functions/api/auth/login.js";
import { onRequestGet as meGet } from "../functions/api/auth/me.js";
import { onRequestPost as logoutPost } from "../functions/api/auth/logout.js";
import { onRequestGet as usersGet, onRequestPost as usersPost } from "../functions/api/users.js";
import { onRequestGet as bootstrapGet, onRequestPost as bootstrapPost } from "../functions/api/bootstrap.js";

function methodNotAllowed() {
  return new Response(JSON.stringify({ ok: false, error: "不支持的请求方法" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

async function dispatchApi(pathname, context) {
  const method = context.request.method.toUpperCase();

  if (pathname === "/api/auth/login") {
    if (method === "POST") return await loginPost(context);
    return methodNotAllowed();
  }

  if (pathname === "/api/auth/me") {
    if (method === "GET") return await meGet(context);
    return methodNotAllowed();
  }

  if (pathname === "/api/auth/logout") {
    if (method === "POST") return await logoutPost(context);
    return methodNotAllowed();
  }

  if (pathname === "/api/users") {
    if (method === "GET") return await usersGet(context);
    if (method === "POST") return await usersPost(context);
    return methodNotAllowed();
  }

  if (pathname === "/api/bootstrap") {
    if (method === "GET") return await bootstrapGet(context);
    if (method === "POST") return await bootstrapPost(context);
    return methodNotAllowed();
  }

  return new Response(JSON.stringify({ ok: false, error: "接口不存在" }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };

    if (url.pathname.startsWith("/api/")) {
      return await dispatchApi(url.pathname, context);
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return await env.ASSETS.fetch(request);
    }

    return new Response("未配置静态资源绑定 ASSETS", { status: 500 });
  }
};