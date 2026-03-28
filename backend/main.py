"""
PatternScanner — Python FastAPI backend  (Phase 3 + scan upgrade)
"""
import asyncio
import datetime
import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo

import config
from db import repository as repo
from ibkr.connector import disconnect, get_ib, get_status
from ibkr.data_fetcher import fetch_all, fetch_ticker
from ibkr.yfinance_fetcher import fetch_all_yf, fetch_ticker_yf
from scanner.daily_scan import run_scan, get_stock_profile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────────
_scheduler = AsyncIOScheduler(timezone=ZoneInfo(config.TIMEZONE))

# ── Shared scan state ─────────────────────────────────────────────────────────
_scan: dict = {
    "status":        "idle",
    "current_ticker": None,
    "progress":      0,
    "total":         0,
    "new_alerts":    0,
    "results":       {},
    "error":         None,
    "started_at":    None,
    "finished_at":   None,
    "data_source":   None,   # "ibkr" | "yfinance" | None
}


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await get_ib(config.IBKR_HOST, config.IBKR_PORT, config.IBKR_CLIENT_ID)
    except Exception as exc:
        logger.warning(f"IBKR not available on startup: {exc}")

    # Start scheduled daily scan
    scan_hour, scan_min = (int(x) for x in config.SCAN_TIME.split(":"))
    _scheduler.add_job(
        _run_full_scan,
        CronTrigger(hour=scan_hour, minute=scan_min, timezone=ZoneInfo(config.TIMEZONE)),
        id="daily_scan",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"Scheduler started — daily scan at {config.SCAN_TIME} ({config.TIMEZONE})")

    yield

    _scheduler.shutdown(wait=False)
    await disconnect()


app = FastAPI(title="PatternScanner API", version="0.4.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        config.FRONTEND_URL,
        "http://localhost:3000",
        "https://trading-bot-five-eta.vercel.app",
        "https://*.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "version": "0.4.0"}


# ── IBKR ─────────────────────────────────────────────────────────────────────
@app.get("/ibkr/status")
def ibkr_status():
    return get_status()

@app.post("/ibkr/connect")
async def ibkr_connect():
    try:
        await get_ib(config.IBKR_HOST, config.IBKR_PORT, config.IBKR_CLIENT_ID)
        return get_status()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# ── Scan ──────────────────────────────────────────────────────────────────────
@app.get("/scan/status")
def scan_status():
    return _scan

@app.post("/scan/trigger")
async def scan_trigger(background_tasks: BackgroundTasks, body: dict | None = None):
    if _scan["status"] == "running":
        return {"message": "סריקה כבר פועלת", **_scan}
    settings = body or {}
    background_tasks.add_task(_run_full_scan, settings=settings)
    return {"message": "סריקה התחילה"}

@app.post("/scan/send-test-email")
def send_test_email():
    """Send a digest email with today's existing alerts (for testing email delivery)."""
    from notifications.email import send_digest
    alerts = repo.get_alerts(outcome=None, limit=100)
    today_alerts = [
        a for a in alerts
        if a.get("detected_at", "").startswith(str(__import__("datetime").date.today()))
    ]
    sent = send_digest(today_alerts, tickers_scanned=len(repo.get_watchlist()))
    return {"sent": sent, "alerts_included": len(today_alerts)}

@app.get("/scan/next")
def scan_next():
    job = _scheduler.get_job("daily_scan")
    if job and job.next_run_time:
        return {"next_run": job.next_run_time.isoformat()}
    return {"next_run": None}


# ── Candles ───────────────────────────────────────────────────────────────────
@app.get("/candles/{ticker}")
def get_candles(ticker: str, days: int = 365):
    rows = repo.get_candles(ticker.upper(), days)
    return [
        {**r,
         "date":  str(r["date"]),
         "open":  float(r["open"]),
         "high":  float(r["high"]),
         "low":   float(r["low"]),
         "close": float(r["close"])}
        for r in rows
    ]


# ── Validated Patterns ────────────────────────────────────────────────────────

@app.get("/patterns")
def get_patterns(ticker: str | None = None):
    return repo.get_validated_patterns(ticker=ticker)


# ── Stock Profile ──────────────────────────────────────────────────────────────

@app.get("/stock-profile/{ticker}")
def stock_profile(ticker: str):
    return get_stock_profile(ticker.upper())


# ── Alerts ────────────────────────────────────────────────────────────────────
@app.get("/alerts")
def get_alerts(outcome: str = "pending", limit: int = 100):
    return repo.get_alerts(outcome=outcome if outcome != "all" else None, limit=limit)

@app.post("/resolve-alerts")
def resolve_alerts():
    resolved = repo.resolve_pending_alerts()
    return {"resolved": resolved}


# ── Prices ─────────────────────────────────────────────────────────────────────
@app.get("/prices")
def get_prices():
    """Return latest close + % change from prev day for all watchlist tickers."""
    tickers = [r["ticker"] for r in repo.get_watchlist()]
    result = {}
    for ticker in tickers:
        rows = repo.get_candles(ticker, days=3)
        if len(rows) >= 2:
            curr = float(rows[-1]["close"])
            prev = float(rows[-2]["close"])
            change = ((curr - prev) / prev * 100) if prev > 0 else None
            result[ticker] = {"price": curr, "change": round(change, 2) if change is not None else None, "date": str(rows[-1]["date"])}
        elif len(rows) == 1:
            result[ticker] = {"price": float(rows[-1]["close"]), "change": None, "date": str(rows[-1]["date"])}
    return result


@app.get("/paper-portfolio")
def get_paper_portfolio():
    """Return current paper portfolio: cash + open positions with live P&L,
    trailing stop ratchet, and sector breakdown."""
    cash      = repo.get_paper_cash()
    positions = repo.get_paper_positions()

    enriched: list[dict] = []
    total_market_value   = 0.0

    for p in positions:
        rows = repo.get_candles(p["ticker"], days=3)
        if rows:
            cp = float(rows[-1]["close"])
        else:
            cp = float(p["avg_price"])

        qty = float(p["quantity"])
        avg = float(p["avg_price"])
        mv  = round(cp * qty, 2)
        total_market_value += mv

        # ── Trailing stop ratchet ──────────────────────────────────────────
        # Whenever price makes a new high, stop-loss is moved up to lock in gains.
        #   trailing_stop = highest_price × (1 − trailing_stop_pct / 100)
        highest   = float(p.get("highest_price") or avg)
        trail_pct = float(p.get("trailing_stop_pct") or 5.0) / 100
        if cp > highest:
            highest        = cp
            new_trail_stop = round(cp * (1 - trail_pct), 4)
            current_stop   = float(p.get("stop_loss") or 0)
            if new_trail_stop > current_stop:
                repo.update_trailing_stop(p["ticker"], new_trail_stop, highest)
                p["stop_loss"] = new_trail_stop
            else:
                repo.update_trailing_stop(p["ticker"], current_stop, highest)
            p["highest_price"] = highest

        opened = p["opened_at"]
        enriched.append({
            "ticker":          p["ticker"],
            "quantity":        qty,
            "avgPrice":        avg,
            "currentPrice":    cp,
            "stopLoss":        p.get("stop_loss"),
            "takeProfit":      p.get("take_profit"),
            "gainPct":         round((cp / avg - 1) * 100, 2) if avg else 0.0,
            "marketValue":     mv,
            "openedAt":        opened.isoformat() if hasattr(opened, "isoformat") else str(opened),
            "highestPrice":    p.get("highest_price"),
            "trailingStopPct": p.get("trailing_stop_pct"),
            "sector":          p.get("sector"),
            "alertId":         p.get("alert_id"),
        })

    total_value    = cash + total_market_value
    total_gain_pct = round((total_value / 10_000 - 1) * 100, 2)
    total_gain_usd = round(total_value - 10_000, 2)

    # ── Sector breakdown ───────────────────────────────────────────────────────
    sector_map: dict[str, float] = {}
    for pos in enriched:
        s = pos.get("sector") or "Other"
        sector_map[s] = sector_map.get(s, 0) + pos["marketValue"]

    total_equity = cash + total_market_value
    sector_breakdown = [
        {
            "sector": s,
            "value":  round(v, 2),
            "pct":    round(v / total_equity * 100, 1) if total_equity else 0.0,
        }
        for s, v in sorted(sector_map.items(), key=lambda x: -x[1])
    ]

    return {
        "cash":            round(cash, 2),
        "positions":       enriched,
        "totalValue":      round(total_value, 2),
        "totalGainPct":    total_gain_pct,
        "totalGainUsd":    total_gain_usd,
        "sectorBreakdown": sector_breakdown,
    }


@app.get("/paper-portfolio/position/{ticker}")
def get_position_detail(ticker: str):
    """Return a single position with its linked alert data (why we entered, targets, R:R)."""
    positions = repo.get_paper_positions()
    pos = next((p for p in positions if p["ticker"] == ticker), None)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    alert = None
    if pos.get("alert_id"):
        alert = repo.get_alert_by_id(pos["alert_id"])
    return {"position": pos, "alert": alert}


@app.get("/paper-trades")
def get_paper_trades_endpoint(limit: int = 100):
    """Return paper trading history."""
    return repo.get_paper_trades(limit)


@app.post("/paper-buy")
def manual_paper_buy(body: dict):
    """
    Manually open a paper position using the 2% equity risk rule.

    Position Sizing Formula:
        risk_amount    = total_equity × 0.02
        risk_per_share = price − stop_loss
        quantity       = risk_amount / risk_per_share
        (capped at 20% of equity per position)

    Sector Exposure Check:
        Rejects if adding this position would push a single sector above 30% of equity.

    Body: { ticker, price, stopLoss?, takeProfit? }
    """
    from scanner.earnings import get_sector

    ticker      = str(body.get("ticker", "")).upper()
    price       = float(body.get("price", 0))
    stop_loss   = body.get("stopLoss")
    take_profit = body.get("takeProfit")

    if not ticker or price <= 0:
        raise HTTPException(status_code=400, detail="ticker and price required")

    positions = repo.get_paper_positions()
    if any(p["ticker"] == ticker for p in positions):
        return {"ok": False, "reason": "position already open", "ticker": ticker}

    cash        = repo.get_paper_cash()
    total_value = cash + sum(p["quantity"] * p["avg_price"] for p in positions)

    if stop_loss and float(stop_loss) < price:
        risk_per_share = price - float(stop_loss)
        quantity       = (total_value * 0.02) / risk_per_share
    else:
        quantity = (total_value * 0.05) / price

    max_qty  = (total_value * 0.20) / price
    quantity = round(min(quantity, max_qty), 4)

    position_value = round(quantity * price, 2)
    if position_value < 100:
        return {"ok": False, "reason": f"position too small (${position_value:.0f})", "ticker": ticker}
    if position_value > cash:
        return {"ok": False, "reason": f"insufficient cash (${cash:.0f})", "ticker": ticker}

    # ── Sector exposure check ─────────────────────────────────────────────────
    # Reject if this buy would push a sector's share of total equity above 30%.
    sector = get_sector(ticker)
    if sector and total_value > 0:
        existing_sector_value = sum(
            float(p["quantity"]) * float(p["avg_price"])
            for p in positions
            if p.get("sector") == sector
        )
        projected_pct = (existing_sector_value + position_value) / total_value * 100
        if projected_pct > 30.0:
            return {
                "ok":     False,
                "reason": f"חשיפת יתר לסקטור {sector} ({projected_pct:.0f}% > 30%)",
                "ticker": ticker,
                "sector": sector,
            }

    ok = repo.execute_paper_buy(
        ticker=ticker,
        quantity=quantity,
        price=price,
        stop_loss=float(stop_loss) if stop_loss else None,
        take_profit=float(take_profit) if take_profit else None,
        sector=sector,
    )
    pct_risked = round((price - float(stop_loss)) * quantity / total_value * 100, 2) \
                 if stop_loss and float(stop_loss) < price else None

    return {
        "ok":            ok,
        "ticker":        ticker,
        "quantity":      quantity,
        "price":         price,
        "positionValue": position_value,
        "pctRisked":     pct_risked,
        "sector":        sector,
    }


@app.post("/paper-reset")
def paper_reset():
    """Reset the paper portfolio back to $10,000 (clears all positions and trades)."""
    from db.repository import get_connection
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM paper_positions")
            cur.execute("DELETE FROM paper_trades")
            cur.execute(
                "INSERT INTO paper_portfolio (id, cash_balance) VALUES (1, 10000) "
                "ON CONFLICT (id) DO UPDATE SET cash_balance = 10000"
            )
        conn.commit()
    return {"reset": True, "cash": 10000}


# ── Background task ───────────────────────────────────────────────────────────
async def _run_full_scan(settings: dict | None = None):
    """Step 1: fetch fresh candles from IBKR. Step 2: run pattern+indicator scan."""
    _scan.update({
        "status":        "running",
        "current_ticker": None,
        "progress":      0,
        "total":         0,
        "new_alerts":    0,
        "results":       {},
        "error":         None,
        "started_at":    datetime.datetime.now().isoformat(),
        "finished_at":   None,
    })

    def progress(ticker: str, current: int, total: int):
        _scan["current_ticker"] = ticker
        _scan["progress"]       = current
        _scan["total"]          = total

    try:
        # ── Step 1: pull latest candles (IBKR → yfinance fallback) ───────────
        data_source = "ibkr"
        try:
            ib = await get_ib(config.IBKR_HOST, config.IBKR_PORT, config.IBKR_CLIENT_ID)
            await fetch_all(ib, on_progress=progress)
            try:
                await fetch_ticker(ib, "SPY")
                logger.info("SPY candles updated via IBKR")
            except Exception as exc:
                logger.warning(f"SPY IBKR fetch failed: {exc}")
        except Exception as ibkr_exc:
            logger.warning(
                f"IBKR unavailable ({ibkr_exc}) — falling back to yfinance"
            )
            data_source = "yfinance"
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None, lambda: fetch_all_yf(on_progress=progress)
            )
            await loop.run_in_executor(None, lambda: fetch_ticker_yf("SPY"))
            logger.info("Candles refreshed via yfinance (TWS-free mode)")

        _scan["data_source"] = data_source

        # ── Step 2: indicator + pattern scan (synchronous, CPU-bound) ─────────
        # Run in a thread so we don't block the event loop
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, lambda: run_scan(on_progress=progress, settings=settings or {}))

        total_alerts = sum(len(v) for v in results.values())
        _scan.update({
            "status":      "done",
            "new_alerts":  total_alerts,
            "results":     {k: len(v) for k, v in results.items()},
            "current_ticker": None,
            "finished_at": datetime.datetime.now().isoformat(),
        })

    except Exception as exc:
        logger.error(f"Scan failed: {exc}")
        _scan.update({
            "status":      "error",
            "error":       str(exc),
            "finished_at": datetime.datetime.now().isoformat(),
        })
