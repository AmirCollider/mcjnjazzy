// ==========================================
// app.js — Form Handling, Theme Toggle & UI
// mcjn_jazzy — Commission Hub
// ==========================================

// ==========================================
// init() — page setup on load
// ==========================================
(function init() {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // block past dates on the deadline date picker
  const deadlineDate = document.getElementById("deadlineDate");
  if (deadlineDate) deadlineDate.min = new Date().toISOString().split("T")[0];

  const form = document.getElementById("commissionForm");
  if (form) form.addEventListener("submit", handleSubmit);

  initThemeToggle();
  initReveal();
  initStats();
  initIgStats();
  initParallax();
  initLightbox();
  initDeadlinePicker();
})();

// ==========================================
// initThemeToggle() — flip + remember theme
// ==========================================
function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  btn.addEventListener("click", function () {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });
}

// ==========================================
// initReveal() — animate cards in as they scroll into view
// ==========================================
function initReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  items.forEach((el) => io.observe(el));
}

// ==========================================
// initStats() — count-up the bio numbers when seen
// ==========================================
function initStats() {
  const nums = document.querySelectorAll(".stat b[data-count]");
  if (!nums.length) return;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => (n >= 1000 ? (Math.round(n / 100) / 10) + "K" : Math.round(n).toString());

  function run(el) {
    const target = parseFloat(el.dataset.count) || 0;
    if (reduce) { el.textContent = fmt(target); return; }
    const dur = 1100;
    const start = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = fmt(target);
    })(start);
  }

  if (!("IntersectionObserver" in window)) { nums.forEach(run); return; }
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { run(entry.target); io.unobserve(entry.target); }
    });
  }, { threshold: 0.5 });
  nums.forEach((el) => io.observe(el));
}

// ==========================================
// initIgStats() — pull live Instagram counts from /api/igstats
// (falls back silently to the static numbers if unavailable)
// ==========================================
function initIgStats() {
  const posts     = document.getElementById("statPosts");
  const followers = document.getElementById("statFollowers");
  const following = document.getElementById("statFollowing");
  if (!posts && !followers && !following) return;

  const fmt = (n) => (n >= 1000 ? (Math.round(n / 100) / 10) + "K" : Math.round(n).toString());

  fetch("/api/igstats")
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data.ok || !data.stats) return;
      const s = data.stats;
      if (posts && typeof s.posts === "number") { posts.dataset.count = s.posts; posts.textContent = fmt(s.posts); }
      if (followers && typeof s.followers === "number") { followers.dataset.count = s.followers; followers.textContent = fmt(s.followers); }
      if (following && typeof s.following === "number") { following.dataset.count = s.following; following.textContent = fmt(s.following); }
    })
    .catch(function () { /* keep the static numbers */ });
}

// ==========================================
// initParallax() — drift background doodles with the pointer
// ==========================================
function initParallax() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (matchMedia("(pointer: coarse)").matches) return;

  const doodles = document.querySelectorAll(".sky .doodle");
  if (!doodles.length) return;

  let tx = 0, ty = 0, raf = null;
  window.addEventListener("mousemove", function (e) {
    tx = (e.clientX / window.innerWidth - 0.5);
    ty = (e.clientY / window.innerHeight - 0.5);
    if (!raf) raf = requestAnimationFrame(apply);
  });

  function apply() {
    doodles.forEach(function (d) {
      const depth = parseFloat(d.dataset.depth) || 12;
      d.style.transform = "translate(" + (tx * depth) + "px," + (ty * depth) + "px)";
    });
    raf = null;
  }
}

// ==========================================
// initLightbox() — click any artwork to zoom it
// ==========================================
function initLightbox() {
  const box = document.getElementById("lightbox");
  if (!box) return;
  const big = box.querySelector("img");

  document.querySelectorAll(".art img").forEach(function (img) {
    img.closest(".art").addEventListener("click", function () {
      big.src = img.currentSrc || img.src;
      box.classList.add("open");
      box.setAttribute("aria-hidden", "false");
    });
  });

  function close() {
    box.classList.remove("open");
    box.setAttribute("aria-hidden", "true");
    big.src = "";
  }
  box.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
}

// ==========================================
// initDeadlinePicker() — flexible deadline chips + optional date
// ==========================================
function initDeadlinePicker() {
  const pick = document.getElementById("deadlinePick");
  const dateInput = document.getElementById("deadlineDate");
  const hidden = document.getElementById("deadline");
  if (!pick || !hidden) return;

  pick.addEventListener("click", function (e) {
    const btn = e.target.closest(".pick");
    if (!btn) return;

    Array.prototype.forEach.call(pick.querySelectorAll(".pick"), function (b) {
      b.classList.remove("is-active");
    });
    btn.classList.add("is-active");

    const val = btn.getAttribute("data-deadline");
    if (val === "__date__") {
      dateInput.classList.remove("is-hidden");
      hidden.value = dateInput.value ? "📅 by " + dateInput.value : "";
      dateInput.focus();
    } else {
      dateInput.classList.add("is-hidden");
      hidden.value = val;
    }
  });

  dateInput.addEventListener("change", function () {
    hidden.value = dateInput.value ? "📅 by " + dateInput.value : "";
  });
}

// ==========================================
// resetDeadline() — clear picker state after a send
// ==========================================
function resetDeadline() {
  const pick = document.getElementById("deadlinePick");
  const dateInput = document.getElementById("deadlineDate");
  const hidden = document.getElementById("deadline");
  if (pick) Array.prototype.forEach.call(pick.querySelectorAll(".pick"), function (b) { b.classList.remove("is-active"); });
  if (dateInput) { dateInput.value = ""; dateInput.classList.add("is-hidden"); }
  if (hidden) hidden.value = "";
}

// ==========================================
// burstConfetti() — strawberry pop on success
// ==========================================
function burstConfetti(anchor) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const pieces = ["🍓", "✨", "🍰", "★", "🫧"];

  for (let i = 0; i < 18; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.textContent = pieces[i % pieces.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 90;
    s.style.left = cx + "px";
    s.style.top = cy + "px";
    s.style.setProperty("--dx", (Math.cos(angle) * dist) + "px");
    s.style.setProperty("--dy", (Math.sin(angle) * dist - 40) + "px");
    s.style.setProperty("--rot", (Math.random() * 540 - 270) + "deg");
    document.body.appendChild(s);
    setTimeout(function () { s.remove(); }, 1000);
  }
}

// ==========================================
// handleSubmit() — validate, send, report
// ==========================================
async function handleSubmit(event) {
  event.preventDefault();

  const form  = event.currentTarget;
  const btn   = document.getElementById("submitBtn");
  const msg   = document.getElementById("formMsg");
  const label = btn.querySelector(".btn-label");

  setMessage(msg, "", "");

  const payload = {
    customer:      form.customer.value.trim(),
    paintingClass: form.paintingClass.value.trim(),
    brief:         form.brief.value.trim(),
    refs:          form.refs.value.trim(),
    deadline:      form.deadline.value,
    website:       form.website.value // honeypot
  };

  // client-side guard (server re-checks)
  if (!payload.customer || !payload.paintingClass || !payload.brief) {
    setMessage(msg, "please fill the starred fields 🍓", "err");
    return;
  }
  if (!payload.deadline) {
    setMessage(msg, "pick a deadline option above 🗓️", "err");
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
      resetDeadline();
      setMessage(msg, "sent! your request landed safely 💌✨", "ok");
      burstConfetti(btn);
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
