/* ============================================================
   results.js — Renders scan + market data into the UI
   ============================================================ */
(function () {
  "use strict";

  const STROKE = { critical:"#ef4444", high:"#f97316", medium:"#f59e0b", low:"#3b82f6", safe:"#22c55e" };

  const CHAIN_EXP = {
    ethereum:"https://etherscan.io/token/",
    bsc:"https://bscscan.com/token/",
    base:"https://basescan.org/token/",
    polygon:"https://polygonscan.com/token/",
    arbitrum:"https://arbiscan.io/token/",
    solana:"https://solscan.io/token/",
  };

  const VERDICT = {
    critical: d => `${sym(d)} is a CONFIRMED HONEYPOT. Do not buy — you cannot sell. Any funds sent are permanently trapped.`,
    high:     d => `${sym(d)} has multiple severe red flags. Risk of total loss is extremely high. Avoid unless professionally audited.`,
    medium:   d => `${sym(d)} shows notable risk factors. Not an outright honeypot right now, but conditions can change. Verify independently before investing.`,
    low:      d => `${sym(d)} has minor caution signals but no honeypot detected. Always use a stop-loss and only risk what you can afford to lose.`,
    safe:     d => `${sym(d)} passed all automated checks. No honeypot detected. Always DYOR before investing.`,
  };

  // Helper: resolve display name — prefer symbol, fall back gracefully
  function sym(d)  { return d.token?.symbol && d.token.symbol !== "???" ? d.token.symbol : (d.token?.name || "This token"); }
  function name(d) { return d.token?.name   && d.token.name   !== "Unknown" ? d.token.name : "Unknown Token"; }

  window.addEventListener("scan:start", () => {
    document.getElementById("resultsArea").style.display = "none";
  });

  window.addEventListener("scan:done", e => render(e.detail));

  // ── Main render ───────────────────────────────────────────
  function render(d) {
    const color = d.risk?.color || "safe";
    const score = d.risk?.score ?? 0;
    const sim   = d.simulation  || {};
    const ct    = d.contract    || {};
    const mkt   = d.token?.market || {};

    // ── 4 Status cards ────────────────────────────────────
    const rlEl = document.getElementById("bannerLabel");
    if (rlEl) { rlEl.textContent = d.risk?.label || "--"; rlEl.className = "sc-value risk-value " + color; }

    const hpEl = document.getElementById("scHoneypot");
    if (hpEl) { hpEl.textContent = d.isHoneypot ? "⛔ YES" : "✓ NO"; hpEl.className = "sc-value " + (d.isHoneypot ? "hp-yes" : "hp-no"); }

    const taxEl  = document.getElementById("scTaxStatus");
    const taxSub = document.getElementById("scTaxSub");
    if (taxEl) {
      const st = sim.sellTax;
      if      (st == null)  { taxEl.textContent = "No Data";         taxEl.style.color = ""; }
      else if (st >= 90)    { taxEl.textContent = "Sell Blocked";    taxEl.style.color = "var(--red)"; }
      else if (st >= 30)    { taxEl.textContent = "High Sell Tax";   taxEl.style.color = "var(--orange)"; }
      else if (st >= 10)    { taxEl.textContent = `Sell Tax: ${st.toFixed(1)}%`; taxEl.style.color = "var(--amber)"; }
      else                  { taxEl.textContent = "Tax OK";          taxEl.style.color = "var(--green)"; }
      if (taxSub && st != null) {
        const bt = sim.buyTax;
        taxSub.textContent = bt != null ? `Buy ${bt.toFixed(1)}% · Sell ${st.toFixed(1)}%` : `Sell ${st.toFixed(1)}%`;
      }
    }

    const srcEl = document.getElementById("scSource");
    if (srcEl) {
      if      (ct.isOpenSource === true)  { srcEl.textContent = "Verified Source";   srcEl.style.color = "var(--green)"; }
      else if (ct.isOpenSource === false) { srcEl.textContent = "Unverified Source"; srcEl.style.color = "var(--red)"; }
      else                                { srcEl.textContent = "Unknown";            srcEl.style.color = ""; }
    }

    // ── Score ring ────────────────────────────────────────
    animateScore(score, color);

    // ── Token panel ───────────────────────────────────────
    set("tcSymbol",    d.token?.symbol || "???");
    set("tcName",      name(d));
    setTax("tcBuyTax",  sim.buyTax);
    setTax("tcSellTax", sim.sellTax, true);
    set("tcLiquidity", fmtUsd(mkt.liquidityUsd ?? d.liquidity));
    set("tcHolders",   fmtNum(d.token?.totalHolders));
    setBool("tcMintable",   ct.isMintable,   false);
    setBool("tcProxy",      ct.isProxy,      false);
    setBool("tcOpenSource", ct.isOpenSource, true);

    // Token avatar
    const av = document.getElementById("tokenAvatar");
    if (av) {
      const s = d.token?.symbol || "?";
      av.textContent = s !== "???" ? s.slice(0,2).toUpperCase() : "?";
    }

    // ── Market data row (price, 24h change, volume, buys/sells) ──
    renderMarketData(d, mkt);

    // ── External links ────────────────────────────────────
    const linksEl = document.getElementById("extLinks");
    if (linksEl) {
      linksEl.innerHTML = "";
      const expBase = CHAIN_EXP[d.chain] || "";
      const links = [
        [expBase + d.address,                                               "🔗 Explorer"],
        [`https://dexscreener.com/${d.chain}/${d.address}`,                "📊 DexScreener"],
        [`https://honeypot.is/?address=${d.address}`,                       "🛡 Honeypot.is"],
        [`https://dextools.io/app/en/${d.chain}/pair-explorer/${d.address}`,"📈 DEXTools"],
      ];
      links.filter(([h]) => h.startsWith("http")).forEach(([href, label]) => {
        const a = document.createElement("a");
        a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.className = "ext-link"; a.textContent = label;
        linksEl.appendChild(a);
      });
    }

    // ── Flags ─────────────────────────────────────────────
    renderFlags(d);

    // ── Simulation (with market context) ──────────────────
    renderSim(d, mkt);

    // Show results
    document.getElementById("resultsArea").style.display = "flex";
  }

  // ── Market data strip ─────────────────────────────────────
  function renderMarketData(d, mkt) {
    let strip = document.getElementById("marketStrip");
    // Create strip if it doesn't exist yet
    if (!strip) {
      const panel = document.querySelector(".token-panel");
      if (!panel) return;
      strip = document.createElement("div");
      strip.id = "marketStrip";
      strip.className = "market-strip";
      // Insert before token-links
      const links = panel.querySelector(".token-links");
      if (links) panel.insertBefore(strip, links);
      else panel.appendChild(strip);
    }

    if (!mkt || (!mkt.priceUsd && !mkt.volume24h)) {
      strip.innerHTML = "";
      strip.style.display = "none";
      return;
    }

    const change    = mkt.priceChange24h;
    const changeStr = change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : null;
    const changeCls = change != null ? (change >= 0 ? "pos" : "neg") : "";

    strip.style.display = "";
    strip.innerHTML = `
      <div class="mstrip-divider"></div>
      ${mkt.priceUsd != null ? `
        <div class="mstat">
          <span class="mstat-l">Price</span>
          <span class="mstat-v">$${fmtPrice(mkt.priceUsd)}
            ${changeStr ? `<span class="mstat-change ${changeCls}">${changeStr}</span>` : ""}
          </span>
        </div>` : ""}
      ${mkt.volume24h != null ? `
        <div class="mstat">
          <span class="mstat-l">Vol 24h</span>
          <span class="mstat-v">${fmtUsd(mkt.volume24h)}</span>
        </div>` : ""}
      ${(mkt.buys24h != null && mkt.sells24h != null) ? `
        <div class="mstat">
          <span class="mstat-l">Buys / Sells</span>
          <span class="mstat-v"><span class="pos">${mkt.buys24h}</span> / <span class="neg">${mkt.sells24h}</span></span>
        </div>` : ""}
      ${mkt.dexId ? `
        <div class="mstat">
          <span class="mstat-l">DEX</span>
          <span class="mstat-v">${mkt.dexId}</span>
        </div>` : ""}
      ${mkt.fdv != null ? `
        <div class="mstat">
          <span class="mstat-l">FDV</span>
          <span class="mstat-v">${fmtUsd(mkt.fdv)}</span>
        </div>` : ""}
    `;
  }

  // ── Flags ─────────────────────────────────────────────────
  function renderFlags(d) {
    const flags  = d.flags || [];
    const badge  = document.getElementById("flagsBadge");
    if (badge) badge.textContent = flags.length;

    const summary = document.getElementById("flagsSummary");
    const list    = document.getElementById("flagsList");
    if (!summary || !list) return;

    const counts = { critical:0, warning:0, caution:0 };
    flags.forEach(f => { if (counts[f.level] !== undefined) counts[f.level]++; });

    summary.innerHTML = [
      counts.critical > 0 && `<div class="flags-summary-pill critical"><span class="summary-count">${counts.critical}</span> Critical</div>`,
      counts.warning  > 0 && `<div class="flags-summary-pill warning"><span class="summary-count">${counts.warning}</span> Warning</div>`,
      counts.caution  > 0 && `<div class="flags-summary-pill caution"><span class="summary-count">${counts.caution}</span> Caution</div>`,
    ].filter(Boolean).join("");

    list.innerHTML = flags.length === 0
      ? `<div class="flag-row all-clear">✓ &nbsp; No risk flags detected — token passed all checks</div>`
      : flags.map((f,i) => `
          <div class="flag-row ${f.level}" style="animation-delay:${i*45}ms">
            <span class="flag-icon">${f.icon}</span>
            <span class="flag-text">${f.text}</span>
            <span class="flag-level-badge">${f.level.toUpperCase()}</span>
          </div>`).join("");

    document.getElementById("flagsEmpty").style.display   = "none";
    document.getElementById("flagsContent").style.display = "block";
  }

  // ── Simulation ─────────────────────────────────────────────
  function renderSim(d, mkt) {
    const sim   = d.simulation || {};
    const color = d.risk?.color || "safe";

    setSimResult("simBuyResult",  sim.canBuy  !== false);
    setSimResult("simSellResult", !d.isHoneypot);

    setTax("simBuyTax",  sim.buyTax);
    setTax("simSellTax", sim.sellTax, true);

    // Gas — show N/A for Solana (no gas concept), numbers for EVM
    const isSolana = d.chain === "solana";
    set("simBuyGas",  isSolana ? "N/A" : fmtNum(sim.buyGas));
    set("simSellGas", isSolana ? "N/A" : fmtNum(sim.sellGas));

    // Extra row: transfer tax or market context
    const extra = document.getElementById("simExtra");
    if (extra) {
      let rows = "";
      if (sim.transferTax != null && sim.transferTax > 0) {
        rows += `<div class="sim-extra-row"><span class="sim-extra-key">TRANSFER TAX</span><span>${sim.transferTax.toFixed(1)}%</span></div>`;
      }
      if (mkt.priceUsd != null) {
        rows += `<div class="sim-extra-row"><span class="sim-extra-key">TOKEN PRICE</span><span>$${fmtPrice(mkt.priceUsd)}</span></div>`;
      }
      if (mkt.volume24h != null) {
        rows += `<div class="sim-extra-row"><span class="sim-extra-key">24H VOLUME</span><span>${fmtUsd(mkt.volume24h)}</span></div>`;
      }
      if (mkt.buys24h != null && mkt.sells24h != null) {
        const total = mkt.buys24h + mkt.sells24h;
        const buyPct = total > 0 ? ((mkt.buys24h / total) * 100).toFixed(0) : 50;
        rows += `<div class="sim-extra-row">
          <span class="sim-extra-key">BUY PRESSURE</span>
          <span><span style="color:var(--green)">${buyPct}% buys</span> / <span style="color:var(--red)">${100 - buyPct}% sells</span></span>
        </div>`;
      }
      extra.innerHTML = rows;
    }

    // Verdict — uses resolved token symbol
    const verdictFn = VERDICT[color] || VERDICT.safe;
    set("verdictText", verdictFn(d));

    document.getElementById("simEmpty").style.display   = "none";
    document.getElementById("simContent").style.display = "block";
  }

  // ── Score ring animation ───────────────────────────────────
  function animateScore(target, color) {
    const fill  = document.getElementById("scoreFill");
    const numEl = document.getElementById("scoreNumber");
    const circ  = 2 * Math.PI * 40; // r=40
    if (!fill || !numEl) return;
    fill.style.stroke = STROKE[color] || "#22c55e";
    numEl.style.color = STROKE[color] || "#22c55e";
    let cur = 0;
    const tick = () => {
      cur = Math.min(cur + Math.max(1, Math.ceil((target - cur) * 0.08)), target);
      fill.style.strokeDashoffset = circ - (circ * cur / 100);
      numEl.textContent = cur;
      if (cur < target) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Helpers ────────────────────────────────────────────────
  function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? "---";
  }

  function setTax(id, val, isSell = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (val == null) { el.textContent = "--%"; el.style.color = ""; return; }
    el.textContent = val.toFixed(1) + "%";
    el.style.color = isSell
      ? (val >= 90 ? "var(--red)" : val >= 30 ? "var(--orange)" : val >= 10 ? "var(--amber)" : "var(--green)")
      : (val >= 20 ? "var(--amber)" : val >= 5 ? "var(--text)" : "var(--green)");
  }

  function setBool(id, val, trueGood) {
    const el = document.getElementById(id);
    if (!el) return;
    if (val == null) { el.textContent = "---"; el.style.color = ""; return; }
    el.textContent = val ? "YES" : "NO";
    el.style.color = (trueGood ? val : !val) ? "var(--green)" : "var(--red)";
  }

  function setSimResult(id, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = ok ? "OK" : "BLOCKED";
    el.className   = "sim-result " + (ok ? "ok" : "blocked");
  }

  function fmtUsd(v) {
    if (v == null) return "$---";
    if (v >= 1e9)  return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6)  return "$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3)  return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function fmtPrice(v) {
    if (v == null) return "---";
    const n = Number(v);
    if (n >= 1)      return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (n >= 0.001)  return n.toFixed(6);
    // Very small prices — show significant digits
    const s = n.toExponential(4);
    return s;
  }

  function fmtNum(v) {
    return v == null ? "---" : Number(v).toLocaleString("en-US");
  }
})();
