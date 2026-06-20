// ==========================================
// app.js — Form Handling & Submission
// mcjn_jazzy — Commission Hub
// ==========================================

// ==========================================
// init() — page setup on load
// ==========================================
(function init() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // block past dates on the deadline picker
  const deadline = document.getElementById("deadline");
  if (deadline) deadline.min = new Date().toISOString().split("T")[0];

  const form = document.getElementById("commissionForm");
  if (form) form.addEventListener("submit", handleSubmit);
})();

// ==========================================
// handleSubmit() — validate, send, report
// ==========================================
async function handleSubmit(event) {
  event.preventDefault();

  const form    = event.currentTarget;
  const btn     = document.getElementById("submitBtn");
  const msg     = document.getElementById("formMsg");
  const label   = btn.querySelector(".btn-label");

  setMessage(msg, "", "");

  const payload = {
    customer:      form.customer.value.trim(),
    paintingClass: form.paintingClass.value,
    brief:         form.brief.value.trim(),
    refs:          form.refs.value.trim(),
    deadline:      form.deadline.value,
    website:       form.website.value // honeypot
  };

  // client-side guard (server re-checks)
  if (!payload.customer || !payload.paintingClass || !payload.brief || !payload.deadline) {
    setMessage(msg, "please fill the starred fields 🍓", "err");
    return;
  }

  btn.disabled = true;
  const original = label.textContent;
  label.textContent = "sending…";

  try {
    const res  = await fetch("/api/commission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      form.reset();
      setMessage(msg, "sent! your request landed safely 💌✨", "ok");
    } else {
      setMessage(msg, "something went wrong — please try again in a bit 🫧", "err");
    }
  } catch (_) {
    setMessage(msg, "couldn't reach the desk — check your connection and retry 🌧️", "err");
  } finally {
    btn.disabled = false;
    label.textContent = original;
  }
}

// ==========================================
// setMessage() — update the status line
// ==========================================
function setMessage(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.className = "form-msg" + (kind ? " " + kind : "");
}
