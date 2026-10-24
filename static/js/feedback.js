/* ============================================================
   feedback.js — Star rating, char counter, form submission
   ============================================================ */
(function () {
  "use strict";

  const stars      = document.querySelectorAll(".star");
  const commentEl  = document.getElementById("feedbackComment");
  const charCount  = document.getElementById("charCount");
  const submitBtn  = document.getElementById("submitFeedbackBtn");
  const successEl  = document.getElementById("feedbackSuccess");
  const errorEl    = document.getElementById("feedbackError");
  const typeSelect = document.getElementById("feedbackType");

  let selectedRating  = 0;
  let lastScanAddress = "";
  let lastScanChain   = "";

  // ── Capture last scan context ─────────────────────────────
  window.addEventListener("scan:done", e => {
    lastScanAddress = e.detail.address || "";
    lastScanChain   = e.detail.chain   || "";
  });

  // ── Star rating ───────────────────────────────────────────
  stars.forEach(star => {
    star.addEventListener("mouseenter", () => highlightStars(+star.dataset.val));
    star.addEventListener("mouseleave", () => highlightStars(selectedRating));
    star.addEventListener("click",      () => {
      selectedRating = +star.dataset.val;
      highlightStars(selectedRating);
    });
  });

  function highlightStars(n) {
    stars.forEach(s => s.classList.toggle("lit", +s.dataset.val <= n));
  }

  // ── Char counter ──────────────────────────────────────────
  commentEl.addEventListener("input", () => {
    if (charCount) charCount.textContent = commentEl.value.length;
  });

  // ── Submit ────────────────────────────────────────────────
  submitBtn.addEventListener("click", async () => {
    hideMessages();

    if (!selectedRating) {
      showError("Please select a star rating before submitting.");
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = "SUBMITTING...";

    try {
      const resp = await fetch("/api/feedback", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: lastScanAddress,
          chain:   lastScanChain,
          rating:  selectedRating,
          type:    typeSelect.value,
          comment: commentEl.value.trim(),
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Server error.");

      const emailNote = data.emailed
        ? " A copy was sent to the developer."
        : " Stored locally (email not configured).";

      showSuccess("Thank you — feedback received!" + emailNote);
      resetForm();
    } catch (err) {
      showError(err.message || "Could not submit. Try again.");
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = "SUBMIT FEEDBACK";
    }
  });

  // ── Helpers ───────────────────────────────────────────────
  function resetForm() {
    selectedRating = 0;
    highlightStars(0);
    typeSelect.value       = "";
    commentEl.value        = "";
    if (charCount) charCount.textContent = "0";
  }

  function showSuccess(msg) {
    successEl.textContent   = "✓ " + msg;
    successEl.style.display = "flex";
    errorEl.style.display   = "none";
    setTimeout(() => { successEl.style.display = "none"; }, 6000);
  }

  function showError(msg) {
    errorEl.textContent   = "⚠ " + msg;
    errorEl.style.display = "flex";
    successEl.style.display = "none";
  }

  function hideMessages() {
    successEl.style.display = "none";
    errorEl.style.display   = "none";
  }
})();
