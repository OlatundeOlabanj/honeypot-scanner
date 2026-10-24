/* ============================================================
   scanner.js — Input, chain pills, scan execution, history
   ============================================================ */
(function () {
  "use strict";

  const addressInput = document.getElementById("addressInput");
  const addrPrefix   = document.getElementById("addrPrefix");
  const chainSelect  = document.getElementById("chainSelect");
  const chainPills   = document.querySelectorAll(".chain-pill");
  const scanBtn      = document.getElementById("scanBtn");
  const scanBtnLabel = document.getElementById("scanBtnLabel");
  const scanProgress = document.getElementById("scanProgress");
  const scanError    = document.getElementById("scanError");
  const pasteBtn     = document.getElementById("pasteBtn");
  const clearBtn     = document.getElementById("clearBtn");
  const headerStatus = document.getElementById("headerStatus");
  const statusLabel  = document.getElementById("statusLabel");
  const historyList  = document.getElementById("historyList");

  const RE_EVM    = /^(0x)?[0-9a-fA-F]{40}$/;
  const RE_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  let scanning    = false;
  let scanHistory = [];
  const HISTORY_MAX = 8;

  // ── Chain switching ───────────────────────────────────────
  function setChain(chain) {
    chainSelect.value = chain;
    chainPills.forEach(p => p.classList.toggle("active", p.dataset.chain === chain));
    updatePrefix();
    hideError();
  }

  function updatePrefix() {
    const sol = chainSelect.value === "solana";
    if (addrPrefix) addrPrefix.textContent = sol ? "◎" : "0x";
    addressInput.placeholder = sol
      ? "Paste Solana token mint address..."
      : "Paste token contract address...";
  }

  chainPills.forEach(p => p.addEventListener("click", () => setChain(p.dataset.chain)));
  chainSelect.addEventListener("change", () => {
    chainPills.forEach(p => p.classList.toggle("active", p.dataset.chain === chainSelect.value));
    updatePrefix(); hideError();
  });

  // ── Auto-detect chain on input ────────────────────────────
  addressInput.addEventListener("input", () => {
    const raw = addressInput.value.trim();
    if (raw.length >= 32) {
      if (RE_BASE58.test(raw) && !RE_EVM.test(raw.replace(/^0x/i,""))) {
        if (chainSelect.value !== "solana") {
          setChain("solana");
          showInfo("Solana address detected — switched to SOL automatically.");
        }
      } else if (RE_EVM.test(raw) || RE_EVM.test("0x"+raw)) {
        if (chainSelect.value === "solana") {
          setChain("ethereum");
          showInfo("EVM address detected — switched to ETH automatically.");
        }
      }
    }
    hideError();
  });

  // ── Paste / clear ─────────────────────────────────────────
  pasteBtn?.addEventListener("click", async () => {
    try {
      const raw = (await navigator.clipboard.readText()).trim();
      addressInput.value = chainSelect.value === "solana" ? raw : raw.replace(/^0x/i,"");
      addressInput.dispatchEvent(new Event("input"));
      addressInput.focus();
    } catch { addressInput.focus(); }
  });

  clearBtn?.addEventListener("click", () => {
    addressInput.value = ""; hideError(); addressInput.focus();
  });

  addressInput.addEventListener("keydown", e => { if (e.key==="Enter") triggerScan(); });
  scanBtn.addEventListener("click", triggerScan);

  // ── Validation ────────────────────────────────────────────
  function validate(raw) {
    if (!raw || raw.length < 10) return { ok:false, error:"Address is too short." };
    if (chainSelect.value === "solana") {
      if (!RE_BASE58.test(raw)) return { ok:false, error:"Invalid Solana address — expected a 32–44 character base58 string (no 0x prefix)." };
      return { ok:true, address:raw };
    }
    const addr = /^0x/i.test(raw) ? raw : "0x"+raw;
    if (!RE_EVM.test(addr)) {
      if (RE_BASE58.test(raw)) return { ok:false, error:"This looks like a Solana address — click the SOL pill above first." };
      return { ok:false, error:"Invalid EVM address — expected 40 hex characters." };
    }
    return { ok:true, address:addr };
  }

  // ── Main scan ─────────────────────────────────────────────
  async function triggerScan() {
    if (scanning) return;
    const raw   = addressInput.value.trim();
    const valid = validate(raw);
    if (!valid.ok) { showError(valid.error); return; }

    setScanning(true);
    hideError();
    window.dispatchEvent(new CustomEvent("scan:start", { detail:{ address:valid.address, chain:chainSelect.value } }));

    try {
      const resp = await fetch("/api/scan", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ address:valid.address, chain:chainSelect.value }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Server error (${resp.status})`);
      window.dispatchEvent(new CustomEvent("scan:done", { detail:data }));
      addHistory(data);
    } catch (err) {
      showError(err.message || "Scan failed.");
      window.dispatchEvent(new CustomEvent("scan:error", { detail:{ error:err.message } }));
    } finally {
      setScanning(false);
    }
  }

  // ── Progress bar ──────────────────────────────────────────
  let ptimer = null;
  function animateProgress() {
    let p = 0; scanProgress.style.width = "0%"; clearInterval(ptimer);
    ptimer = setInterval(() => { p = Math.min(p+(p<80?4:0.4), 92); scanProgress.style.width=p+"%"; }, 80);
  }
  function finishProgress() {
    clearInterval(ptimer); scanProgress.style.width="100%";
    setTimeout(()=>{ scanProgress.style.width="0%"; }, 450);
  }

  // ── UI helpers ────────────────────────────────────────────
  function setScanning(on) {
    scanning = on;
    scanBtn.disabled = on;
    scanBtnLabel.textContent = on ? "SCANNING..." : "INITIATE SCAN";
    if (on) { animateProgress(); setStatus("scanning","Scanning..."); }
    else    { finishProgress();  setStatus("ready","Ready"); }
  }

  function setStatus(cls, label) {
    if (!headerStatus || !statusLabel) return;
    headerStatus.className = "header-status " + (cls==="scanning"?"scanning": cls==="error"?"error":"");
    statusLabel.textContent = label;
  }

  function showError(msg) {
    scanError.textContent   = msg;
    scanError.style.display = "flex";
    setStatus("error","Error");
  }

  function showInfo(msg) {
    scanError.textContent   = "ℹ " + msg;
    scanError.style.display = "flex";
    scanError.style.borderColor = "rgba(0,196,204,0.3)";
    scanError.style.background  = "rgba(0,196,204,0.06)";
    scanError.style.color       = "#67e8f9";
    setTimeout(()=>{ hideError(); scanError.style.cssText=""; }, 3500);
  }

  function hideError() {
    scanError.style.display = "none";
    scanError.style.cssText = "";
    setStatus("ready","Ready");
  }

  // ── History table ─────────────────────────────────────────
  function addHistory(data) {
    scanHistory = [{
      address: data.address,
      chain:   data.chain,
      color:   data.risk?.color  || "safe",
      label:   data.risk?.label  || "SAFE",
      symbol:  data.token?.symbol || "???",
      date:    new Date().toLocaleString("en-GB",{hour12:false,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).replace(",",""),
    }, ...scanHistory].slice(0, HISTORY_MAX);
    renderHistory();
  }

  function renderHistory() {
    if (!scanHistory.length) {
      historyList.innerHTML = '<div class="rt-empty">No scans yet this session.</div>';
      return;
    }
    historyList.innerHTML = scanHistory.map(h => `
      <div class="rt-row" data-address="${h.address}" data-chain="${h.chain}">
        <span class="rt-date">${h.date}</span>
        <span class="rt-chain">◎ ${h.chain.toUpperCase()}</span>
        <span class="rt-addr">${h.address}</span>
        <span>${h.symbol}</span>
        <span><span class="rt-badge ${h.color}">${h.label}</span></span>
      </div>
    `).join("");

    historyList.querySelectorAll(".rt-row").forEach(row => {
      row.addEventListener("click", () => {
        const chain = row.dataset.chain;
        addressInput.value = chain==="solana" ? row.dataset.address : row.dataset.address.replace(/^0x/i,"");
        setChain(chain);
        triggerScan();
      });
    });
  }

  updatePrefix();
  window.Scanner = { triggerScan };
})();
