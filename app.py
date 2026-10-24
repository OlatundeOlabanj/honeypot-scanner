"""
app.py — Flask entry point. Routes only; all logic lives in modules/.
"""
import re
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from modules.scanner import scan_token

app = Flask(__name__, static_folder="static")

FEEDBACK_EMAIL = "tundeolabanjo2020@gmail.com"

# Address validation
_BASE58  = re.compile(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$')
_EVM_HEX = re.compile(r'^0x[0-9a-fA-F]{40}$', re.IGNORECASE)


def _validate_address(address: str, chain: str):
    chain = chain.lower()
    if chain == "solana":
        if not _BASE58.match(address):
            return None, "Invalid Solana address. Expected a 32–44 character base58 string."
        return address, None
    addr = address if address.startswith(("0x", "0X")) else "0x" + address
    if not _EVM_HEX.match(addr):
        return None, "Invalid EVM address. Expected a 42-character hex string starting with 0x."
    return addr, None


def _send_feedback_email(entry: dict) -> bool:
    """
    Send feedback to FEEDBACK_EMAIL via Gmail SMTP.
    Requires env vars: GMAIL_USER and GMAIL_PASS (App Password).
    Returns True on success, False if unconfigured or failed.
    """
    sender   = os.environ.get("GMAIL_USER", "").strip()
    password = os.environ.get("GMAIL_PASS", "").strip()

    if not sender or not password:
        return False  # not configured — fall back to in-memory only

    rating  = entry.get("rating") or "N/A"
    stars   = "★" * int(rating) + "☆" * (5 - int(rating)) if isinstance(rating, int) else str(rating)
    chain   = (entry.get("chain") or "unknown").upper()
    addr    = entry.get("address") or "N/A"
    fb_type = entry.get("type")    or "general"
    comment = entry.get("comment") or "(no comment)"
    ts      = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")

    subject = f"[MemeScanner] New Feedback — {stars} — {chain}"
    body    = f"""
MemeScanner Feedback Received
──────────────────────────────
Timestamp  : {ts}
Rating     : {stars} ({rating}/5)
Type       : {fb_type}
Chain      : {chain}
Address    : {addr}

Comment:
{comment}

──────────────────────────────
MemeScanner v3.0
"""

    msg = MIMEMultipart("alternative")
    msg["From"]    = sender
    msg["To"]      = FEEDBACK_EMAIL
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as srv:
            srv.login(sender, password)
            srv.send_message(msg)
        return True
    except Exception as e:
        app.logger.warning(f"Email send failed: {e}")
        return False


# ── Static files ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/css/<path:filename>")
def css(filename):
    return send_from_directory("static/css", filename)

@app.route("/js/<path:filename>")
def js(filename):
    return send_from_directory("static/js", filename)


# ── API routes ────────────────────────────────────────────────────────────────

@app.route("/api/scan", methods=["POST"])
def api_scan():
    body     = request.get_json(force=True, silent=True) or {}
    raw_addr = (body.get("address") or "").strip()
    chain    = (body.get("chain")   or "ethereum").lower()

    if not raw_addr:
        return jsonify({"error": "No contract address provided."}), 400

    address, err = _validate_address(raw_addr, chain)
    if err:
        return jsonify({"error": err}), 400

    try:
        report = scan_token(address, chain)
        return jsonify(report.to_dict())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502
    except Exception as e:
        return jsonify({"error": f"Unexpected server error: {e}"}), 500


@app.route("/api/feedback", methods=["POST"])
def api_feedback():
    body  = request.get_json(force=True, silent=True) or {}
    entry = {
        "address": body.get("address", ""),
        "chain":   body.get("chain",   ""),
        "rating":  body.get("rating"),
        "type":    body.get("type",    "general"),
        "comment": (body.get("comment") or "")[:500],
    }

    # Store in memory regardless
    app.config.setdefault("FEEDBACK", []).append(entry)

    # Attempt email delivery
    emailed = _send_feedback_email(entry)

    return jsonify({
        "ok":      True,
        "received": len(app.config["FEEDBACK"]),
        "emailed":  emailed,
    })


if __name__ == "__main__":
    app.run(debug=os.environ.get('FLASK_DEBUG') == '1', port=5000)
