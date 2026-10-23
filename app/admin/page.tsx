"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL =
  "https://round-dust-009d.danial-khazafmoghadam.workers.dev";

type Student = {
  id: number;
  student_code: string;
  full_name: string;
  phone: string;
  status: string;
  created_at?: string;
};

type Reservation = {
  id: number;
  student_id: number;
  student_code?: string;
  full_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  status: string;
  created_at?: string;
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [view, setView] = useState<"students" | "reservations">("students");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const request = useCallback(
    async (path: string, method = "GET") => {
      const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": secret,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "درخواست ناموفق بود.");
      }

      return data;
    },
    [secret]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const [studentData, reservationData] = await Promise.all([
        request("/api/admin/students"),
        request("/api/admin/reservations"),
      ]);

      setStudents(studentData.students || []);
      setReservations(reservationData.reservations || []);
      setAuthenticated(true);
    } catch (error) {
      setAuthenticated(false);
      setMessage(
        error instanceof Error ? error.message : "خطا در دریافت اطلاعات."
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadData();
  }

  async function updateStudent(id: number, action: "approve" | "reject") {
    setMessage("");

    try {
      await request(`/api/admin/students/${id}/${action}`, "POST");
      setMessage(
        action === "approve"
          ? "دانشجو تأیید شد."
          : "درخواست دانشجو رد شد."
      );
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "عملیات ناموفق بود."
      );
    }
  }

  async function refreshReservations() {
    setLoading(true);
    setMessage("");

    try {
      const data = await request("/api/admin/reservations");
      setReservations(data.reservations || []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "خطا در دریافت رزروها."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">
            پنل مدیریت آزمایشگاه معماری
          </h1>
          <p className="mt-2 text-slate-400">
            مدیریت درخواست دانشجویان و رزروهای آزمایشگاه
          </p>
        </header>

        {!authenticated ? (
          <form
            onSubmit={handleLogin}
            className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6"
          >
            <h2 className="mb-4 text-xl font-semibold">
              ورود مدیر
            </h2>

            <label
              htmlFor="admin-secret"
              className="mb-2 block text-sm text-slate-300"
            >
              کلید دسترسی مدیر
            </label>

            <input
              id="admin-secret"
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              required
              autoComplete="current-password"
              className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              placeholder="کلید مدیر را وارد کنید"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "در حال بررسی..." : "ورود به پنل"}
            </button>
          </form>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-3">
              <button
                onClick={() => setView("students")}
                className={`rounded-lg px-5 py-3 font-medium ${
                  view === "students"
                    ? "bg-blue-600"
                    : "bg-slate-800 hover:bg-slate-700"
                }`}
              >
                درخواست دانشجویان ({students.length})
              </button>

              <button
                onClick={() => setView("reservations")}
                className={`rounded-lg px-5 py-3 font-medium ${
                  view === "reservations"
                    ? "bg-blue-600"
                    : "bg-slate-800 hover:bg-slate-700"
                }`}
              >
                رزروها ({reservations.length})
              </button>

              <button
                onClick={loadData}
                disabled={loading}
                className="rounded-lg bg-slate-800 px-5 py-3 hover:bg-slate-700 disabled:opacity-50"
              >
                به‌روزرسانی
              </button>

              <button
                onClick={() => {
                  setAuthenticated(false);
                  setSecret("");
                  setStudents([]);
                  setReservations([]);
                  setMessage("");
                }}
                className="rounded-lg border border-red-800 px-5 py-3 text-red-300 hover:bg-red-950"
              >
                خروج
              </button>
            </div>

            {view === "students" ? (
              <section className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
                <h2 className="p-5 text-xl font-semibold">
                  فهرست دانشجویان
                </h2>

                <table className="w-full min-w-[700px] text-right">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="p-4">کد دانشجویی</th>
                      <th className="p-4">نام و نام خانوادگی</th>
                      <th className="p-4">تلفن</th>
                      <th className="p-4">وضعیت</th>
                      <th className="p-4">عملیات</th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((student) => (
                      <tr
                        key={student.id}
                        className="border-t border-slate-800"
                      >
                        <td className="p-4">{student.student_code}</td>
                        <td className="p-4">{student.full_name}</td>
                        <td className="p-4">{student.phone}</td>
                        <td className="p-4">
                          {student.status === "approved"
                            ? "تأییدشده"
                            : student.status === "rejected"
                              ? "ردشده"
                              : "در انتظار بررسی"}
                        </td>
                        <td className="p-4">
                          {student.status === "pending" && (
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  updateStudent(student.id, "approve")
                                }
                                className="rounded-md bg-green-700 px-3 py-2 hover:bg-green-600"
                              >
                                تأیید
                              </button>
                              <button
                                onClick={() =>
                                  updateStudent(student.id, "reject")
                                }
                                className="rounded-md bg-red-700 px-3 py-2 hover:bg-red-600"
                              >
                                رد
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}

                    {students.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-8 text-center text-slate-400"
                        >
                          دانشجویی ثبت نشده است.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            ) : (
              <section className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
                <div className="flex items-center justify-between p-5">
                  <h2 className="text-xl font-semibold">
                    رزروهای آزمایشگاه
                  </h2>
                  <button
                    onClick={refreshReservations}
                    disabled={loading}
                    className="rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
                  >
                    بارگذاری مجدد
                  </button>
                </div>

                <table className="w-full min-w-[750px] text-right">
                  <thead className="bg-slate-800 text-slate-300">
                    <tr>
                      <th className="p-4">دانشجو</th>
                      <th className="p-4">تاریخ</th>
                      <th className="p-4">ساعت شروع</th>
                      <th className="p-4">ساعت پایان</th>
                      <th className="p-4">هدف رزرو</th>
                      <th className="p-4">وضعیت</th>
                    </tr>
                  </thead>

                  <tbody>
                    {reservations.map((reservation) => (
                      <tr
                        key={reservation.id}
                        className="border-t border-slate-800"
                      >
                        <td className="p-4">
                          {reservation.full_name ||
                            reservation.student_code ||
                            `دانشجو ${reservation.student_id}`}
                        </td>
                        <td className="p-4">{reservation.date}</td>
                        <td className="p-4">{reservation.start_time}</td>
                        <td className="p-4">{reservation.end_time}</td>
                        <td className="p-4">{reservation.purpose}</td>
                        <td className="p-4">{reservation.status}</td>
                      </tr>
                    ))}

                    {reservations.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-slate-400"
                        >
                          رزروی ثبت نشده است.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}

        {message && (
          <p
            role="status"
            className="mt-5 rounded-lg border border-slate-700 bg-slate-900 p-4"
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
