# Dev & Gamer Toolkit — دليل التشغيل

## ليه فيه سيرفر خلفي الحين؟
مفتاح Infobip **سري** — ما يصح يكون داخل كود يعمل في متصفح الزائر لأن أي شخص يقدر يشوفه من "عرض المصدر" ويستخدمه. لذلك:
- `server.js` = يشتغل عندك (أو على استضافة) ويحتفظ بالمفتاح بأمان في متغيرات البيئة.
- `public/index.html` + `public/script.js` = الموقع نفسه، يتكلم فقط مع `server.js` عبر `/api/send-otp` و `/api/verify-otp`.

## هيكل الملفات
```
dgt-backend/
├── server.js          ← السيرفر (يحتفظ بمفتاح Infobip)
├── package.json
├── .env.example        ← انسخه إلى .env واملأ القيم
└── public/
    ├── index.html       ← الموقع
    └── script.js         ← منطق الموقع (يكلم السيرفر فقط)
```

## التشغيل المحلي (للتجربة على جهازك)
يتطلب [Node.js](https://nodejs.org) نسخة 18 أو أحدث.

```bash
cd dgt-backend
npm install
cp .env.example .env
```

افتح `.env` وتأكد من القيم:
```
INFOBIP_API_KEY=a625e1e8caffe12b7d0d8474244bf896-e5c1bb59-0da5-406b-8484-b6a245de45df
INFOBIP_BASE_URL=jr2r5v.api.infobip.com
SENDER_EMAIL=noreply@yourdomain.com     ← غيّره لبريد مُتحقق منه في حسابك
```

> ⚠️ **مهم جداً بخصوص SENDER_EMAIL**: Infobip يرفض إرسال أي بريد إذا لم يكن الدومين المُرسِل (بعد الـ @) متحققاً منه في حسابك (Verified Domain في لوحة تحكم Infobip، قسم Email). إذا ما تحققت من دومين بعد:
> 1. ادخل لوحة تحكم Infobip → Email → Senders/Domains.
> 2. تحقق من دومينك (إضافة سجلات DNS: SPF/DKIM) أو استخدم بريد تجريبي يوفره Infobip للحسابات التجريبية إن وُجد.
> 3. بدون بريد مُرسل متحقق منه، الطلبات سترجع خطأ 400/401 من Infobip.

ثم شغّل السيرفر:
```bash
npm start
```

افتح المتصفح على: **http://localhost:3000**
(الموقع يُخدم تلقائياً من نفس السيرفر، ما تحتاج تفتح index.html كملف منفصل).

## النشر (Deployment) على استضافة حقيقية
أي استضافة تدعم Node.js تكفي، مثل Render أو Railway أو Fly.io (لديك خبرة سابقة مع KataBump لبوت بايثون — تأكد أنها تدعم Node.js أيضاً قبل استخدامها لهذا المشروع، أو اختر استضافة مخصصة لـ Node مثل Render المجانية):

1. ارفع محتوى مجلد `dgt-backend` إلى مستودع GitHub.
2. في لوحة الاستضافة: أنشئ خدمة "Web Service" جديدة، اربطها بالمستودع.
3. أمر التشغيل (Start Command): `npm start`
4. أضف متغيرات البيئة نفسها الموجودة في `.env` من إعدادات الاستضافة (لا ترفع ملف `.env` نفسه إلى GitHub — أضف `.env` إلى `.gitignore`).
5. بعد النشر، الموقع سيعمل على الرابط الذي تعطيك إياه الاستضافة مباشرة (لأن `server.js` يخدم الملفات الأمامية بنفسه).

## اختبار سريع بدون فتح المتصفح
```bash
curl -X POST http://localhost:3000/api/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

## ملاحظات أمان للمستقبل
- التخزين المؤقت للرموز والجلسات في هذا الكود يعيش في ذاكرة السيرفر (Map) — يُمسح عند إعادة تشغيل السيرفر. لمشروع أكبر، استبدله بقاعدة بيانات مثل Redis.
- عدّل `ALLOWED_ORIGIN` في `.env` إلى دومين موقعك الحقيقي بدل `*` بعد النشر، لمنع مواقع أخرى من استدعاء سيرفرك.
- لا تشارك مفتاح `INFOBIP_API_KEY` أو ملف `.env` مع أي أحد، ولا ترفعه على GitHub.
