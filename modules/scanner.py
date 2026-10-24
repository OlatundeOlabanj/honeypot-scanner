"""
scanner.py — Orchestrates the full token scan pipeline.
"""
from .api_client import fetch_honeypot_data, fetch_market_data
from .risk import extract_flags, compute_score
from .models import (
    ScanReport, TokenInfo, SimulationResult,
    ContractInfo, PairInfo, MarketData,
)


def scan_token(address: str, chain: str) -> ScanReport:
    """
    Full pipeline:
      1. Fetch raw honeypot/rug data (honeypot.is or RugCheck)
      2. Parse into domain models
      3. Fetch live market data from DexScreener (non-blocking)
      4. Merge market data — DexScreener wins on name/symbol if available
      5. Extract risk flags
      6. Compute risk score
      7. Return complete ScanReport
    """
    raw = fetch_honeypot_data(address, chain)

    hp_result = raw.get("honeypotResult",  {}) or {}
    sim_raw   = raw.get("simulationResult", {}) or {}
    code_raw  = raw.get("contractCode",    {}) or {}
    token_raw = raw.get("token",           {}) or {}
    pair_raw  = raw.get("pair",            {}) or {}

    # ── Step 1: Base token info from honeypot / rug API ──────
    token = TokenInfo(
        name          = token_raw.get("name",         "Unknown"),
        symbol        = token_raw.get("symbol",       "???"),
        decimals      = token_raw.get("decimals"),
        total_holders = token_raw.get("totalHolders"),
    )

    simulation = SimulationResult(
        can_buy      = sim_raw.get("canBuy"),
        can_sell     = not hp_result.get("isHoneypot", False),
        buy_tax      = _f(sim_raw.get("buyTax")),
        sell_tax     = _f(sim_raw.get("sellTax")),
        buy_gas      = sim_raw.get("buyGas"),
        sell_gas     = sim_raw.get("sellGas"),
        transfer_tax = _f(sim_raw.get("transferTax")),
    )

    contract = ContractInfo(
        is_open_source = code_raw.get("isOpenSource"),
        is_proxy       = code_raw.get("isProxy"),
        is_mintable    = code_raw.get("isMintable"),
        is_freeze_auth = code_raw.get("isFreezeAuth"),
    )

    pair = PairInfo(
        liquidity = _f(pair_raw.get("liquidity")),
    )

    # ── Step 2: Enrich with DexScreener market data ───────────
    dex_pair = fetch_market_data(address, chain)
    if dex_pair:
        base = dex_pair.get("baseToken") or {}

        # Use DexScreener name/symbol if the primary API returned unknowns
        if base.get("name") and token.name in ("Unknown", ""):
            token.name = base["name"]
        if base.get("symbol") and token.symbol in ("???", ""):
            token.symbol = base["symbol"]

        liq    = (dex_pair.get("liquidity") or {}).get("usd")
        vol    = (dex_pair.get("volume")    or {}).get("h24")
        change = (dex_pair.get("priceChange") or {}).get("h24")
        txns   = (dex_pair.get("txns")     or {}).get("h24") or {}

        token.market = MarketData(
            price_usd        = _f(dex_pair.get("priceUsd")),
            price_change_24h = _f(change),
            volume_24h       = _f(vol),
            liquidity_usd    = _f(liq),
            market_cap       = _f(dex_pair.get("marketCap")),
            fdv              = _f(dex_pair.get("fdv")),
            buys_24h         = txns.get("buys"),
            sells_24h        = txns.get("sells"),
            dex_id           = dex_pair.get("dexId"),
            pair_address     = dex_pair.get("pairAddress"),
        )

        # Prefer DexScreener liquidity over honeypot.is (more accurate)
        if liq and (pair.liquidity is None or pair.liquidity == 0):
            pair.liquidity = _f(liq)

    # ── Step 3: Risk analysis ──────────────────────────────────
    flags = extract_flags(raw)
    risk  = compute_score(raw, flags)

    return ScanReport(
        address         = address,
        chain           = chain,
        is_honeypot     = hp_result.get("isHoneypot", False),
        honeypot_reason = hp_result.get("honeypotReason"),
        token           = token,
        simulation      = simulation,
        contract        = contract,
        pair            = pair,
        flags           = flags,
        risk            = risk,
    )


def _f(val):
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None
