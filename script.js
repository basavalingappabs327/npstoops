// ============================================================
//  CONFIG – paste your Google Apps Script Web App URL here
//  (Deploy > New deployment > Web app > copy the "/exec" URL)
// ============================================================
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzl3EjWxtEh4K69SwIFWFGt_Yj9E9ifUOaw0vfp5YtPP_b9Z5dgta4qWTQLbXh5yIO4/exec";

// ------------------------------------------------------------
const form = document.getElementById("npsForm");
const statusEl = document.getElementById("status");
const submitButtons = form.querySelectorAll('button[type="submit"]');
const rememberBox = document.getElementById("remember");

// Only office/treasury details are remembered – never name, PRAN or GPF.
const REMEMBER_KEY = "nps_office_v1";
const REMEMBER_FIELDS = [
  "institution", "institutionplace", "taluk", "district",
  "treasuryoffi", "treasury", "treasuryloc"
];

const LABELS = {
  name: "ನೌಕರರ ಹೆಸರು", pran: "ಪ್ರಾನ್ ಸಂಖ್ಯೆ", gpf: "ಜಿಪಿಎಫ್ ಖಾತೆ ಸಂಖ್ಯೆ",
  doj: "ಕರ್ತವ್ಯಕ್ಕೆ ವರದಿ ಮಾಡಿದ ದಿನಾಂಕ", institution: "ಸಂಸ್ಥೆ",
  institutionplace: "ಸಂಸ್ಥೆಯ ಸ್ಥಳ", taluk: "ತಾಲ್ಲೂಕು", district: "ಜಿಲ್ಲೆ",
  treasuryoffi: "ಖಜಾನೆ ಅಧಿಕಾರಿ", treasury: "ಖಜಾನೆ ಪ್ರಕಾರ",
  treasuryloc: "ಖಜಾನೆ ಇರುವ ಸ್ಥಳ", today: "ದಿನಾಂಕ"
};

// ---------- helpers ----------
function setStatus(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (cls || "");
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// 2025-03-07 -> 07.03.2025  (same style as the template)
function toDMY(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d + "." + m + "." + y;
}

function clearErrors() {
  form.querySelectorAll(".field.invalid").forEach((f) => {
    f.classList.remove("invalid");
    const e = f.querySelector(".error");
    if (e) e.remove();
  });
}

function markInvalid(input, message) {
  const field = input.closest(".field");
  field.classList.add("invalid");
  const e = document.createElement("small");
  e.className = "error";
  e.textContent = message;
  field.appendChild(e);
}

function validate() {
  clearErrors();
  let firstBad = null;
  form.querySelectorAll("input[required], select[required]").forEach((el) => {
    if (el.type === "checkbox") return;
    const value = el.value.trim();
    let msg = "";
    if (!value) msg = "ಈ ಮಾಹಿತಿ ಅಗತ್ಯ";
    else if (el.pattern && !new RegExp("^(?:" + el.pattern + ")$").test(value)) msg = el.title || "ಸರಿಯಾದ ಮಾಹಿತಿ ನಮೂದಿಸಿ";
    if (msg) {
      markInvalid(el, msg);
      if (!firstBad) firstBad = el;
    }
  });
  if (firstBad) {
    firstBad.focus();
    setStatus("ಕೆಂಪು ಬಣ್ಣದ ಕ್ಷೇತ್ರಗಳನ್ನು ಸರಿಪಡಿಸಿ.", "err");
    return false;
  }
  return true;
}

function collect() {
  const fd = new FormData(form);
  const data = {};
  for (const [k, v] of fd.entries()) data[k] = String(v).trim();
  data.doj = toDMY(data.doj);
  data.today = toDMY(data.today);
  return data;
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- remember office details (opt-in) ----------
function loadRemembered() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
    if (!saved) return;
    REMEMBER_FIELDS.forEach((id) => {
      if (saved[id]) document.getElementById(id).value = saved[id];
    });
    rememberBox.checked = true;
  } catch (_) { /* storage unavailable – ignore */ }
}

function saveRemembered() {
  try {
    if (!rememberBox.checked) {
      localStorage.removeItem(REMEMBER_KEY);
      return;
    }
    const out = {};
    REMEMBER_FIELDS.forEach((id) => (out[id] = document.getElementById(id).value));
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(out));
  } catch (_) { /* ignore */ }
}

// ---------- submit ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const format = event.submitter ? event.submitter.value : "pdf";

  if (WEB_APP_URL.includes("PASTE_YOUR")) {
    setStatus("script.js ನಲ್ಲಿ WEB_APP_URL ಅನ್ನು ಹೊಂದಿಸಿಲ್ಲ.", "err");
    return;
  }
  if (!validate()) return;

  saveRemembered();
  const payload = collect();
  payload.format = format;

  submitButtons.forEach((b) => (b.disabled = true));
  setStatus("ದಾಖಲೆ ಸಿದ್ಧವಾಗುತ್ತಿದೆ… 10–20 ಸೆಕೆಂಡ್ ಕಾಯಿರಿ.", "busy");

  try {
    // text/plain avoids a CORS pre-flight request, which Apps Script cannot answer.
    const res = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Server error " + res.status);
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "Unknown error");

    download(base64ToBlob(out.base64, out.mime), out.filename);
    setStatus("ದಾಖಲೆ ಡೌನ್‌ಲೋಡ್ ಆಗಿದೆ: " + out.filename, "ok");
  } catch (err) {
    console.error(err);
    setStatus("ದಾಖಲೆ ರಚಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ: " + err.message, "err");
  } finally {
    submitButtons.forEach((b) => (b.disabled = false));
  }
});

// clear inline error as soon as the user edits the field
form.addEventListener("input", (e) => {
  const f = e.target.closest(".field");
  if (f && f.classList.contains("invalid")) {
    f.classList.remove("invalid");
    const er = f.querySelector(".error");
    if (er) er.remove();
  }
});

document.getElementById("clearBtn").addEventListener("click", () => {
  form.reset();
  clearErrors();
  document.getElementById("today").value = todayISO();
  rememberBox.checked = false;
  try { localStorage.removeItem(REMEMBER_KEY); } catch (_) {}
  setStatus("");
});

// ---------- init ----------
document.getElementById("today").value = todayISO();
loadRemembered();
