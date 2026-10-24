/* ============================================================
   sidebar.js — Sidebar navigation: scroll-spy, active states
   ============================================================ */
(function () {
  "use strict";

  const sidebar  = document.getElementById("sidebar");
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".section[id]");

  // ── Scroll-spy ─────────────────────────────────────────
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActive(entry.target.id);
        }
      });
    },
    { threshold: 0.35, rootMargin: "0px 0px -20% 0px" }
  );

  sections.forEach((s) => observer.observe(s));

  function setActive(sectionId) {
    navItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.section === sectionId);
    });
  }

  // ── Click navigation ───────────────────────────────────
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById(item.dataset.section);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // ── Expand body class on hover ─────────────────────────
  sidebar.addEventListener("mouseenter", () => {
    document.body.classList.add("sidebar-open");
  });
  sidebar.addEventListener("mouseleave", () => {
    document.body.classList.remove("sidebar-open");
  });

  // ── Expose public helper ───────────────────────────────
  window.SidebarNav = { setActive };
})();
