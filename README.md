# ☠ Honeypot Scanner v3.0

Full-stack modular memecoin security auditor.

## Tech Stack
| Layer    | Technology         |
|----------|--------------------|
| Backend  | Python 3.11 + Flask|
| API      | honeypot.is v2     |
| Frontend | HTML + CSS + JS    |
| Layout   | Sidebar + scroll   |

---

## Project Structure

```
honeypot-scanner/
├── app.py                     ← Flask entry point (routes only)
├── requirements.txt
├── modules/
│   ├── __init__.py
│   ├── api_client.py          ← honeypot.is HTTP wrapper
│   ├── scanner.py             ← Scan pipeline orchestrator
│   ├── risk.py                ← Flag extraction + score computation
│   └── models.py              ← Dataclasses (ScanReport, RiskFlag…)
└── static/
    ├── index.html             ← HTML shell with all 7 sections
    ├── css/
    │   ├── base.css           ← Tokens, reset, layout shell
    │   ├── sidebar.css        ← Fixed sidebar navigation
    │   ├── hero.css           ← Hero / landing section
    │   ├── scanner.css        ← Input form, chain pills, history
    │   ├── results.css        ← Risk banner, score ring, token cards
    │   ├── flags.css          ← Risk flag rows + summary pills
    │   ├── simulation.css     ← Buy/sell simulation cards + verdict
    │   ├── education.css      ← How it works reference grid
    │   └── feedback.css       ← Star rating + feedback form
    └── js/
        ├── particles.js       ← Ambient canvas particle system
        ├── sidebar.js         ← Scroll-spy, active nav states
        ├── scanner.js         ← Input, chain sync, POST /api/scan
        ├── results.js         ← Renders all result sections
        ├── feedback.js        ← Star rating + POST /api/feedback
        └── app.js             ← Boot, keyboard shortcuts, wiring
```

---

## Run

```bash
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

---

## API Endpoints

| Method | Path           | Description                        |
|--------|----------------|------------------------------------|
| POST   | /api/scan      | Scan a token contract              |
| POST   | /api/feedback  | Submit user feedback on a scan     |

### POST /api/scan
```json
{ "address": "0x...", "chain": "ethereum" }
```
Supported chains: `ethereum`, `bsc`, `base`, `polygon`, `arbitrum`

---

## Sections
| # | Section      | Description                               |
|---|--------------|-------------------------------------------|
| 1 | Hero         | Landing, stats, CTA                       |
| 2 | Scanner      | Input + chain select + history            |
| 3 | Risk Score   | Risk banner + score ring + token cards    |
| 4 | Risk Flags   | Per-flag breakdown with severity          |
| 5 | Simulation   | Buy/sell TX simulation cards + verdict    |
| 6 | How It Works | Education reference cards                 |
| 7 | Feedback     | User accuracy rating + comment form       |

---

## Keyboard Shortcuts
- `Ctrl/Cmd + K` — Focus the address input
- `Ctrl/Cmd + Enter` — Trigger scan

---

> Not financial advice. Always DYOR. Automated scans are not 100% guaranteed.
