const CORS_HEADERS = {
  "Access-Control-Allow-Origin":
    "https://round-dust-009d.danial-khazafmoghadam.workers.dev",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  "Access-Control-Allow-Credentials": "true",
  "Content-Type": "application/json; charset=utf-8",
};

const SESSION_COOKIE = "architecture_session";
const SESSION_DURATION = 7 * 24 * 60 * 60;

const TIME_SLOTS = [
  { start: "08:00", end: "10:00" },
  { start: "10:00", end: "12:00" },
  { start: "12:00", end: "14:00" },
  { start: "14:00", end: "16:00" },
  { start: "16:00", end: "18:00" },
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";

  for (const part of cookies.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }

  return null;
}

function cookieHeader(token, maxAge = SESSION_DURATION) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
}

function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, salt) {
  return sha256(`${salt}:${password}`);
}

async function makePasswordHash(password) {
  const salt = randomToken();
  return `${salt}:${await hashPassword(password, salt)}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;

  const separator = storedHash.indexOf(":");
  const salt = storedHash.slice(0, separator);
  const expected = storedHash.slice(separator + 1);
  const actual = await hashPassword(password, salt);

  return actual === expected;
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  try {
    await db.prepare(
      "ALTER TABLE reservations ADD COLUMN purpose TEXT"
    ).run();
  } catch (e) {
    const message = String(e?.message || e).toLowerCase();

    if (!message.includes("duplicate column")) {
      throw e;
    }
  }
}

async function getStudent(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(`session:${token}`);

  return await env.DB.prepare(`
    SELECT s.id, s.student_code, s.full_name, s.phone, s.status
    FROM sessions se
    JOIN students s ON s.id = se.student_id
    WHERE se.token_hash = ?
      AND se.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).bind(tokenHash).first();
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const parsed = new Date(`${date}T12:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

function isAllowedSlot(start, end) {
  return TIME_SLOTS.some(
    (slot) => slot.start === start && slot.end === end
  );
}

async function requireAdmin(request, env) {
  const configured = env.ADMIN_SECRET;
  const supplied = request.headers.get("X-Admin-Secret");

  return Boolean(
    typeof configured === "string" &&
    configured.length > 0 &&
    supplied &&
    supplied === configured
  );
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (!path.startsWith("/api/")) {
    return env.ASSETS.fetch(request);
  }

  try {
    await ensureSchema(env.DB);

    if (path === "/api/health" && method === "GET") {
      return json({ success: true, status: "ok" });
    }

    // ثبت‌نام دانشجو
    if (path === "/api/register" && method === "POST") {
      const body = await request.json();

      const studentCode = String(body.studentCode || "").trim();
      const fullName = String(body.fullName || "").trim();
      const phone = String(body.phone || "").trim();
      const password = String(body.password || "");

      if (!studentCode || !fullName || !phone || !password) {
        return error("تمام فیلدها الزامی هستند.");
      }

      if (password.length < 8) {
        return error("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      }

      if (
        studentCode.length > 40 ||
        fullName.length > 150 ||
        phone.length > 30
      ) {
        return error("طول یکی از فیلدها بیش از حد مجاز است.");
      }

      const existing = await env.DB.prepare(`
        SELECT id FROM students WHERE student_code = ? LIMIT 1
      `).bind(studentCode).first();

      if (existing) {
        return error("این کد دانشجویی قبلاً ثبت شده است.", 409);
      }

      const passwordHash = await makePasswordHash(password);

      await env.DB.prepare(`
        INSERT INTO students (
          student_code, full_name, phone, password_hash, status
        )
        VALUES (?, ?, ?, ?, 'pending')
      `).bind(
        studentCode,
        fullName,
        phone,
        passwordHash
      ).run();

      return json({
        success: true,
        message: "ثبت‌نام انجام شد. حساب پس از تأیید مدیر فعال می‌شود.",
      }, 201);
    }

    // ورود دانشجو
    if (path === "/api/login" && method === "POST") {
      const body = await request.json();

      const studentCode = String(body.studentCode || "").trim();
      const password = String(body.password || "");

      if (!studentCode || !password) {
        return error("کد دانشجویی و رمز عبور الزامی هستند.");
      }

      const student = await env.DB.prepare(`
        SELECT id, student_code, full_name, phone, password_hash, status
        FROM students
        WHERE student_code = ?
        LIMIT 1
      `).bind(studentCode).first();

      if (
        !student ||
        !(await verifyPassword(password, student.password_hash))
      ) {
        return error("کد دانشجویی یا رمز عبور اشتباه است.", 401);
      }

      if (student.status !== "approved") {
        return error(
          student.status === "rejected"
            ? "درخواست ثبت‌نام شما رد شده است."
            : "حساب شما هنوز تأیید نشده است.",
          403
        );
      }

      const token = randomToken();
      const tokenHash = await sha256(`session:${token}`);
      const expiresAt = new Date(
        Date.now() + SESSION_DURATION * 1000
      ).toISOString();

      await env.DB.prepare(`
        INSERT INTO sessions (student_id, token_hash, expires_at)
        VALUES (?, ?, ?)
      `).bind(student.id, tokenHash, expiresAt).run();

      return json({
        success: true,
        student: {
          id: student.id,
          studentCode: student.student_code,
          fullName: student.full_name,
          phone: student.phone,
          status: student.status,
        },
      }, 200, {
        "Set-Cookie": cookieHeader(token),
      });
    }

    // بررسی نشست کاربر
    if (path === "/api/student/session" && method === "GET") {
      const student = await getStudent(request, env);

      if (!student) {
        return error("نشست معتبر نیست؛ دوباره وارد شوید.", 401);
      }

      return json({
        student: {
          id: student.id,
          studentCode: student.student_code,
          fullName: student.full_name,
          phone: student.phone,
          status: student.status,
        },
      });
    }

    // خروج
    if (path === "/api/logout" && method === "POST") {
      const token = getCookie(request, SESSION_COOKIE);

      if (token) {
        const tokenHash = await sha256(`session:${token}`);

        await env.DB.prepare(`
          DELETE FROM sessions WHERE token_hash = ?
        `).bind(tokenHash).run();
      }

      return json({ success: true }, 200, {
        "Set-Cookie": clearCookieHeader(),
      });
    }

    // فهرست رزروهای دانشجو
    if (path === "/api/reservations" && method === "GET") {
      const student = await getStudent(request, env);

      if (!student) {
        return error("ابتدا وارد حساب خود شوید.", 401);
      }

      const result = await env.DB.prepare(`
        SELECT
          id,
          student_code,
          reservation_date AS date,
          start_time,
          end_time,
          COALESCE(purpose, '') AS purpose,
          status,
          created_at
        FROM reservations
        WHERE student_code = ?
        ORDER BY reservation_date DESC, start_time DESC
      `).bind(student.student_code).all();

      return json({ reservations: result.results || [] });
    }

    // ثبت رزرو بدون دلیل حضور
    if (path === "/api/reservations" && method === "POST") {
      const student = await getStudent(request, env);

      if (!student) {
        return error("ابتدا وارد حساب خود شوید.", 401);
      }

      if (student.status !== "approved") {
        return error("حساب شما تأیید نشده است.", 403);
      }

      const body = await request.json();

      const date = String(body.date || "").trim();
      const startTime = String(body.startTime || "").trim();
      const endTime = String(body.endTime || "").trim();

      if (!date || !startTime || !endTime) {
        return error("تاریخ و بازه زمانی را انتخاب کنید.");
      }

      if (!isValidDate(date)) {
        return error("تاریخ انتخاب‌شده معتبر نیست.");
      }

      if (!isAllowedSlot(startTime, endTime)) {
        return error("بازه زمانی انتخاب‌شده مجاز نیست.");
      }

      const today = new Date().toISOString().slice(0, 10);

      if (date < today) {
        return error("امکان رزرو برای تاریخ گذشته وجود ندارد.");
      }

      const conflict = await env.DB.prepare(`
        SELECT id
        FROM reservations
        WHERE reservation_date = ?
          AND status = 'active'
          AND start_time = ?
          AND end_time = ?
        LIMIT 1
      `).bind(date, startTime, endTime).first();

      if (conflict) {
        return error("این بازه زمانی قبلاً رزرو شده است.", 409);
      }

      await env.DB.prepare(`
        INSERT INTO reservations (
          student_code,
          reservation_date,
          start_time,
          end_time,
          status
        )
        VALUES (?, ?, ?, ?, 'active')
      `).bind(
        student.student_code,
        date,
        startTime,
        endTime
      ).run();

      return json({
        success: true,
        message: "رزرو با موفقیت ثبت شد.",
        student: {
          fullName: student.full_name,
          studentCode: student.student_code,
        },
        reservation: {
          date,
          startTime,
          endTime,
        },
      }, 201);
    }

    // لغو رزرو متعلق به دانشجو
    const cancelMatch = path.match(/^\/api\/reservations\/(\d+)$/);

    if (cancelMatch && method === "DELETE") {
      const student = await getStudent(request, env);

      if (!student) {
        return error("ابتدا وارد حساب خود شوید.", 401);
      }

      const id = Number(cancelMatch[1]);

      const result = await env.DB.prepare(`
        DELETE FROM reservations
        WHERE id = ?
          AND student_code = ?
      `).bind(id, student.student_code).run();

      if (!result.meta.changes) {
        return error("رزرو پیدا نشد یا متعلق به شما نیست.", 404);
      }

      return json({ success: true, message: "رزرو لغو شد." });
    }

    // مسیرهای ادمین
    if (path.startsWith("/api/admin/")) {
      if (!(await requireAdmin(request, env))) {
        return error("دسترسی مدیر تأیید نشد.", 401);
      }

      if (path === "/api/admin/students" && method === "GET") {
        const result = await env.DB.prepare(`
          SELECT id, student_code, full_name, phone, status, created_at
          FROM students
          ORDER BY
            CASE status
              WHEN 'pending' THEN 0
              WHEN 'approved' THEN 1
              ELSE 2
            END,
            id DESC
        `).all();

        return json({ students: result.results || [] });
      }

      if (path === "/api/admin/reservations" && method === "GET") {
        const result = await env.DB.prepare(`
          SELECT
            r.id,
            r.student_code,
            s.id AS student_id,
            s.full_name,
            r.reservation_date AS date,
            r.start_time,
            r.end_time,
            COALESCE(r.purpose, '') AS purpose,
            r.status,
            r.created_at
          FROM reservations r
          LEFT JOIN students s ON s.student_code = r.student_code
          ORDER BY r.reservation_date DESC, r.start_time DESC
        `).all();

        return json({ reservations: result.results || [] });
      }

      const studentAction = path.match(
        /^\/api\/admin\/students\/(\d+)\/(approve|reject)$/
      );

      if (studentAction && method === "POST") {
        const id = Number(studentAction[1]);
        const status =
          studentAction[2] === "approve" ? "approved" : "rejected";

        const result = await env.DB.prepare(`
          UPDATE students SET status = ? WHERE id = ?
        `).bind(status, id).run();

        if (!result.meta.changes) {
          return error("دانشجو پیدا نشد.", 404);
        }

        return json({
          success: true,
          message: status === "approved"
            ? "دانشجو تأیید شد."
            : "درخواست دانشجو رد شد.",
        });
      }

      return error("مسیر مدیریتی پیدا نشد.", 404);
    }

    return error("مسیر API پیدا نشد.", 404);
  } catch (e) {
    console.error("Worker error:", e);
    return error("خطای داخلی سرور رخ داد.", 500);
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};
