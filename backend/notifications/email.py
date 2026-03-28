"""
Email notifications using the Resend API.
Silently skips if RESEND_API_KEY or ALERT_EMAIL_TO is not configured.

Two sending modes:
  send_alert_immediate(alert) — fires the moment an alert is detected (real-time, per alert)
  send_digest(alerts, n)      — end-of-scan summary; heartbeat if 0 alerts found
"""
import datetime
import logging
import resend

import config

logger = logging.getLogger(__name__)

BULLISH_PATTERNS = {
    'Hammer', 'Inverted Hammer', 'Bullish Engulfing', 'Morning Star',
    'Three White Soldiers', 'Dragonfly Doji', 'Pin Bar', 'Piercing Line',
    'RSI Oversold', 'MA150 Touch', 'MA150 Cross',
}

# Shared footer used by both alert and heartbeat emails
_FOOTER = (
    "<p style='color:#64748b;font-size:11px;margin-top:20px;text-align:center'>"
    "PatternScanner — ניתוח אוטומטי של דפוסי נרות ומדדים טכניים"
    "</p>"
)


def _next_scan_line() -> str:
    """Return an HTML line showing the configured next-scan time."""
    return (
        f"<p style='color:#94a3b8;font-size:12px;margin-top:12px;text-align:center'>"
        f"⏰ הסריקה הבאה מתוזמנת ל-<strong>{config.SCAN_TIME}</strong> "
        f"({config.TIMEZONE})"
        f"</p>"
    )


def _alert_row(alert: dict) -> str:
    ticker  = alert.get("ticker", "")
    pattern = alert.get("pattern_name", "")
    price   = f"${alert['price_at_alert']:.2f}" if alert.get("price_at_alert") else "—"
    rr      = f"1:{alert['rr_ratio']:.1f}" if alert.get("rr_ratio") else "—"
    gold    = "⭐ " if alert.get("signal_type") == "gold" else ""
    risk    = " ⚠️" if alert.get("high_risk") else ""
    earnings = " 🚨" if alert.get("earnings_imminent") else ""
    return (
        f"<tr>"
        f"<td style='padding:8px 12px;font-weight:bold;color:#38bdf8'>{ticker}</td>"
        f"<td style='padding:8px 12px'>{gold}{pattern}{risk}{earnings}</td>"
        f"<td style='padding:8px 12px;font-family:monospace'>{price}</td>"
        f"<td style='padding:8px 12px;font-family:monospace;color:#22c55e'>{rr}</td>"
        f"</tr>"
    )


def send_alert_immediate(alert: dict) -> bool:
    """
    Send a single real-time alert email the moment a signal is detected.
    Called once per alert from run_scan(), before the end-of-scan digest.
    """
    if not config.RESEND_API_KEY or not config.ALERT_EMAIL_TO:
        return False

    resend.api_key = config.RESEND_API_KEY

    ticker   = alert.get("ticker", "")
    pattern  = alert.get("pattern_name", "")
    is_gold  = alert.get("signal_type") == "gold"
    is_bull  = pattern in BULLISH_PATTERNS
    price    = alert.get("price_at_alert")
    sl       = alert.get("stop_loss")
    tp1      = alert.get("take_profit")
    tp2      = alert.get("take_profit_2")
    rr       = alert.get("rr_ratio")
    earnings = alert.get("earnings_imminent", False)
    high_risk = alert.get("high_risk", False)
    sr       = alert.get("success_rate")
    occ      = alert.get("occurrences")
    now_str  = datetime.datetime.now().strftime("%H:%M:%S")

    direction_label = "📈 סיגנל קנייה שורי" if is_bull else "📉 סיגנל דובי"
    direction_color = "#22c55e" if is_bull else "#ef4444"

    if is_gold:
        subject = f"⭐ GOLD {'BUY' if is_bull else 'BEAR'}: {ticker} — {pattern}"
    else:
        subject = f"{'🟢' if is_bull else '🔴'} {ticker} — {pattern}"

    price_str = f"${price:.2f}" if price else "—"
    sl_str    = f"${sl:.2f}"   if sl   else "—"
    tp1_str   = f"${tp1:.2f}"  if tp1  else "—"
    tp2_str   = f"${tp2:.2f}"  if tp2  else "—"
    rr_str    = f"1:{rr:.1f}"  if rr   else "—"
    sr_str    = f"{sr:.0f}%"   if sr is not None else "—"
    occ_str   = str(occ)       if occ  else "—"

    gold_banner = (
        f"<div style='background:#854d0e22;border:1px solid #854d0e66;border-radius:8px;"
        f"padding:10px 14px;margin-bottom:14px;text-align:center'>"
        f"<span style='font-size:20px'>⭐</span> "
        f"<strong style='color:#fbbf24'>Gold Signal</strong>"
        f"</div>"
    ) if is_gold else ""

    earnings_banner = (
        f"<div style='background:#ef444422;border:1px solid #ef444466;border-radius:8px;"
        f"padding:8px 14px;margin-bottom:14px;font-size:12px;color:#fca5a5;text-align:center'>"
        f"🚨 <strong>דוח רווחים קרוב</strong> — הקנייה האוטומטית חסומה"
        f"</div>"
    ) if earnings else ""

    high_risk_banner = (
        f"<div style='background:#f59e0b22;border:1px solid #f59e0b66;border-radius:8px;"
        f"padding:8px 14px;margin-bottom:14px;font-size:12px;color:#fde68a;text-align:center'>"
        f"⚠️ שוק בסיכון — SPY מתחת ל-MA50"
        f"</div>"
    ) if high_risk else ""

    sr_row = (
        f"<tr style='border-bottom:1px solid #1e293b'>"
        f"<td style='padding:8px 14px;color:#94a3b8;font-size:13px'>אחוז הצלחה היסטורי</td>"
        f"<td style='padding:8px 14px;font-family:monospace;font-weight:bold;color:#fbbf24'>"
        f"{sr_str} ({occ_str} מופעים)</td>"
        f"</tr>"
    ) if sr is not None else ""

    html = f"""
    <div dir="rtl" style="font-family:sans-serif;background:#080d1a;color:#e2e8f0;
         padding:24px;border-radius:12px;max-width:580px">

      <h2 style="color:#38bdf8;margin-bottom:2px">PatternScanner — התראה חדשה</h2>
      <p style="color:#94a3b8;margin-top:0;font-size:13px">{now_str}</p>

      {gold_banner}
      {earnings_banner}
      {high_risk_banner}

      <!-- Ticker + direction -->
      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;
           padding:18px 20px;margin-bottom:14px">
        <div style="font-size:32px;font-family:monospace;font-weight:bold;color:#38bdf8">
          {ticker}
        </div>
        <div style="font-size:15px;font-weight:bold;color:{direction_color};margin-top:4px">
          {direction_label}
        </div>
        <div style="font-size:13px;color:#94a3b8;margin-top:4px">{pattern}</div>
      </div>

      <!-- Stats table -->
      <table style="width:100%;border-collapse:collapse;background:#0f1629;
             border-radius:8px;overflow:hidden;margin-bottom:14px">
        <tbody>
          <tr style="border-bottom:1px solid #1e293b">
            <td style="padding:8px 14px;color:#94a3b8;font-size:13px">מחיר כניסה</td>
            <td style="padding:8px 14px;font-family:monospace;font-weight:bold;
                color:#e2e8f0">{price_str}</td>
          </tr>
          <tr style="border-bottom:1px solid #1e293b">
            <td style="padding:8px 14px;color:#94a3b8;font-size:13px">⛔ Stop Loss</td>
            <td style="padding:8px 14px;font-family:monospace;font-weight:bold;
                color:#ef4444">{sl_str}</td>
          </tr>
          <tr style="border-bottom:1px solid #1e293b">
            <td style="padding:8px 14px;color:#94a3b8;font-size:13px">🎯 Target TP1</td>
            <td style="padding:8px 14px;font-family:monospace;font-weight:bold;
                color:#22c55e">{tp1_str}</td>
          </tr>
          <tr style="border-bottom:1px solid #1e293b">
            <td style="padding:8px 14px;color:#94a3b8;font-size:13px">🚀 Target TP2</td>
            <td style="padding:8px 14px;font-family:monospace;font-weight:bold;
                color:#818cf8">{tp2_str}</td>
          </tr>
          <tr style="border-bottom:1px solid #1e293b">
            <td style="padding:8px 14px;color:#94a3b8;font-size:13px">R/R Ratio</td>
            <td style="padding:8px 14px;font-family:monospace;font-weight:bold;
                color:#38bdf8">{rr_str}</td>
          </tr>
          {sr_row}
        </tbody>
      </table>

      {_next_scan_line()}
      {_FOOTER}
    </div>
    """

    try:
        resend.Emails.send({
            "from":    "PatternScanner <onboarding@resend.dev>",
            "to":      [config.ALERT_EMAIL_TO],
            "subject": subject,
            "html":    html,
        })
        logger.info(f"Immediate alert email sent: {ticker} {pattern}")
        return True
    except Exception as exc:
        logger.warning(f"Immediate alert email failed ({ticker}): {exc}")
        return False


def _send_heartbeat(tickers_scanned: int) -> bool:
    """Send a 'no alerts found' status email so the user knows the system is alive."""
    now_str = datetime.datetime.now().strftime("%H:%M:%S")
    subject = "Sentinel Scan Complete: No Alerts Found Today"

    html = f"""
    <div dir="rtl" style="font-family:sans-serif;background:#080d1a;color:#e2e8f0;padding:24px;border-radius:12px;max-width:600px">
      <h2 style="color:#38bdf8;margin-bottom:4px">PatternScanner — Sentinel</h2>
      <p style="color:#94a3b8;margin-top:0">דוח סריקה יומי — {now_str}</p>

      <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:20px;margin:16px 0;text-align:center">
        <div style="font-size:36px;margin-bottom:8px">✅</div>
        <div style="font-size:18px;font-weight:bold;color:#22c55e;margin-bottom:6px">
          המערכת תקינה ופעילה
        </div>
        <div style="color:#94a3b8;font-size:13px">
          System is healthy and monitoring
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;background:#0f1629;border-radius:8px;overflow:hidden;margin-bottom:12px">
        <tbody>
          <tr style="border-bottom:1px solid #1e293b">
            <td style="padding:10px 14px;color:#94a3b8;font-size:13px">מניות שנסרקו</td>
            <td style="padding:10px 14px;font-family:monospace;font-weight:bold;color:#e2e8f0;text-align:left">{tickers_scanned}</td>
          </tr>
          <tr style="border-bottom:1px solid #1e293b">
            <td style="padding:10px 14px;color:#94a3b8;font-size:13px">עמדו בקריטריונים Gold / Standard</td>
            <td style="padding:10px 14px;font-family:monospace;font-weight:bold;color:#64748b;text-align:left">0</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;color:#94a3b8;font-size:13px">זמן סיום סריקה</td>
            <td style="padding:10px 14px;font-family:monospace;color:#e2e8f0;text-align:left">{now_str}</td>
          </tr>
        </tbody>
      </table>

      <div style="background:#0f2a1a;border:1px solid #166534;border-radius:8px;padding:10px 14px;font-size:12px;color:#86efac">
        Scanned {tickers_scanned} tickers. 0 met the Gold/Standard criteria.
        System is healthy and monitoring.
      </div>

      {_next_scan_line()}
      {_FOOTER}
    </div>
    """

    logger.info(
        f"Scan finished at {now_str}. "
        f"Sending empty-result email to {config.ALERT_EMAIL_TO}"
    )
    try:
        resend.Emails.send({
            "from":    "PatternScanner <onboarding@resend.dev>",
            "to":      [config.ALERT_EMAIL_TO],
            "subject": subject,
            "html":    html,
        })
        logger.info(f"Heartbeat email sent to {config.ALERT_EMAIL_TO}")
        return True
    except Exception as exc:
        logger.warning(f"Heartbeat email failed: {exc}")
        return False


def send_digest(new_alerts: list[dict], tickers_scanned: int = 0) -> bool:
    """
    Send an email after every scan — always.

    • new_alerts is non-empty → alert digest with table of signals.
    • new_alerts is empty     → heartbeat/status email (proof of life).

    Returns True if sent, False if skipped (missing config) or failed.
    """
    if not config.RESEND_API_KEY or not config.ALERT_EMAIL_TO:
        logger.debug("Email skipped: RESEND_API_KEY or ALERT_EMAIL_TO not set")
        return False

    resend.api_key = config.RESEND_API_KEY

    # ── No alerts → heartbeat ─────────────────────────────────────────────────
    if not new_alerts:
        return _send_heartbeat(tickers_scanned)

    # ── Alert digest ──────────────────────────────────────────────────────────
    now_str     = datetime.datetime.now().strftime("%H:%M:%S")
    gold_alerts = [a for a in new_alerts if a.get("signal_type") == "gold"]
    bullish     = [a for a in new_alerts if a.get("pattern_name") in BULLISH_PATTERNS]

    subject = f"🟢 {len(new_alerts)} סיגנלים חדשים — PatternScanner"
    if gold_alerts:
        subject = f"⭐ {len(gold_alerts)} GOLD + {len(new_alerts)} סה״כ — PatternScanner"

    rows_html = "\n".join(_alert_row(a) for a in new_alerts)

    html = f"""
    <div dir="rtl" style="font-family:sans-serif;background:#080d1a;color:#e2e8f0;padding:24px;border-radius:12px;max-width:600px">
      <h2 style="color:#38bdf8;margin-bottom:4px">PatternScanner</h2>
      <p style="color:#94a3b8;margin-top:0">דוח סריקה יומי — {len(new_alerts)} סיגנלים חדשים זוהו | {now_str}</p>

      {'<div style="background:#22c55e22;border:1px solid #22c55e44;border-radius:8px;padding:10px 14px;margin-bottom:16px;"><strong style=\'color:#22c55e\'>🟢 ' + str(len(bullish)) + ' סיגנלי קנייה פעילים</strong></div>' if bullish else ''}

      <table style="width:100%;border-collapse:collapse;background:#0f1629;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#1e2d4a;color:#94a3b8;font-size:12px">
            <th style="padding:8px 12px;text-align:right">טיקר</th>
            <th style="padding:8px 12px;text-align:right">סיגנל</th>
            <th style="padding:8px 12px;text-align:right">מחיר</th>
            <th style="padding:8px 12px;text-align:right">R/R</th>
          </tr>
        </thead>
        <tbody>
          {rows_html}
        </tbody>
      </table>

      <div style="margin-top:12px;padding:10px 14px;background:#0f1629;border-radius:8px;font-size:12px;color:#64748b">
        נסרקו {tickers_scanned} מניות · {len(new_alerts)} סיגנלים · {len(gold_alerts)} Gold
      </div>

      {_next_scan_line()}
      {_FOOTER}
    </div>
    """

    try:
        resend.Emails.send({
            "from":    "PatternScanner <onboarding@resend.dev>",
            "to":      [config.ALERT_EMAIL_TO],
            "subject": subject,
            "html":    html,
        })
        logger.info(
            f"Email digest sent to {config.ALERT_EMAIL_TO} "
            f"({len(new_alerts)} alerts, {len(gold_alerts)} gold)"
        )
        return True
    except Exception as exc:
        logger.warning(f"Email digest failed: {exc}")
        return False
