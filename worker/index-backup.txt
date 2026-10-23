
async function createSessionSignature(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createSession(secret) {
  const expires = String(Math.floor(Date.now() / 1000) + 8 * 60 * 60);
  const signature = await createSessionSignature(expires, secret);
  return `${expires}.${signature}`;
}

async function isValidSession(token, secret) {
  if (!token || !secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const expires = Number(parts[0]);

  if (
    !Number.isSafeInteger(expires) ||
    expires <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  const expected = await createSessionSignature(parts[0], secret);

  if (expected.length !== parts[1].length) return false;

  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
  }

  return difference === 0;
}

function getSessionCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;

    const name = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();

    if (name === "admin_session") return value;
  }

  return null;
}

const SESSION_COOKIE =
  "admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
    };

    const json = (data, status = 200, extraHeaders = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          ...extraHeaders,
        },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        success: true,
        service: "architecture-reservation-api",
        status: "running",
      });
    }

    if (url.pathname === "/api/register" && request.method === "POST") {
      if (!env.DB) {
        return json({ success: false, error: "DATABASE_NOT_CONFIGURED" }, 500);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json({ success: false, error: "INVALID_JSON" }, 400);
      }

      const studentCode = String(body.studentCode ?? "").trim();
      const fullName = String(body.fullName ?? "").trim();
      const phone = String(body.phone ?? "").trim();

      if (!studentCode || !fullName || !phone) {
        return json({
          success: false,
          error: "MISSING_FIELDS",
          message: "هر سه فیلد الزامی هستند.",
        }, 400);
      }

      if (
        studentCode.length > 30 ||
        fullName.length > 100 ||
        phone.length > 20
      ) {
        return json({ success: false, error: "INVALID_FIELD_LENGTH" }, 400);
      }

      try {
        await env.DB.prepare(
          `INSERT INTO students (student_code, full_name, phone)
           VALUES (?, ?, ?)`
        ).bind(studentCode, fullName, phone).run();

        return json({
          success: true,
          message: "ثبت‌نام انجام شد و در انتظار تأیید است.",
          status: "pending",
        }, 201);
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) {
          return json({
            success: false,
            error: "STUDENT_ALREADY_REGISTERED",
            message: "این کد دانشجویی قبلاً ثبت‌نام کرده است.",
          }, 409);
        }

        console.error("Registration error:", error);
        return json({ success: false, error: "REGISTRATION_FAILED" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!env.ADMIN_SECRET) {
        return json({
          success: false,
          error: "ADMIN_SECRET_NOT_CONFIGURED",
        }, 500);
      }

      // محافظت در برابر درخواست‌های تغییردهنده از مبدأ دیگر
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
        request.headers.get("Origin") &&
        request.headers.get("Origin") !== url.origin
      ) {
        return json({ success: false, error: "INVALID_ORIGIN" }, 403);
      }

      // ورود مدیر؛ رمز فقط در بدنه درخواست ارسال می‌شود
      if (
        url.pathname === "/api/admin/login" &&
        request.method === "POST"
      ) {
        let body;

        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "INVALID_JSON" }, 400);
        }

        if (
          typeof body.password !== "string" ||
          body.password !== env.ADMIN_SECRET
        ) {
          return json({
            success: false,
            error: "INVALID_PASSWORD",
            message: "رمز مدیر اشتباه است.",
          }, 401);
        }

        const token = await createSession(env.ADMIN_SECRET);

        return json(
          { success: true, message: "ورود موفق بود." },
          200,
          {
            "Set-Cookie":
              `admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`,
            "Cache-Control": "no-store",
          }
        );
      }

      // بررسی معتبر بودن نشست
      if (
        url.pathname === "/api/admin/session" &&
        request.method === "GET"
      ) {
        const token = getSessionCookie(request);
        const authenticated = await isValidSession(
          token,
          env.ADMIN_SECRET
        );

        return json(
          { success: true, authenticated },
          200,
          { "Cache-Control": "no-store" }
        );
      }

      // خروج مدیر
      if (
        url.pathname === "/api/admin/logout" &&
        request.method === "POST"
      ) {
        return json(
          { success: true, message: "خروج انجام شد." },
          200,
          { "Set-Cookie": SESSION_COOKIE, "Cache-Control": "no-store" }
        );
      }

      // احراز هویت مسیرهای مدیریتی با نشست یا هدر مخصوص تست مستقیم
      const token = getSessionCookie(request);
      const cookieAuthenticated = await isValidSession(
        token,
        env.ADMIN_SECRET
      );

      const suppliedSecret = request.headers.get("X-Admin-Secret");
      const headerAuthenticated = suppliedSecret === env.ADMIN_SECRET;

      if (!cookieAuthenticated && !headerAuthenticated) {
        return json({
          success: false,
          error: "UNAUTHORIZED",
          message: "ابتدا وارد پنل مدیریت شوید.",
        }, 401);
      }

      if (!env.DB) {
        return json({
          success: false,
          error: "DATABASE_NOT_CONFIGURED",
        }, 500);
      }

      // مشاهده فهرست ثبت‌نام‌ها
      if (
        url.pathname === "/api/admin/students" &&
        request.method === "GET"
      ) {
        const status = url.searchParams.get("status") || "pending";

        if (!["pending", "approved", "rejected", "all"].includes(status)) {
          return json({ success: false, error: "INVALID_STATUS" }, 400);
        }

        try {
          let result;

          if (status === "all") {
            result = await env.DB.prepare(
              `SELECT id, student_code, full_name, phone, status, created_at
               FROM students ORDER BY created_at DESC LIMIT 500`
            ).all();
          } else {
            result = await env.DB.prepare(
              `SELECT id, student_code, full_name, phone, status, created_at
               FROM students WHERE status = ?
               ORDER BY created_at DESC LIMIT 500`
            ).bind(status).all();
          }

          return json(
            { success: true, students: result.results },
            200,
            { "Cache-Control": "no-store" }
          );
        } catch (error) {
          console.error("Admin list error:", error);
          return json({ success: false, error: "DATABASE_ERROR" }, 500);
        }
      }

      // تأیید یا رد ثبت‌نام
      if (
        url.pathname === "/api/admin/students/status" &&
        request.method === "POST"
      ) {
        let body;

        try {
          body = await request.json();
        } catch {
          return json({ success: false, error: "INVALID_JSON" }, 400);
        }

        const studentCode = String(body.studentCode ?? "").trim();
        const status = body.status;

        if (!studentCode || !["approved", "rejected"].includes(status)) {
          return json({
            success: false,
            error: "INVALID_INPUT",
            message: "کد دانشجویی و وضعیت approved یا rejected الزامی است.",
          }, 400);
        }

        try {
          const result = await env.DB.prepare(
            `UPDATE students SET status = ?
             WHERE student_code = ? AND status = 'pending'`
          ).bind(status, studentCode).run();

          if (result.meta.changes === 0) {
            return json({
              success: false,
              error: "STUDENT_NOT_FOUND_OR_ALREADY_REVIEWED",
            }, 404);
          }

          return json({ success: true, studentCode, status });
        } catch (error) {
          console.error("Admin update error:", error);
          return json({ success: false, error: "DATABASE_ERROR" }, 500);
        }
      }

      return json({ success: false, error: "NOT_FOUND" }, 404);
    }

    return json({
      success: false,
      error: "NOT_FOUND",
      message: "مسیر درخواست پیدا نشد.",
    }, 404);
  },
};
