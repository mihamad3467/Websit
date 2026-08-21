/**
 * Dev & Gamer Toolkit — Backend (OTP over Infobip Email)
 * -------------------------------------------------------
 * هذا السيرفر هو الوحيد الذي يعرف مفتاح Infobip الحقيقي.
 * الموقع (index.html) لا يتصل بـ Infobip مباشرة أبداً — فقط يتصل بهذا السيرفر.
 *
 * تشغيل محلي:
 *   1) npm install
 *   2) انسخ .env.example إلى .env واملأ القيم
 *   3) npm start
 *   4) افتح index.html وعدّل API_BASE في أعلى ملف script.js إلى http://localhost:3000
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const {
  INFOBIP_API_KEY,
  INFOBIP_BASE_URL,     // مثال: jr2r5v.api.infobip.com  (بدون https://)
  SENDER_EMAIL,         // بريد مُتحقق منه في حساب Infobip، مثال: noreply@yourdomain.com
  SENDER_NAME = "Dev & Gamer Toolkit",
  PORT = 3000,
  ALLOWED_ORIGIN = "*", // في الإنتاج: ضع دومين موقعك بدلاً من *
} = process.env;

if (!INFOBIP_API_KEY || !INFOBIP_BASE_URL || !SENDER_EMAIL) {
  console.error("❌ خطأ: تأكد من تعبئة INFOBIP_API_KEY و INFOBIP_BASE_URL و SENDER_EMAIL في ملف .env");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public"))); // يخدم index.html و script.js

/* ------------------------------------------------------------------
   تخزين مؤقت في الذاكرة لرموز التحقق والجلسات.
   ملاحظة: هذا مناسب للتجربة/مشروع صغير. لإنتاج حقيقي بحجم أكبر
   استخدم قاعدة بيانات (Redis/Postgres) لأن الذاكرة تُمسح عند إعادة تشغيل السيرفر.
------------------------------------------------------------------- */
const otpStore = new Map();     // email -> { code, expiresAt, attempts }
const sessionStore = new Map(); // token -> { email, expiresAt }

const OTP_TTL_MS = 5 * 60 * 1000;        // صلاحية الرمز: 5 دقائق
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // صلاحية الجلسة: 7 أيام
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;    // 30 ثانية بين كل إرسال وآخر لنفس البريد

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ""));
}

/* ------------------------- إرسال البريد عبر Infobip ------------------------- */
async function sendOtpEmail(toEmail, code) {
  const url = `https://${INFOBIP_BASE_URL}/email/3/send`;

  const form = new FormData();
  form.append("from", `${SENDER_NAME} <${SENDER_EMAIL}>`);
  form.append("to", toEmail);
  form.append("subject", `رمز التحقق الخاص بك: ${code}`);
  form.append("text", `رمز التحقق الخاص بك في Dev & Gamer Toolkit هو: ${code}\nصالح لمدة 5 دقائق. إذا لم تطلب هذا الرمز تجاهل الرسالة.`);
  form.append("html", `
    <div style="font-family:Arial,sans-serif;background:#070b14;padding:32px;color:#eef2ff;">
      <div style="max-width:420px;margin:0 auto;background:#0e1526;border:1px solid #232f4d;border-radius:16px;padding:28px;text-align:center;">
        <h2 style="color:#2be3ff;margin:0 0 8px;">Dev &amp; Gamer Toolkit</h2>
        <p style="color:#aab4d4;margin:0 0 20px;font-size:14px;">رمز التحقق الخاص بك</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#2be3ff;background:#070b14;border-radius:10px;padding:16px;margin-bottom:16px;">${code}</div>
        <p style="color:#6b769a;font-size:12px;">صالح لمدة 5 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.</p>
      </div>
    </div>
  `);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `App ${INFOBIP_API_KEY}`,
      Accept: "application/json",
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Infobip error (${res.status}): ${errText}`);
  }
  return res.json();
}

/* ------------------------------- Routes ------------------------------- */

// 1) طلب إرسال رمز تحقق
app.post("/api/send-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "بريد إلكتروني غير صالح." });
    }

    const existing = otpStore.get(email);
    if (existing && Date.now() - (existing.expiresAt - OTP_TTL_MS) < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - (existing.expiresAt - OTP_TTL_MS))) / 1000);
      return res.status(429).json({ ok: false, error: `انتظر ${waitSec} ثانية قبل إعادة الإرسال.` });
    }

    const code = generateOtp();
    otpStore.set(email, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    await sendOtpEmail(email, code);

    res.json({ ok: true, message: "تم إرسال رمز التحقق إلى بريدك." });
  } catch (err) {
    console.error("send-otp error:", err.message);
    res.status(500).json({ ok: false, error: "تعذر إرسال البريد. حاول مرة أخرى لاحقاً." });
  }
});

// 2) التحقق من الرمز
app.post("/api/verify-otp", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();

  const record = otpStore.get(email);
  if (!record) {
    return res.status(400).json({ ok: false, error: "لا يوجد رمز فعال لهذا البريد. اطلب رمزاً جديداً." });
  }
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ ok: false, error: "انتهت صلاحية الرمز. اطلب رمزاً جديداً." });
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(email);
    return res.status(429).json({ ok: false, error: "محاولات كثيرة خاطئة. اطلب رمزاً جديداً." });
  }
  if (record.code !== code) {
    record.attempts += 1;
    return res.status(400).json({ ok: false, error: "الرمز غير صحيح." });
  }

  // نجاح — أنشئ جلسة
  otpStore.delete(email);
  const token = generateToken();
  sessionStore.set(token, { email, expiresAt: Date.now() + SESSION_TTL_MS });

  res.json({ ok: true, token, email });
});

// 3) التحقق من صلاحية جلسة محفوظة (يُستخدم عند إعادة فتح الموقع)
app.post("/api/session", (req, res) => {
  const token = String(req.body.token || "");
  const record = sessionStore.get(token);
  if (!record || Date.now() > record.expiresAt) {
    sessionStore.delete(token);
    return res.status(401).json({ ok: false });
  }
  res.json({ ok: true, email: record.email });
});

// 4) تسجيل الخروج
app.post("/api/logout", (req, res) => {
  const token = String(req.body.token || "");
  sessionStore.delete(token);
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({ ok: true, service: "dgt-backend" }));

app.listen(PORT, () => {
  console.log(`✅ Dev & Gamer Toolkit backend running on http://localhost:${PORT}`);
});
