"""
models.py — Dataclasses for the Honeypot Scanner domain.
"""
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class MarketData:
    """Live market data from DexScreener."""
    price_usd:       Optional[float] = None
    price_change_24h: Optional[float] = None
    volume_24h:      Optional[float] = None
    liquidity_usd:   Optional[float] = None
    market_cap:      Optional[float] = None
    fdv:             Optional[float] = None
    buys_24h:        Optional[int]   = None
    sells_24h:       Optional[int]   = None
    dex_id:          Optional[str]   = None   # e.g. "uniswap", "raydium"
    pair_address:    Optional[str]   = None


@dataclass
class TokenInfo:
    name:           str           = "Unknown"
    symbol:         str           = "???"
    decimals:       Optional[int] = None
    total_holders:  Optional[int] = None
    image_url:      Optional[str] = None
    market:         MarketData    = field(default_factory=MarketData)


@dataclass
class SimulationResult:
    can_buy:      Optional[bool]  = None
    can_sell:     Optional[bool]  = None
    buy_tax:      Optional[float] = None
    sell_tax:     Optional[float] = None
    buy_gas:      Optional[int]   = None
    sell_gas:     Optional[int]   = None
    transfer_tax: Optional[float] = None


@dataclass
class ContractInfo:
    is_open_source: Optional[bool] = None
    is_proxy:       Optional[bool] = None
    is_mintable:    Optional[bool] = None
    is_freeze_auth: Optional[bool] = None


@dataclass
class PairInfo:
    liquidity: Optional[float] = None


@dataclass
class RiskFlag:
    level: str   # "critical" | "warning" | "caution"
    icon:  str
    text:  str


@dataclass
class RiskResult:
    score: int   # 0–100
    label: str
    color: str   # "critical" | "high" | "medium" | "low" | "safe"


@dataclass
class ScanReport:
    address:         str
    chain:           str
    is_honeypot:     bool          = False
    honeypot_reason: Optional[str] = None
    token:           TokenInfo     = field(default_factory=TokenInfo)
    simulation:      SimulationResult = field(default_factory=SimulationResult)
    contract:        ContractInfo  = field(default_factory=ContractInfo)
    pair:            PairInfo      = field(default_factory=PairInfo)
    flags:           List[RiskFlag] = field(default_factory=list)
    risk:            Optional[RiskResult] = None

    def to_dict(self) -> dict:
        m = self.token.market
        return {
            "address":        self.address,
            "chain":          self.chain,
            "isHoneypot":     self.is_honeypot,
            "honeypotReason": self.honeypot_reason,
            "token": {
                "name":         self.token.name,
                "symbol":       self.token.symbol,
                "decimals":     self.token.decimals,
                "totalHolders": self.token.total_holders,
                "imageUrl":     self.token.image_url,
                "market": {
                    "priceUsd":       m.price_usd,
                    "priceChange24h": m.price_change_24h,
                    "volume24h":      m.volume_24h,
                    "liquidityUsd":   m.liquidity_usd,
                    "marketCap":      m.market_cap,
                    "fdv":            m.fdv,
                    "buys24h":        m.buys_24h,
                    "sells24h":       m.sells_24h,
                    "dexId":          m.dex_id,
                    "pairAddress":    m.pair_address,
                },
            },
            "simulation": {
                "canBuy":       self.simulation.can_buy,
                "canSell":      self.simulation.can_sell,
                "buyTax":       self.simulation.buy_tax,
                "sellTax":      self.simulation.sell_tax,
                "buyGas":       self.simulation.buy_gas,
                "sellGas":      self.simulation.sell_gas,
                "transferTax":  self.simulation.transfer_tax,
            },
            "contract": {
                "isOpenSource":  self.contract.is_open_source,
                "isProxy":       self.contract.is_proxy,
                "isMintable":    self.contract.is_mintable,
                "isFreezeAuth":  self.contract.is_freeze_auth,
            },
            "liquidity": self.pair.liquidity,
            "flags": [{"level": f.level, "icon": f.icon, "text": f.text}
                      for f in self.flags],
            "risk": {
                "score": self.risk.score,
                "label": self.risk.label,
                "color": self.risk.color,
            } if self.risk else None,
        }
