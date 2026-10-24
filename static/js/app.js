/* ============================================================
   app.js — Boot, bottom nav, section switching, keyboard shortcuts
   ============================================================ */
(function () {
  "use strict";

  // ── Bottom nav section switching ─────────────────────────
  const navItems  = document.querySelectorAll(".bn-item");
  const sections  = document.querySelectorAll(".app-section");

  function showSection(id) {
    sections.forEach(s  => s.classList.toggle("active", s.id === id));
    navItems.forEach(n  => n.classList.toggle("active", n.dataset.target === id));
  }

  navItems.forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.target));
  });

  // ── After scan: auto-show scanner section ─────────────────
  window.addEventListener("scan:done", () => showSection("scanner"));

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      showSection("scanner");
      document.getElementById("addressInput")?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      window.Scanner?.triggerScan();
    }
  });

  // ── Edu card entrance animations ─────────────────────────
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity   = "1";
        e.target.style.transform = "translateY(0)";
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll(".edu-card").forEach((c, i) => {
    c.style.opacity   = "0";
    c.style.transform = "translateY(16px)";
    c.style.transition = `opacity 0.4s ease ${i*70}ms, transform 0.4s ease ${i*70}ms`;
    io.observe(c);
  });

  console.info("%cMemeScanner v3.0 | Ctrl+K = focus | Ctrl+Enter = scan",
    "color:#00c4cc; font-family:monospace; font-size:11px;");
})();
