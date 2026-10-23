"use client";

import { useCallback, useEffect, useState } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import gregorian from "react-date-object/calendars/gregorian";
import persian_fa from "react-date-object/locales/persian_fa";
import DateObject from "react-date-object";

const API_URL =
  "https://round-dust-009d.danial-khazafmoghadam.workers.dev";

const TIME_SLOTS = [
  { label: "۸ تا ۱۰", start: "08:00", end: "10:00" },
  { label: "۱۰ تا ۱۲", start: "10:00", end: "12:00" },
  { label: "۱۲ تا ۱۴", start: "12:00", end: "14:00" },
  { label: "۱۴ تا ۱۶", start: "14:00", end: "16:00" },
  { label: "۱۶ تا ۱۸", start: "16:00", end: "18:00" },
];

type Student = {
  id: number;
  studentCode: string;
  fullName: string;
  phone?: string;
  status: string;
};

type Reservation = {
  id: number;
  student_code?: string;
  student_id?: number;
  full_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose?: string;
  status: string;
};

type Receipt = {
  name: string;
  date: string;
  weekday: string;
  start: string;
  end: string;
};

async function apiRequest(
  path: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "درخواست ناموفق بود.");
  }

  return data;
}


function parseISODate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const value = new Date(year, month - 1, day, 12);

  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    !Number.isFinite(value.getTime())
  ) {
    return null;
  }

  return value;
}

function formatPersianDate(date: string): string {
  const value = parseISODate(date);

  if (!value) return "تاریخ نامعتبر";

  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

function getWeekday(date: string): string {
  const value = parseISODate(date);

  if (!value) return "";

  return new Intl.DateTimeFormat("fa-IR", {
    weekday: "long",
  }).format(value);
}

function getTodayGregorian() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(time: string) {
  return time.slice(0, 5);
}

export default function HomePage() {
  const [view, setView] = useState<"login" | "register">("login");
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [studentCode, setStudentCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [selectedDate, setSelectedDate] = useState<DateObject | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const loadReservations = useCallback(async () => {
    const data = await apiRequest("/api/reservations");
    setReservations(data.reservations || []);
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        const data = await apiRequest("/api/student/session");

        setStudent({
          id: data.student.id,
          studentCode: data.student.studentCode,
          fullName: data.student.fullName,
          phone: data.student.phone,
          status: data.student.status,
        });

        if (data.student.status === "approved") {
          await loadReservations();
        }
      } catch {
        setStudent(null);
      } finally {
        setLoading(false);
      }
    }

    void restoreSession();
  }, [loadReservations]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      const data = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({ studentCode, password }),
      });

      setStudent(data.student);
      setPassword("");

      if (data.student.status === "approved") {
        await loadReservations();
      }

      setMessage("ورود با موفقیت انجام شد.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ورود ناموفق بود."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    try {
      await apiRequest("/api/register", {
        method: "POST",
        body: JSON.stringify({
          studentCode,
          fullName,
          phone,
          password,
        }),
      });

      setMessage(
        "ثبت‌نام با موفقیت انجام شد. پس از تأیید مدیر می‌توانید وارد شوید."
      );

      setView("login");
      setPassword("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت‌نام ناموفق بود."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDate || !selectedSlot) {
      setMessage("لطفاً تاریخ و یک بازه زمانی را انتخاب کنید.");
      return;
    }

    const slot = TIME_SLOTS.find((item) => item.start === selectedSlot);

    if (!slot) {
      setMessage("بازه زمانی انتخاب‌شده معتبر نیست.");
      return;
    }

    if (!selectedDate.isValid) {
  setMessage("تاریخ انتخاب‌شده معتبر نیست. دوباره انتخاب کنید.");
  return;
}

    const convertedDate = new DateObject(selectedDate).convert(gregorian);

    const date =
      `${String(convertedDate.year).padStart(4, "0")}-` +
      `${String(convertedDate.month).padStart(2, "0")}-` +
      `${String(convertedDate.day).padStart(2, "0")}`;

    if (!parseISODate(date)) {
      setMessage("تاریخ تبدیل‌شده معتبر نیست. دوباره تاریخ را انتخاب کنید.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    setReceipt(null);

    try {
      await apiRequest("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          date,
          startTime: slot.start,
          endTime: slot.end,
        }),
      });

      setReceipt({
        name: student?.fullName || "",
        date: formatPersianDate(date),
        weekday: getWeekday(date),
        start: formatTime(slot.start),
        end: formatTime(slot.end),
      });

      setMessage("رزرو با موفقیت ثبت شد.");
      setSelectedSlot("");
      await loadReservations();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ثبت رزرو ناموفق بود."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelReservation(id: number) {
    if (!window.confirm("آیا از لغو این رزرو مطمئن هستید؟")) {
      return;
    }

    setMessage("");

    try {
      await apiRequest(`/api/reservations/${id}`, {
        method: "DELETE",
      });

      setMessage("رزرو لغو شد.");
      await loadReservations();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "لغو رزرو ناموفق بود."
      );
    }
  }

  async function logout() {
    try {
      await apiRequest("/api/logout", { method: "POST" });
    } catch {
      // Clear the local view even if the request fails.
    }

    setStudent(null);
    setReservations([]);
    setReceipt(null);
    setPassword("");
    setMessage("از حساب خارج شدید.");
  }

  const selectedDateString = (() => {
  if (!selectedDate?.isValid) return "";

  const d = new DateObject(selectedDate).convert(gregorian);

  return (
    `${String(d.year).padStart(4, "0")}-` +
    `${String(d.month).padStart(2, "0")}-` +
    `${String(d.day).padStart(2, "0")}`
  );
  })();
  const selectedSlotData = TIME_SLOTS.find(
    (item) => item.start === selectedSlot
  );

  if (loading) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-slate-950 text-white"
      >
        در حال بارگذاری...
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8"
    >
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-3xl font-bold">
            سامانه رزرو آزمایشگاه معماری
          </h1>
          <p className="mt-3 text-slate-400">
            سامانه رزرو ویژه دانشجویان تأییدشده
          </p>
        </header>

        {!student ? (
          <section className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setView("login");
                  setMessage("");
                }}
                className={`rounded-lg p-3 ${
                  view === "login" ? "bg-blue-600" : "bg-slate-800"
                }`}
              >
                ورود
              </button>

              <button
                type="button"
                onClick={() => {
                  setView("register");
                  setMessage("");
                }}
                className={`rounded-lg p-3 ${
                  view === "register" ? "bg-blue-600" : "bg-slate-800"
                }`}
              >
                ثبت‌نام
              </button>
            </div>

            <form
              onSubmit={view === "login" ? handleLogin : handleRegister}
              className="space-y-4"
            >
              <div>
                <label className="mb-2 block">کد دانشجویی</label>
                <input
                  value={studentCode}
                  onChange={(event) => setStudentCode(event.target.value)}
                  required
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
                />
              </div>

              {view === "register" && (
                <>
                  <div>
                    <label className="mb-2 block">نام و نام خانوادگی</label>
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block">شماره تلفن</label>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      required
                      inputMode="tel"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="mb-2 block">رمز عبور</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  autoComplete={
                    view === "login" ? "current-password" : "new-password"
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
                />
                {view === "register" && (
                  <p className="mt-1 text-xs text-slate-400">
                    حداقل ۸ کاراکتر
                  </p>
                )}
              </div>

              <button
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 p-3 font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                {submitting
                  ? "لطفاً صبر کنید..."
                  : view === "login"
                    ? "ورود به حساب"
                    : "ثبت‌نام"}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">
                    سلام، {student.fullName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    کد دانشجویی: {student.studentCode}
                  </p>
                  <p className="mt-2 text-sm">
                    وضعیت حساب:{" "}
                    {student.status === "approved"
                      ? "تأییدشده"
                      : student.status === "rejected"
                        ? "ردشده"
                        : "در انتظار تأیید مدیر"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-800"
                >
                  خروج
                </button>
              </div>
            </section>

            {student.status === "approved" && (
              <>
                <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
                  <h2 className="mb-5 text-2xl font-bold">
                    رزرو آزمایشگاه
                  </h2>

                  <form onSubmit={handleReservation} className="space-y-6">
                    <div>
                      <label className="mb-3 block font-medium">
                        تاریخ رزرو — تقویم شمسی
                      </label>

                      <div className="persian-calendar">
                        <DatePicker
                          calendar={persian}
                          locale={persian_fa}
                          value={selectedDate}
                          
                          onChange={(value) => {
                            if (!value || Array.isArray(value) || !value.isValid) {
                              setSelectedDate(null);
                              setReceipt(null);
                              return;
                            }

                            setSelectedDate(value);
                            setReceipt(null);
                            setMessage("");
                          }}

                          minDate={new DateObject({
                            calendar: persian,
                            locale: persian_fa,
                          })}
                          format="YYYY/MM/DD"
                          calendarPosition="bottom-right"
                          inputClass="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
                          containerClassName="w-full"
                          placeholder="انتخاب تاریخ شمسی"
                          editable={false}
                          required
                        />
                      </div>

                      {selectedDateString && (
                        <p className="mt-2 text-sm text-slate-400">
                          تاریخ انتخابی:{" "}
                          {formatPersianDate(selectedDateString)}،{" "}
                          {getWeekday(selectedDateString)}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-3 block font-medium">
                        بازه زمانی — فقط یک گزینه انتخاب کنید
                      </label>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {TIME_SLOTS.map((slot) => {
                          const checked = selectedSlot === slot.start;

                          return (
                            <label
                              key={slot.start}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                                checked
                                  ? "border-blue-500 bg-blue-950"
                                  : "border-slate-700 bg-slate-950 hover:border-slate-500"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedSlot(
                                    checked ? "" : slot.start
                                  );
                                  setReceipt(null);
                                }}
                                className="h-5 w-5 accent-blue-500"
                              />

                              <span className="font-semibold">
                                {slot.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        submitting || !selectedDate || !selectedSlot
                      }
                      className="w-full rounded-xl bg-blue-600 p-4 font-bold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "در حال ثبت رزرو..." : "ثبت رزرو"}
                    </button>
                  </form>
                </section>

                {receipt && (
                  <section className="mb-8 rounded-2xl border-2 border-green-700 bg-slate-900 p-6">
                    <h2 className="mb-5 text-center text-2xl font-bold text-green-400">
                      فیش تأیید رزرو آزمایشگاه
                    </h2>

                    <div className="space-y-4 text-lg">
                      <p>
                        نام دانشجو:{" "}
                        <strong>{receipt.name}</strong>
                      </p>
                      <p>
                        تاریخ رزرو:{" "}
                        <strong>{receipt.date}</strong>
                      </p>
                      <p>
                        روز هفته:{" "}
                        <strong>{receipt.weekday}</strong>
                      </p>
                      <p>
                        ساعت شروع:{" "}
                        <strong>{receipt.start}</strong>
                      </p>
                      <p>
                        ساعت پایان:{" "}
                        <strong>{receipt.end}</strong>
                      </p>
                    </div>

                    <p className="mt-6 border-t border-slate-700 pt-4 text-center text-sm text-slate-400">
                      این فیش، تأیید ثبت رزرو در سامانه است.
                    </p>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="mt-5 w-full rounded-lg bg-slate-800 p-3 hover:bg-slate-700 print:hidden"
                    >
                      چاپ فیش رزرو
                    </button>
                  </section>
                )}

                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-2xl font-bold">رزروهای من</h2>
                    <button
                      type="button"
                      onClick={() => {
                        void loadReservations().catch((error) => {
                          setMessage(
                            error instanceof Error
                              ? error.message
                              : "بارگذاری رزروها ناموفق بود."
                          );
                        });
                      }}
                      className="rounded-lg bg-slate-800 px-4 py-2 hover:bg-slate-700"
                    >
                      به‌روزرسانی
                    </button>
                  </div>

                  {reservations.length === 0 ? (
                    <p className="text-slate-400">
                      هنوز رزروی ثبت نکرده‌اید.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {reservations.map((reservation) => (
                        <div
                          key={reservation.id}
                          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 p-4"
                        >
                          <div>
                            <p className="font-semibold">
                              {formatPersianDate(reservation.date)}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              {getWeekday(reservation.date)} —{" "}
                              {formatTime(reservation.start_time)} تا{" "}
                              {formatTime(reservation.end_time)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              void cancelReservation(reservation.id)
                            }
                            className="rounded-lg border border-red-800 px-4 py-2 text-red-300 hover:bg-red-950"
                          >
                            لغو رزرو
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4"
          >
            {message}
          </p>
        )}
      </div>

      <style jsx global>{`
        .persian-calendar .rmdp-wrapper {
          background: #0f172a;
          border: 1px solid #334155;
          color: white;
        }

        .persian-calendar .rmdp-header,
        .persian-calendar .rmdp-week-day {
          color: #cbd5e1;
        }

        .persian-calendar .rmdp-day:not(.rmdp-disabled):not(.rmdp-day-hidden)
          span:hover {
          background: #334155;
        }

        .persian-calendar .rmdp-day.rmdp-selected span {
          background: #2563eb;
        }

        .persian-calendar .rmdp-arrow {
          border-color: #cbd5e1;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          section:has(h2) * {
            visibility: visible;
          }
        }
      `}</style>
    </main>
  );
}
