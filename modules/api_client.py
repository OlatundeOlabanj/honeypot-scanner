"""
api_client.py — HTTP wrappers for honeypot.is (EVM) and RugCheck (Solana).
"""
import requests

HONEYPOT_API_URL = "https://api.honeypot.is/v2/IsHoneypot"

EVM_CHAIN_IDS: dict[str, int] = {
    "ethereum": 1,
    "bsc":      56,
    "base":     8453,
    "polygon":  137,
    "arbitrum": 42161,
}

RUGCHECK_API_URL = "https://api.rugcheck.xyz/v1/tokens/{mint}/report/summary"
SOLANA_CHAINS    = {"solana"}
REQUEST_TIMEOUT  = 14


def fetch_honeypot_data(address: str, chain: str) -> dict:
    chain = chain.lower()
    if chain in SOLANA_CHAINS:
        return _fetch_rugcheck(address)
    return _fetch_evm(address, chain)


def _fetch_evm(address: str, chain: str) -> dict:
    chain_id = EVM_CHAIN_IDS.get(chain)
    if chain_id is None:
        supported = list(EVM_CHAIN_IDS.keys()) + list(SOLANA_CHAINS)
        raise ValueError(f"Unsupported chain: '{chain}'. Supported: {supported}")
    try:
        resp = requests.get(
            HONEYPOT_API_URL,
            params={"address": address, "chainID": chain_id},
            timeout=REQUEST_TIMEOUT,
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
        data["_source"] = "honeypot.is"
        return data
    except requests.exceptions.Timeout:
        raise RuntimeError("honeypot.is API timed out. Try again.")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Could not connect to honeypot.is. Check your network.")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"honeypot.is returned HTTP {e.response.status_code}.")
    except Exception as e:
        raise RuntimeError(f"Unexpected API error: {e}")


def _fetch_rugcheck(mint: str) -> dict:
    url = RUGCHECK_API_URL.format(mint=mint)
    try:
        resp = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"Accept": "application/json"})
        resp.raise_for_status()
        return _normalise_rugcheck(resp.json(), mint)
    except requests.exceptions.Timeout:
        raise RuntimeError("RugCheck API timed out. Try again.")
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Could not connect to RugCheck API. Check your network.")
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"RugCheck returned HTTP {e.response.status_code}.")
    except Exception as e:
        raise RuntimeError(f"Unexpected Solana API error: {e}")


def _normalise_rugcheck(raw: dict, mint: str) -> dict:
    """
    Convert RugCheck response into the same internal envelope used by
    honeypot.is so scanner.py / risk.py need zero changes.
    RugCheck score: 0 = very safe, ~500+ = dangerous, 1000 = rugged.
    """
    risks    = raw.get("risks") or []
    markets  = raw.get("markets") or []
    meta     = raw.get("tokenMeta") or {}
    score    = int(raw.get("score") or 0)
    rugged   = bool(raw.get("rugged", False))

    liquidity = 0.0
    for m in markets:
        liquidity += float(m.get("liquidityA") or 0)
        liquidity += float(m.get("liquidityB") or 0)

    danger_risks = [r for r in risks if (r.get("level") or "") == "danger"]
    is_hp        = rugged or bool(danger_risks)
    hp_reason    = None
    if rugged:
        hp_reason = "Token has been rugged"
    elif danger_risks:
        hp_reason = danger_risks[0].get("description") or danger_risks[0].get("name")

    has_mint   = any("mint"   in (r.get("name") or "").lower() for r in risks)
    has_freeze = any("freeze" in (r.get("name") or "").lower() for r in risks)

    sell_tax = None
    for r in risks:
        name = (r.get("name") or "").lower()
        if "tax" in name or "fee" in name:
            try:
                sell_tax = float(str(r.get("value") or "0").replace("%", ""))
                break
            except (ValueError, TypeError):
                pass

    holders = raw.get("holdersCount") or raw.get("totalHolders")
    if not holders:
        top = raw.get("topHolders") or []
        holders = len(top) if top else None

    # Map rugcheck 0-1000 score to sell_tax proxy so risk algorithm works
    sell_tax_proxy = sell_tax if sell_tax is not None else min(score / 10.0, 99.0)

    return {
        "_source":          "rugcheck",
        "_rugcheck_score":  score,
        "_risks":           risks,
        "honeypotResult": {
            "isHoneypot":     is_hp,
            "honeypotReason": hp_reason,
        },
        "simulationResult": {
            "canBuy":       not rugged,
            "buyTax":       0.0,
            "sellTax":      sell_tax_proxy,
            "buyGas":       None,
            "sellGas":      None,
            "transferTax":  None,
        },
        "contractCode": {
            "isOpenSource": bool(raw.get("fileMeta")),
            "isProxy":      False,
            "isMintable":   has_mint,
            "isFreezeAuth": has_freeze,
        },
        "token": {
            "name":         meta.get("name")   or "Unknown",
            "symbol":       meta.get("symbol") or "???",
            "decimals":     meta.get("decimals"),
            "totalHolders": holders,
        },
        "pair": {
            "liquidity": liquidity if liquidity > 0 else None,
        },
    }


# ── DexScreener — token market data ──────────────────────────────────────────
DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex/tokens/{address}"

DEXSCREENER_CHAIN_MAP = {
    "ethereum": "ethereum",
    "bsc":      "bsc",
    "base":     "base",
    "polygon":  "polygon",
    "arbitrum": "arbitrum",
    "solana":   "solana",
}


def fetch_market_data(address: str, chain: str) -> dict | None:
    """
    Fetch live token market data from DexScreener (free, no key required).
    Returns the best pair (highest liquidity) or None on failure.
    """
    url = DEXSCREENER_URL.format(address=address)
    try:
        resp = requests.get(url, timeout=8, headers={"Accept": "application/json"})
        resp.raise_for_status()
        data = resp.json()
        pairs = data.get("pairs") or []

        # Filter by chain and pick highest-liquidity pair
        chain_id = DEXSCREENER_CHAIN_MAP.get(chain.lower(), chain)
        filtered = [p for p in pairs if p.get("chainId", "").lower() == chain_id]
        if not filtered:
            filtered = pairs  # fall back to all chains

        if not filtered:
            return None

        best = max(filtered, key=lambda p: float((p.get("liquidity") or {}).get("usd", 0) or 0))
        return best

    except Exception:
        return None  # market data is optional — never block a scan
