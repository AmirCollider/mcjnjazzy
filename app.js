// ==========================================
// app.js — Form Handling, Theme Toggle & UI
// mcjn_jazzy — Commission Hub
// ==========================================
// ==========================================
// Image Uploader — state (references & files)
// AmirCollider Games — Commission Hub
// ==========================================
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB each
const pickedFiles = [];
// ==========================================
// init() — page setup on load
// ==========================================
(function init() {
  const form = document.getElementById("commissionForm");
  if (form) form.addEventListener("submit", handleSubmit);

  initThemeToggle();
  initReveal();
  initStats();
  initIgStats();
  initParallax();
  initTilt();
  initLightbox();
  initUploader();
  initSparkleClicks();
  initEstimate();
  initTosModal();
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
    burstConfetti(btn, next === "dark" ? ["🌙", "✨", "★", "🫧"] : ["☀️", "✨", "🍓", "★"]);
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

  // ==========================================
  // animateCount() — per-element, cancellable count-up
  // stored on the node so live IG updates can retarget it
  // ==========================================
  nums.forEach(function (el) {
    el._statRaf = 0;
    el._statValue = 0;
    el.animateCount = function () {
      const target = parseFloat(el.dataset.count) || 0;
      if (el._statRaf) { cancelAnimationFrame(el._statRaf); el._statRaf = 0; }
      if (reduce) { el._statValue = target; el.textContent = fmt(target); return; }
      const from = el._statValue;
      const dur = 1100;
      const start = performance.now();
      (function step(now) {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = from + (target - from) * eased;
        el._statValue = val;
        el.textContent = fmt(val);
        if (p < 1) { el._statRaf = requestAnimationFrame(step); }
        else { el._statValue = target; el.textContent = fmt(target); el._statRaf = 0; }
      })(start);
    };
  });

  if (!("IntersectionObserver" in window)) { nums.forEach((el) => el.animateCount()); return; }
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.animateCount(); io.unobserve(entry.target); }
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

  // ==========================================
  // applyStat() — push a live count in and re-run the count-up
  // (prevents the count-up animation from overwriting fresh data)
  // ==========================================
  const applyStat = (el, val) => {
    if (!el || typeof val !== "number") return;
    el.dataset.count = val;
    if (typeof el.animateCount === "function") el.animateCount();
    else el.textContent = fmt(val);
  };

  fetch("/api/igstats?t=" + Date.now(), { cache: "no-store" })
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data.ok || !data.stats) return;
      const s = data.stats;
      applyStat(posts, s.posts);
      applyStat(followers, s.followers);
      applyStat(following, s.following);
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
// initTilt() — subtle pointer-follow 3D tilt on the ID card
// ==========================================
function initTilt() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (matchMedia("(pointer: coarse)").matches) return;

  const card = document.querySelector(".idcard");
  if (!card) return;

  const MAX = 5; // degrees
  let raf = null, rx = 0, ry = 0;

  card.style.transition = "transform .18s ease, opacity .55s ease";

  card.addEventListener("mousemove", function (e) {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry = px * (MAX * 2);
    rx = -py * (MAX * 2);
    if (!raf) raf = requestAnimationFrame(apply);
  });

  card.addEventListener("mouseleave", function () {
    rx = 0; ry = 0;
    if (!raf) raf = requestAnimationFrame(apply);
  });

  function apply() {
    card.style.transform =
      "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
    raf = null;
  }
}

// ==========================================
// initSparkleClicks() — playful confetti on signature elements
// ==========================================
function initSparkleClicks() {
  const sticker = document.querySelector(".status-sticker");
  if (sticker) {
    sticker.style.cursor = "pointer";
    sticker.addEventListener("click", function () { burstConfetti(sticker, ["🍓", "✨", "💗", "★"]); });
  }

  const avatar = document.querySelector(".avatar");
  if (avatar) {
    avatar.style.cursor = "pointer";
    avatar.addEventListener("click", function () { burstConfetti(avatar, ["✨", "🌸", "★", "🫧"]); });
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
// initUploader() — wire the add-images control
// ==========================================
function initUploader() {
  const wrap = document.getElementById("uploader");
  if (!wrap) return;
  const input  = document.getElementById("fileInput");
  const btn    = document.getElementById("uploadBtn");
  const thumbs = document.getElementById("thumbs");
  if (!input || !btn || !thumbs) return;

  btn.addEventListener("click", function () { if (!btn.disabled) input.click(); });
  input.addEventListener("change", function () {
    addFiles(input.files);
    input.value = ""; // allow re-picking the same file
  });

  ["dragenter", "dragover"].forEach(function (ev) {
    btn.addEventListener(ev, function (e) { e.preventDefault(); btn.classList.add("is-drag"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    btn.addEventListener(ev, function (e) { e.preventDefault(); btn.classList.remove("is-drag"); });
  });
  btn.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  renderThumbs();
}

// ==========================================
// addFiles() — validate + queue selected images
// ==========================================
function addFiles(fileList) {
  const msg = document.getElementById("formMsg");
  const incoming = Array.prototype.slice.call(fileList || []);
  for (const f of incoming) {
    if (pickedFiles.length >= MAX_FILES) { setMessage(msg, "up to 5 images only 🌸", "err"); break; }
    if (!/^image\//i.test(f.type))       { setMessage(msg, "only image files, please 🖼️", "err"); continue; }
    if (f.size > MAX_BYTES)               { setMessage(msg, "“" + f.name + "” is over 10 MB 🫧", "err"); continue; }
    if (pickedFiles.some((p) => p.name === f.name && p.size === f.size)) continue;
    pickedFiles.push(f);
  }
  renderThumbs();
}

// ==========================================
// renderThumbs() — preview tiles with remove buttons
// ==========================================
function renderThumbs() {
  const thumbs = document.getElementById("thumbs");
  const btn = document.getElementById("uploadBtn");
  if (!thumbs) return;

  thumbs.querySelectorAll("img[data-url]").forEach(function (img) {
    try { URL.revokeObjectURL(img.dataset.url); } catch (e) {}
  });
  thumbs.innerHTML = "";

  pickedFiles.forEach(function (file, idx) {
    const url = URL.createObjectURL(file);
    const li = document.createElement("li");
    li.className = "thumb";

    const img = document.createElement("img");
    img.src = url;
    img.dataset.url = url;
    img.alt = file.name;
    img.addEventListener("click", function () {
      const box = document.getElementById("lightbox");
      if (!box) return;
      box.querySelector("img").src = url;
      box.classList.add("open");
      box.setAttribute("aria-hidden", "false");
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "thumb-del";
    del.setAttribute("aria-label", "Remove " + file.name);
    del.textContent = "✕";
    del.addEventListener("click", function () { removeFile(idx); });

    const tag = document.createElement("span");
    tag.className = "thumb-name";
    tag.textContent = file.name;

    li.appendChild(img);
    li.appendChild(del);
    li.appendChild(tag);
    thumbs.appendChild(li);
  });

  if (btn) {
    const full = pickedFiles.length >= MAX_FILES;
    btn.disabled = full;
    const tx = btn.querySelector(".upload-tx");
    if (tx) {
      tx.innerHTML = full
        ? "max reached <em>(5 / 5)</em>"
        : "add images <em>(" + pickedFiles.length + " / " + MAX_FILES + ")</em>";
    }
  }

  // ==========================================
  // Sync refs textarea required state
  // ==========================================
  const refsEl = document.getElementById("refs");
  if (refsEl) {
    refsEl.required = pickedFiles.length === 0;
  }
}

// ==========================================
// removeFile() — drop one queued image
// ==========================================
function removeFile(index) {
  if (index < 0 || index >= pickedFiles.length) return;
  pickedFiles.splice(index, 1);
  renderThumbs();
}

// ==========================================
// initEstimate() — live AUD estimate as options change
// ==========================================
function initEstimate() {
  const form = document.getElementById("commissionForm");
  if (!form) return;
  ["type", "usage", "stream"].forEach(function (name) {
    Array.prototype.forEach.call(form.querySelectorAll('input[name="' + name + '"]'), function (el) {
      el.addEventListener("change", updateEstimate);
    });
  });
  updateEstimate();
}

// ==========================================
// computeEstimate() — base × usage + NDA fee (AUD)
// ==========================================
function computeEstimate(form) {
  const type   = form.querySelector('input[name="type"]:checked');
  const usage  = form.querySelector('input[name="usage"]:checked');
  const stream = form.querySelector('input[name="stream"]:checked');
  if (!type) return null;
  const base = parseFloat(type.dataset.price) || 0;
  const mult = usage ? (parseFloat(usage.dataset.mult) || 0) : 0;
  const fee  = stream ? (parseFloat(stream.dataset.fee) || 0) : 0;
  return Math.round((base * (1 + mult) + fee) * 100) / 100;
}

// ==========================================
// updateEstimate() — paint the estimate badge
// ==========================================
function updateEstimate() {
  const form = document.getElementById("commissionForm");
  const out  = document.getElementById("estimateValue");
  if (!form || !out) return;
  const total = computeEstimate(form);
  out.textContent = (total === null) ? "— AUD" : "$" + total.toFixed(2) + " AUD";
}

// ==========================================
// resetEstimate() — repaint estimate after a send
// ==========================================
function resetEstimate() {
  updateEstimate();
}

// ==========================================
// initTosModal() — open full policy text from pink keywords
// ==========================================
function initTosModal() {
  const modal = document.getElementById("tosModal");
  const titleEl = document.getElementById("tosModalTitle");
  const bodyEl = document.getElementById("tosModalBody");
  const closeBtn = document.getElementById("tosClose");
  const docs = document.getElementById("tosDocs");
  if (!modal || !titleEl || !bodyEl || !docs) return;

  function open(name) {
    const article = docs.querySelector('article[data-doc="' + name + '"]');
    if (!article) return;
    titleEl.textContent = article.getAttribute("data-title") || "Terms";
    bodyEl.innerHTML = article.innerHTML;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  // pink keywords live inside the agreement labels — stop the click
  // from toggling the checkbox, then open the matching policy
  document.querySelectorAll(".tos-link").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      open(btn.getAttribute("data-doc"));
    });
  });

  if (closeBtn) closeBtn.addEventListener("click", close);
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });
}

// ==========================================
// burstConfetti() — strawberry pop on success
// ==========================================
function burstConfetti(anchor, pieces) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const set = pieces && pieces.length ? pieces : ["🍓", "✨", "🍰", "★", "🫧"];

  for (let i = 0; i < 18; i++) {
    const s = document.createElement("span");
    s.className = "confetti";
    s.textContent = set[i % set.length];
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
  const el    = form.elements;
  const btn   = document.getElementById("submitBtn");
  const msg   = document.getElementById("formMsg");
  const label = btn.querySelector(".btn-label");

  setMessage(msg, "", "");

  const type   = form.querySelector('input[name="type"]:checked');
  const usage  = form.querySelector('input[name="usage"]:checked');
  const stream = form.querySelector('input[name="stream"]:checked');

  const payload = {
    method:   el.method.value.trim(),
    handle:   el.handle.value.trim(),
    paypal:   el.paypal.value.trim(),
    country:  el.country.value.trim(),
    type:     type   ? type.value   : "",
    usage:    usage  ? usage.value  : "",
    stream:   stream ? stream.value : "",
    refs:     el.refs.value.trim(),
    extra:    el.extra.value.trim(),
    estimate: computeEstimate(form),
    agree: {
      tos:    el.agreeTos.checked,
      draw:   el.agreeDraw.checked,
      refund: el.agreeRefund.checked,
      time:   el.agreeTime.checked,
      pay:    el.agreePay.checked,
      all:    el.agreeAll.checked
    },
    website: el.website.value // honeypot
  };

  // client-side guard (server re-checks)
  if (!payload.method || !payload.handle || !payload.country) {
    setMessage(msg, "please fill your contact + country 🍓", "err");
    return;
  }
  if (!payload.type || !payload.usage || !payload.stream) {
    setMessage(msg, "pick a type, a usage, and a sharing option ✨", "err");
    return;
  }
 if ((!payload.refs && pickedFiles.length === 0) || !payload.extra) {
    setMessage(msg, "add your references and the extra info 🎨", "err");
    return;
  }
  if (!payload.agree.tos || !payload.agree.draw || !payload.agree.refund || !payload.agree.time || !payload.agree.pay || !payload.agree.all) {
    setMessage(msg, "please tick all the agreements (including the final one) to continue 🌷", "err");
    return;
  }

  btn.disabled = true;
  const original = label.textContent;
  label.textContent = "sending…";

  try {
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    pickedFiles.forEach(function (file, i) {
      body.append("file" + i, file, file.name || ("ref" + (i + 1)));
    });

    const res  = await fetch("/api/commission", {
      method: "POST",
      body: body
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      form.reset();
      pickedFiles.length = 0;
      renderThumbs();
      resetEstimate();
      setMessage(msg, "sent! your request landed safely 💌✨ — reviewed within 2–7 days", "ok");
      burstConfetti(btn);
    } else if (res.status === 403 || (data && data.blocked)) {
      setMessage(msg, "this username can't send requests 🚫", "err");
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
