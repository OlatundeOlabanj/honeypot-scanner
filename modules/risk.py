"""
risk.py — Flag extraction and risk scoring for both EVM and Solana tokens.
"""
from typing import List
from .models import RiskFlag, RiskResult


# ══════════════════════════════════════════════════════════════════════════════
# EVM — honeypot.is
# ══════════════════════════════════════════════════════════════════════════════

def extract_flags(raw: dict) -> List[RiskFlag]:
    flags: List[RiskFlag] = []
    hp         = raw.get("honeypotResult",  {}) or {}
    simulation = raw.get("simulationResult", {}) or {}
    contract   = raw.get("contractCode",    {}) or {}
    token      = raw.get("token",           {}) or {}
    pair       = raw.get("pair",            {}) or {}

    # CRITICAL
    if hp.get("isHoneypot"):
        reason = hp.get("honeypotReason") or "Sell blocked"
        flags.append(RiskFlag("critical", "💀", f"CONFIRMED HONEYPOT — {reason}"))

    if simulation.get("canBuy") is False:
        flags.append(RiskFlag("critical", "🚫", "Buying is currently disabled by the contract"))

    sell_tax = _f(simulation.get("sellTax"))
    if sell_tax is not None and sell_tax >= 90:
        flags.append(RiskFlag("critical", "🚫", f"Sell tax {sell_tax:.1f}% — effectively impossible to sell"))

    # WARNING
    if sell_tax is not None and 30 <= sell_tax < 90:
        flags.append(RiskFlag("warning", "⚠️", f"Very high sell tax: {sell_tax:.1f}%"))

    buy_tax = _f(simulation.get("buyTax"))
    if buy_tax is not None and buy_tax >= 20:
        flags.append(RiskFlag("warning", "⚠️", f"High buy tax: {buy_tax:.1f}%"))

    if contract.get("isOpenSource") is False:
        flags.append(RiskFlag("warning", "🔒", "Contract source is not verified / not open-source"))

    if contract.get("isProxy"):
        flags.append(RiskFlag("warning", "🔄", "Proxy contract — underlying logic can be silently replaced"))

    if contract.get("isMintable"):
        flags.append(RiskFlag("warning", "🖨️", "Token supply is mintable — dev can inflate supply at will"))

    if contract.get("isFreezeAuth"):
        flags.append(RiskFlag("warning", "❄️", "Freeze authority active — dev can freeze token accounts"))

    # Surface raw RugCheck risk items as flags (Solana)
    for rc_risk in (raw.get("_risks") or []):
        level_map = {"danger": "critical", "warn": "warning", "info": "caution"}
        level = level_map.get(rc_risk.get("level"), "caution")
        desc  = rc_risk.get("description") or rc_risk.get("name") or ""
        if not desc:
            continue
        if any(kw in desc.lower() for kw in ("honeypot", "rugged")):
            continue
        icon  = {"danger": "🚨", "warn": "⚠️", "info": "ℹ️"}.get(rc_risk.get("level"), "🔸")
        flags.append(RiskFlag(level, icon, f"[Solana] {desc}"))

    # CAUTION
    if sell_tax is not None and 10 <= sell_tax < 30:
        flags.append(RiskFlag("caution", "🔸", f"Elevated sell tax: {sell_tax:.1f}%"))

    liq = _f(pair.get("liquidity"))
    if liq is not None and 0 < liq < 1_000:
        flags.append(RiskFlag("caution", "💧", f"Very low liquidity: ${liq:,.0f}"))

    holders = token.get("totalHolders")
    if holders is not None and 0 < int(holders) < 50:
        flags.append(RiskFlag("caution", "👥", f"Only {holders} holders — extremely thin distribution"))

    transfer_tax = _f(simulation.get("transferTax"))
    if transfer_tax is not None and transfer_tax > 0:
        flags.append(RiskFlag("caution", "↔️", f"Transfer tax: {transfer_tax:.1f}%"))

    return flags


def compute_score(raw: dict, flags: List[RiskFlag]) -> RiskResult:
    hp         = raw.get("honeypotResult",  {}) or {}
    simulation = raw.get("simulationResult", {}) or {}

    if hp.get("isHoneypot"):
        return RiskResult(score=100, label="HONEYPOT", color="critical")

    score = 0
    for flag in flags:
        if flag.level == "critical": score += 40
        elif flag.level == "warning": score += 20
        elif flag.level == "caution": score += 10

    sell_tax = _f(simulation.get("sellTax")) or 0
    score += min(sell_tax * 0.4, 25)
    score = min(int(score), 99)

    return _score_to_result(score)


# ══════════════════════════════════════════════════════════════════════════════
# Solana — RugCheck
# ══════════════════════════════════════════════════════════════════════════════

# RugCheck risk level → our severity
_RC_LEVEL_MAP = {
    "danger": "critical",
    "warn":   "warning",
    "info":   "caution",
}

# RugCheck risk level → emoji
_RC_ICON_MAP = {
    "danger": "🚨",
    "warn":   "⚠️",
    "info":   "ℹ️",
}


def extract_solana_flags(raw: dict) -> List[RiskFlag]:
    flags: List[RiskFlag] = []
    risks_raw = raw.get("risks", []) or []
    rugged    = raw.get("rugged", False)
    liq       = _f(raw.get("totalLiquidityUSD"))

    if rugged:
        flags.append(RiskFlag("critical", "💀", "Token has been RUGGED — liquidity drained by dev"))

    # Map RugCheck risks directly to our flags
    for risk in risks_raw:
        level = _RC_LEVEL_MAP.get((risk.get("level") or "").lower(), "caution")
        icon  = _RC_ICON_MAP.get((risk.get("level") or "").lower(), "🔸")
        name  = risk.get("name") or "Unknown risk"
        desc  = risk.get("description") or ""
        text  = f"{name}" + (f" — {desc}" if desc and desc.lower() != name.lower() else "")
        flags.append(RiskFlag(level, icon, text[:200]))

    # Liquidity check
    if liq is not None and 0 < liq < 1_000:
        flags.append(RiskFlag("caution", "💧", f"Very low liquidity: ${liq:,.0f}"))

    # Top holder concentration
    top_holders = raw.get("topHolders") or []
    if top_holders:
        top_pct = _f(top_holders[0].get("pct"))
        if top_pct and top_pct > 50:
            flags.append(RiskFlag("critical", "🐳", f"Top holder owns {top_pct:.1f}% of supply"))
        elif top_pct and top_pct > 20:
            flags.append(RiskFlag("warning", "🐳", f"Top holder owns {top_pct:.1f}% of supply"))

    return flags


def compute_solana_score(raw: dict, flags: List[RiskFlag]) -> RiskResult:
    rugged = raw.get("rugged", False)
    if rugged:
        return RiskResult(score=100, label="RUGGED", color="critical")

    # Use RugCheck's normalised score if available
    rc_score = raw.get("score_normalised")
    if rc_score is not None:
        score = min(int(_f(rc_score) or 0), 99)
        return _score_to_result(score)

    # Fallback: aggregate our flags
    score = 0
    for flag in flags:
        if flag.level == "critical": score += 40
        elif flag.level == "warning": score += 20
        elif flag.level == "caution": score += 10
    score = min(score, 99)
    return _score_to_result(score)


# ══════════════════════════════════════════════════════════════════════════════
# Shared helpers
# ══════════════════════════════════════════════════════════════════════════════

def _score_to_result(score: int) -> RiskResult:
    if score >= 70:
        return RiskResult(score, "HIGH RISK",   "high")
    if score >= 40:
        return RiskResult(score, "MEDIUM RISK", "medium")
    if score >= 15:
        return RiskResult(score, "LOW RISK",    "low")
    return RiskResult(score,     "APPEARS SAFE","safe")


def _f(val):
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None