export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
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

    // همه مسیرهای مدیریت نیازمند رمز مدیر هستند.
    if (url.pathname.startsWith("/api/admin/")) {
      if (!env.ADMIN_SECRET) {
        return json({ success: false, error: "ADMIN_SECRET_NOT_CONFIGURED" }, 500);
      }

      const suppliedSecret = request.headers.get("X-Admin-Secret");

      if (suppliedSecret !== env.ADMIN_SECRET) {
        return json({
          success: false,
          error: "UNAUTHORIZED",
          message: "دسترسی غیرمجاز است.",
        }, 401);
      }

      if (!env.DB) {
        return json({ success: false, error: "DATABASE_NOT_CONFIGURED" }, 500);
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

          return json({ success: true, students: result.results });
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

        if (
          !studentCode ||
          !["approved", "rejected"].includes(status)
        ) {
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

          return json({
            success: true,
            studentCode,
            status,
          });
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