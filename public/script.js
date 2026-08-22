(function () {
  "use strict";

  /* ============================================================
     إعداد الاتصال بالسيرفر الخلفي
     غيّر هذا الرابط حسب مكان تشغيل السيرفر (server.js):
       - أثناء التطوير المحلي: http://localhost:3000
       - بعد النشر: رابط استضافتك، مثال: https://your-backend.onrender.com
     ملاحظة: إذا فتحت index.html مباشرة كملف (file://) بدون تشغيل السيرفر،
     ستفشل طلبات الإرسال والتحقق لأن لا يوجد سيرفر يستقبلها.
     ============================================================ */
  const API_BASE = window.location.origin.startsWith("http")
    ? window.location.origin
    : "http://localhost:3000";

  const SESSION_KEY = "dgt_session_token";
  let pendingEmail = "";
  let resendCooldownTimer = null;

  const authGate   = document.getElementById("authGate");
  const app        = document.getElementById("app");
  const stepEmail  = document.getElementById("stepEmail");
  const stepOtp    = document.getElementById("stepOtp");
  const emailInput = document.getElementById("emailInput");
  const emailError = document.getElementById("emailError");
  const otpError   = document.getElementById("otpError");
  const otpInputs  = Array.from(document.querySelectorAll(".otp-digit"));
  const sendBtn    = document.getElementById("sendCodeBtn");
  const sendText   = document.getElementById("sendCodeText");
  const verifyBtn  = document.getElementById("verifyBtn");
  const verifyText = document.getElementById("verifyText");
  const resendLink = document.getElementById("resendLink");

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }
  function setLoading(btn, textEl, loading, label) {
    btn.disabled = loading;
    textEl.innerHTML = loading ? '<span class="spinner"></span> جاري الإرسال...' : label;
  }
  async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "حدث خطأ غير متوقع، حاول مرة أخرى.");
    }
    return data;
  }

  async function sendCode() {
    const email = emailInput.value.trim();
    emailError.textContent = "";
    emailError.classList.remove("auth-error", "auth-success");
    if (!isValidEmail(email)) {
      emailError.textContent = "الرجاء إدخال بريد إلكتروني صحيح.";
      emailError.classList.add("auth-error");
      return;
    }
    pendingEmail = email;
    setLoading(sendBtn, sendText, true);
    try {
      await apiPost("/api/send-otp", { email });
      document.getElementById("authHeadline").textContent = "تحقق من بريدك";
      document.getElementById("authSub").textContent = "أرسلنا رمزاً حقيقياً إلى " + email;
      stepEmail.style.display = "none";
      stepOtp.style.display = "block";
      otpInputs.forEach(i => (i.value = ""));
      otpInputs[0].focus();
      startResendCooldown();
    } catch (err) {
      emailError.textContent = err.message;
      emailError.classList.add("auth-error");
    } finally {
      setLoading(sendBtn, sendText, false, "إرسال رمز التحقق");
    }
  }

  function collectOtp() {
    return otpInputs.map(i => i.value).join("");
  }

  async function verifyCode() {
    otpError.textContent = "";
    otpError.classList.remove("auth-error");
    const code = collectOtp();
    if (code.length < 6) {
      otpError.textContent = "الرجاء إدخال الرمز كاملاً (6 أرقام).";
      otpError.classList.add("auth-error");
      return;
    }
    setLoading(verifyBtn, verifyText, true);
    try {
      const data = await apiPost("/api/verify-otp", { email: pendingEmail, code });
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, email: data.email }));
      enterApp(data.email);
    } catch (err) {
      otpError.textContent = err.message;
      otpError.classList.add("auth-error");
      otpInputs.forEach(i => (i.value = ""));
      otpInputs[0].focus();
    } finally {
      setLoading(verifyBtn, verifyText, false, "تحقق وادخل إلى الأدوات");
    }
  }

  function startResendCooldown() {
    let seconds = 30;
    resendLink.classList.add("disabled");
    resendLink.textContent = `إعادة الإرسال متاحة خلال ${seconds} ثانية`;
    clearInterval(resendCooldownTimer);
    resendCooldownTimer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(resendCooldownTimer);
        resendLink.classList.remove("disabled");
        resendLink.textContent = "إعادة إرسال الرمز";
      } else {
        resendLink.textContent = `إعادة الإرسال متاحة خلال ${seconds} ثانية`;
      }
    }, 1000);
  }

  function enterApp(email) {
    authGate.style.display = "none";
    app.classList.add("active");
    document.getElementById("userEmailChip").textContent = email;
  }

  sendBtn.addEventListener("click", sendCode);
  emailInput.addEventListener("keydown", e => { if (e.key === "Enter") sendCode(); });
  verifyBtn.addEventListener("click", verifyCode);

  resendLink.addEventListener("click", async e => {
    e.preventDefault();
    if (resendLink.classList.contains("disabled")) return;
    otpError.textContent = "";
    try {
      await apiPost("/api/send-otp", { email: pendingEmail });
      otpError.textContent = "تم إرسال رمز جديد.";
      otpError.classList.add("auth-success");
      startResendCooldown();
    } catch (err) {
      otpError.textContent = err.message;
      otpError.classList.add("auth-error");
    }
  });

  document.getElementById("backLink").addEventListener("click", e => {
    e.preventDefault();
    stepOtp.style.display = "none";
    stepEmail.style.display = "block";
    document.getElementById("authHeadline").textContent = "تسجيل الدخول عبر البريد الإلكتروني";
    document.getElementById("authSub").textContent = "أدخل بريدك للحصول على رمز تحقق حقيقي";
  });

  otpInputs.forEach((inp, idx) => {
    inp.addEventListener("input", () => {
      inp.value = inp.value.replace(/[^0-9]/g, "").slice(0, 1);
      if (inp.value && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
    });
    inp.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !inp.value && idx > 0) otpInputs[idx - 1].focus();
      if (e.key === "Enter") verifyCode();
    });
    inp.addEventListener("paste", e => {
      const text = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
      if (text.length) {
        e.preventDefault();
        text.split("").slice(0, 6).forEach((ch, i) => { if (otpInputs[i]) otpInputs[i].value = ch; });
        otpInputs[Math.min(text.length, 6) - 1].focus();
      }
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const { token } = JSON.parse(raw);
        await apiPost("/api/logout", { token }).catch(() => {});
      }
    } finally {
      localStorage.removeItem(SESSION_KEY);
      location.reload();
    }
  });

  // استعادة الجلسة عند فتح الصفحة من جديد
  (async function restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const { token, email } = JSON.parse(raw);
      const data = await apiPost("/api/session", { token });
      if (data.ok) enterApp(data.email || email);
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
    }
  })();

  /* ============================================================
     تأثير Ripple على الأزرار
     ============================================================ */
  document.querySelectorAll(".ripple-btn").forEach(btn => {
    btn.addEventListener("click", function (e) {
      const rect = btn.getBoundingClientRect();
      const circle = document.createElement("span");
      const size = Math.max(rect.width, rect.height);
      circle.className = "ripple";
      circle.style.width = circle.style.height = size + "px";
      circle.style.left = (e.clientX - rect.left - size / 2) + "px";
      circle.style.top = (e.clientY - rect.top - size / 2) + "px";
      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);
    });
  });

  /* ============================================================
     تأثير توهج عند تحريك الماوس فوق بطاقات الأدوات
     ============================================================ */
  document.querySelectorAll(".tool-card").forEach(card => {
    card.addEventListener("mousemove", e => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width * 100) + "%");
      card.style.setProperty("--my", ((e.clientY - rect.top) / rect.height * 100) + "%");
    });
  });

  /* ============================================================
     TOOL PANEL SWITCHING
     ============================================================ */
  const toolCards = document.querySelectorAll(".tool-card");
  const panels = document.querySelectorAll(".panel");

  function openTool(name) {
    toolCards.forEach(c => c.classList.toggle("active", c.dataset.tool === name));
    panels.forEach(p => p.classList.toggle("active", p.id === "panel-" + name));
    document.getElementById("panel-" + name).scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function closeAllPanels() {
    toolCards.forEach(c => c.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));
  }
  toolCards.forEach(c => c.addEventListener("click", () => openTool(c.dataset.tool)));
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeAllPanels));
  document.getElementById("scrollTop").addEventListener("click", e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });

  function copyText(text, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
      if (btnEl) {
        const original = btnEl.textContent;
        btnEl.textContent = "✔";
        setTimeout(() => (btnEl.textContent = original), 1200);
      }
    }).catch(() => {});
  }
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  /* ============================================================
     TOOL 1 — PASSWORD GENERATOR
     ============================================================ */
  const pwOutput   = document.getElementById("pwOutput");
  const pwLength   = document.getElementById("pwLength");
  const pwLenLabel = document.getElementById("pwLenLabel");
  const pwUpper    = document.getElementById("pwUpper");
  const pwNumbers  = document.getElementById("pwNumbers");
  const pwSymbols  = document.getElementById("pwSymbols");
  const pwExclude  = document.getElementById("pwExclude");
  const strengthFill  = document.getElementById("strengthFill");
  const strengthLabel = document.getElementById("strengthLabel");

  const LOWER = "abcdefghijklmnopqrstuvwxyz";
  const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const NUMS  = "0123456789";
  const SYMS  = "!@#$%^&*()_-+=?";
  const AMBIGUOUS = "l1IO0oB8";

  function buildPool() {
    let pool = LOWER;
    if (pwUpper.checked) pool += UPPER;
    if (pwNumbers.checked) pool += NUMS;
    if (pwSymbols.checked) pool += SYMS;
    if (pwExclude.checked) {
      pool = pool.split("").filter(ch => !AMBIGUOUS.includes(ch)).join("");
    }
    return pool || LOWER;
  }

  function generatePassword() {
    const pool = buildPool();
    const len = parseInt(pwLength.value, 10);
    let out = "";
    const arr = new Uint32Array(len);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
      for (let i = 0; i < len; i++) out += pool[arr[i] % pool.length];
    } else {
      for (let i = 0; i < len; i++) out += pool[Math.floor(Math.random() * pool.length)];
    }
    pwOutput.textContent = out;
    updateStrength(out);
    return out;
  }

  function updateStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 14) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
      { max: 1, w: "15%", color: "var(--danger)", label: "ضعيفة جداً" },
      { max: 2, w: "35%", color: "var(--danger)", label: "ضعيفة" },
      { max: 3, w: "60%", color: "var(--warn)",   label: "متوسطة" },
      { max: 4, w: "82%", color: "var(--ok)",     label: "قوية" },
      { max: 5, w: "100%",color: "var(--ok)",     label: "قوية جداً" },
    ];
    const lvl = levels.find(l => score <= l.max) || levels[levels.length - 1];
    strengthFill.style.width = lvl.w;
    strengthFill.style.background = lvl.color;
    strengthLabel.textContent = "القوة: " + lvl.label;
  }

  pwLength.addEventListener("input", () => { pwLenLabel.textContent = pwLength.value; generatePassword(); });
  [pwUpper, pwNumbers, pwSymbols, pwExclude].forEach(el => el.addEventListener("change", generatePassword));
  document.getElementById("pwGenerate").addEventListener("click", generatePassword);
  document.getElementById("pwRefresh").addEventListener("click", generatePassword);
  document.getElementById("pwCopy").addEventListener("click", () => copyText(pwOutput.textContent, document.getElementById("pwCopy")));

  /* ============================================================
     TOOL 2 — COLOR PICKER
     ============================================================ */
  const colorInput  = document.getElementById("colorInput");
  const colorSwatch = document.getElementById("colorSwatch");
  const valHex = document.getElementById("valHex");
  const valRgb = document.getElementById("valRgb");
  const valHsl = document.getElementById("valHsl");
  const paletteRow = document.getElementById("paletteRow");

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function renderPalette(h, s, l) {
    paletteRow.innerHTML = "";
    const variants = [
      { l: Math.max(10, l - 30) }, { l: Math.max(10, l - 15) },
      { l }, { l: Math.min(90, l + 15) }, { l: Math.min(95, l + 30) },
    ];
    variants.forEach(v => {
      const { r, g, b } = hslToRgb(h, s, v.l);
      const hex = rgbToHex(r, g, b);
      const sw = document.createElement("div");
      sw.className = "palette-swatch";
      sw.style.background = hex;
      sw.title = hex;
      sw.addEventListener("click", () => { colorInput.value = hex; updateColor(); });
      paletteRow.appendChild(sw);
    });
  }

  function updateColor() {
    const hex = colorInput.value;
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    colorSwatch.style.background = hex;
    valHex.textContent = hex.toUpperCase();
    valRgb.textContent = `rgb(${r},${g},${b})`;
    valHsl.textContent = `hsl(${h},${s}%,${l}%)`;
    renderPalette(h, s, l);
  }
  colorInput.addEventListener("input", updateColor);
  document.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => copyText(document.getElementById(btn.dataset.copy).textContent, btn));
  });

  /* ============================================================
     TOOL 3 — TO-DO LIST
     ============================================================ */
  const TODO_KEY = "dgt_todos";
  const todoInput = document.getElementById("todoInput");
  const todoPriority = document.getElementById("todoPriority");
  const todoList  = document.getElementById("todoList");
  const todoCount = document.getElementById("todoCount");

  function loadTodos() {
    try { return JSON.parse(localStorage.getItem(TODO_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveTodos(todos) { localStorage.setItem(TODO_KEY, JSON.stringify(todos)); }

  function renderTodos() {
    const todos = loadTodos();
    todoList.innerHTML = "";
    const remaining = todos.filter(t => !t.done).length;
    todoCount.textContent = `${todos.length} مهمة — ${remaining} متبقية`;
    if (todos.length === 0) {
      todoList.innerHTML = '<div class="todo-empty">لا توجد مهام بعد — أضف أول مهمة لك ✨</div>';
      return;
    }
    const order = { high: 0, medium: 1, low: 2 };
    todos
      .map((t, idx) => ({ ...t, idx }))
      .sort((a, b) => (a.done - b.done) || (order[a.priority] - order[b.priority]))
      .forEach(t => {
        const row = document.createElement("div");
        row.className = "todo-item";
        row.innerHTML = `
          <button class="todo-check ${t.done ? "done" : ""}" data-idx="${t.idx}">${t.done ? "✓" : ""}</button>
          <span class="priority-dot priority-${t.priority || "medium"}"></span>
          <span class="todo-text ${t.done ? "done" : ""}">${escapeHtml(t.text)}</span>
          <button class="todo-del" data-idx="${t.idx}">🗑</button>
        `;
        todoList.appendChild(row);
      });
  }
  function addTodo() {
    const text = todoInput.value.trim();
    if (!text) return;
    const todos = loadTodos();
    todos.unshift({ text, done: false, priority: todoPriority.value });
    saveTodos(todos);
    todoInput.value = "";
    renderTodos();
  }
  document.getElementById("todoAdd").addEventListener("click", addTodo);
  todoInput.addEventListener("keydown", e => { if (e.key === "Enter") addTodo(); });
  document.getElementById("clearDone").addEventListener("click", () => {
    const todos = loadTodos().filter(t => !t.done);
    saveTodos(todos);
    renderTodos();
  });
  todoList.addEventListener("click", e => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;
    const todos = loadTodos();
    if (e.target.classList.contains("todo-check")) {
      todos[idx].done = !todos[idx].done;
      saveTodos(todos);
      renderTodos();
    } else if (e.target.classList.contains("todo-del")) {
      todos.splice(idx, 1);
      saveTodos(todos);
      renderTodos();
    }
  });
  renderTodos();

  /* ============================================================
     TOOL 4 — DECISION MAKER
     ============================================================ */
  const dmInput  = document.getElementById("dmInput");
  const dmChips  = document.getElementById("dmChips");
  const dmResult = document.getElementById("dmResult");
  const dmPick   = document.getElementById("dmPick");
  let dmOptions = [];

  function renderChips() {
    dmChips.innerHTML = "";
    dmOptions.forEach((opt, idx) => {
      const chip = document.createElement("div");
      chip.className = "dm-chip";
      chip.innerHTML = `<span>${escapeHtml(opt)}</span><button data-idx="${idx}">✕</button>`;
      dmChips.appendChild(chip);
    });
  }
  function addOption() {
    const val = dmInput.value.trim();
    if (!val) return;
    dmOptions.push(val);
    dmInput.value = "";
    renderChips();
  }
  document.getElementById("dmAdd").addEventListener("click", addOption);
  dmInput.addEventListener("keydown", e => { if (e.key === "Enter") addOption(); });
  dmChips.addEventListener("click", e => {
    const idx = e.target.dataset.idx;
    if (idx === undefined) return;
    dmOptions.splice(idx, 1);
    renderChips();
  });
  document.getElementById("dmSpin").addEventListener("click", () => {
    if (dmOptions.length === 0) {
      dmPick.textContent = "أضف خيارات أولاً!";
      dmResult.classList.add("show");
      return;
    }
    const choice = dmOptions[Math.floor(Math.random() * dmOptions.length)];
    dmPick.textContent = choice;
    dmResult.classList.remove("show");
    void dmResult.offsetWidth;
    dmResult.classList.add("show");
  });

  /* init */
  updateColor();
  generatePassword();
})();
