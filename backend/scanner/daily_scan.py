"""
Daily scan orchestrator.

Pipeline per ticker:
  1. Load candles from DB (400 days to cover MA150 + backtest window)
  2. Volume filter      — skip if today's volume < 150% of 20-day average
  3. MA200 trend filter — BUY signals suppressed if price < 200-day MA
  4. Type 1 — Technical: RSI(14) oversold, MA150 touch / cross
  5. Type 2 — Pattern:   detect today's candlestick patterns, backtest each
  6. Save qualifying alerts to DB (with stop-loss, take-profit, R/R ratio)

Market correlation:
  - SPY's 50-day MA is checked once per run_scan() call.
  - If SPY close < MA50, all alerts are flagged high_risk=True.

Accuracy filters (reduce false BUY signals):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ MA200 Trend Filter  price < MA200(daily) → bullish alerts suppressed   │
  │ Volume (info only)  vol_ratio stored on alert; not a hard blocker      │
  │ Success Rate Gate   rate < 50%           → pattern alert suppressed    │
  │ Occurrence Gate     count < 3            → pattern alert suppressed    │
  └─────────────────────────────────────────────────────────────────────────┘

Position Sizing (2% Equity Risk Rule — used by _auto_paper_buy):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ risk_amount    = total_equity × 0.02                                   │
  │ risk_per_share = entry_price − stop_loss                               │
  │ quantity       = risk_amount / risk_per_share                          │
  │ max_quantity   = (total_equity × 0.20) / entry_price  (20% cap)       │
  │ quantity       = min(quantity, max_quantity)                           │
  └─────────────────────────────────────────────────────────────────────────┘
"""

import datetime
import logging
from typing import Callable

import config
from db import repository as repo
from patterns import indicators, detector, backtester
from notifications.email import send_digest
from scanner.earnings import check_earnings_imminent, clear_cache, TRADING_DAYS_WINDOW

logger = logging.getLogger(__name__)

# ── All known patterns ────────────────────────────────────────────────────────
ALL_PATTERNS = [
    'Hammer', 'Inverted Hammer', 'Bullish Engulfing', 'Bearish Engulfing',
    'Morning Star', 'Evening Star', 'Three White Soldiers', 'Three Black Crows',
    'Doji', 'Dragonfly Doji', 'Gravestone Doji', 'Pin Bar', 'Piercing Line',
    'Dark Cloud Cover', 'Shooting Star', 'Hanging Man', 'Harami', '3 Red + Doji',
]

# ── Thresholds ────────────────────────────────────────────────────────────────
MIN_CANDLES_RSI   = 20
MIN_CANDLES_MA    = 151
MIN_OCCURRENCES   = 3
MIN_SUCCESS_RATE  = 50.0   # % — below this, pattern alert is suppressed
GOLD_OCCURRENCES  = 5
GOLD_SUCCESS_RATE = 75.0   # % — above this, signal_type = 'gold'

VOLUME_MIN_RATIO  = 1.50   # today's volume must be ≥ 150% of 20-day avg
SPY_MA_PERIOD     = 50     # MA period for SPY market correlation


def _to_float_candles(rows: list[dict]) -> list[dict]:
    """Ensure all OHLC values are Python floats (DB may return Decimal)."""
    return [
        {
            "open":  float(r["open"]),
            "high":  float(r["high"]),
            "low":   float(r["low"]),
            "close": float(r["close"]),
        }
        for r in rows
    ]


# ── Pattern categories for stop-loss placement ────────────────────────────────
# Wick patterns: stop goes just below the candle's own low
_STOP_AT_CANDLE_LOW = {
    'Hammer', 'Inverted Hammer', 'Dragonfly Doji',
    'Pin Bar', 'Pin Bar (Bull)',
}

# Multi-candle bullish reversal: stop goes below the lowest low of the pattern window
_STOP_AT_PATTERN_LOW = {
    'Bullish Engulfing', 'Piercing Line', 'Morning Star',
    'Three White Soldiers', 'Bullish Harami',
}


def _find_resistance(candles: list[dict], current_price: float,
                     lookback: int = 120) -> float | None:
    """
    Find the nearest swing-high resistance level strictly above current_price.
    A swing high = highest point in a ±2 candle window.
    Searches the last `lookback` candles.
    Returns None if no resistance found (let the caller decide fallback).
    """
    highs = [c["high"] for c in candles[-lookback:]]
    candidates = []
    for i in range(2, len(highs) - 2):
        if highs[i] > current_price and highs[i] == max(highs[i - 2:i + 3]):
            candidates.append(highs[i])
    return round(min(candidates), 4) if candidates else None


def _compute_rr(
    candles: list[dict],
    price:   float,
    pattern_name: str,
    atr:     float,
    ma150:   float | None = None,
) -> tuple[float, float, float, float | None]:
    """
    Compute professional stop-loss, TP1, TP2, and R/R ratio.

    Stop-Loss strategy (pattern-aware):
    ┌──────────────────────────────────────────────────────────────────────────┐
    │ Wick patterns (Hammer, Pin Bar…)  → just below the candle's own low     │
    │ Multi-candle reversals (Engulfing…) → below the lowest low of pattern   │
    │ MA150 Cross/Touch                 → just below the MA150 line           │
    │ RSI Oversold                      → below the 5-bar swing low           │
    │ Default                           → price − 1.5 × ATR                   │
    └──────────────────────────────────────────────────────────────────────────┘

    Take-Profit:
    ┌──────────────────────────────────────────────────────────────────────────┐
    │ TP1 = nearest swing-high resistance (120 bars)                           │
    │       if none found or R/R < 1.0  →  price + 2.0 × ATR                 │
    │ TP2 = price + 3.0 × ATR  (extended target)                              │
    └──────────────────────────────────────────────────────────────────────────┘

    Returns (stop_loss, take_profit_1, take_profit_2, rr_ratio).
    """
    buffer = atr * 0.1   # small cushion below stop so normal noise doesn't trigger

    # ── Stop-Loss ────────────────────────────────────────────────────────────
    if pattern_name in _STOP_AT_CANDLE_LOW:
        raw_stop = candles[-1]["low"] - buffer

    elif pattern_name in _STOP_AT_PATTERN_LOW:
        window   = candles[-3:] if len(candles) >= 3 else candles
        raw_stop = min(c["low"] for c in window) - buffer

    elif "MA150" in pattern_name and ma150 is not None:
        # Price just crossed/touched MA150 from below — stop below the MA line
        raw_stop = ma150 - atr * 0.5

    elif pattern_name == "RSI Oversold":
        # Below the recent 5-bar swing low
        window   = candles[-5:] if len(candles) >= 5 else candles
        raw_stop = min(c["low"] for c in window) - buffer

    else:
        # Default: 1.5 × ATR below entry
        raw_stop = price - atr * 1.5

    # Hard cap: never risk more than 12% on a single signal
    stop_loss = round(max(raw_stop, price * 0.88), 4)

    risk = price - stop_loss
    if risk <= 0:
        # Degenerate case — fall back to 1.5 × ATR
        stop_loss = round(price - atr * 1.5, 4)
        risk      = price - stop_loss

    # ── Take-Profit ──────────────────────────────────────────────────────────
    # TP1: nearest real swing-high resistance
    resistance = _find_resistance(candles, price, lookback=120)
    if resistance is not None and (resistance - price) / risk >= 1.0:
        tp1 = resistance
    else:
        # No good resistance → ATR-based (2 × ATR)
        tp1 = round(price + atr * 2.0, 4)

    # TP2: extended target (3 × ATR)
    tp2 = round(price + atr * 3.0, 4)

    # R/R uses TP1 (conservative, nearer target)
    rr_ratio = round((tp1 - price) / risk, 2) if risk > 0 else None

    return stop_loss, tp1, tp2, rr_ratio


def _build_alert(ticker: str, pattern_name: str, signal_type: str,
                 category: str, price: float,
                 rsi: float | None = None,
                 ma150: float | None = None,
                 success_rate: float | None = None,
                 occurrences: int | None = None,
                 high_risk: bool = False,
                 vol_ratio: float | None = None,
                 stop_loss: float | None = None,
                 take_profit: float | None = None,
                 take_profit_2: float | None = None,
                 rr_ratio: float | None = None,
                 rs_vs_spy: float | None = None,
                 earnings_imminent: bool = False,
                 earnings_date=None) -> dict:
    return {
        "ticker":            ticker,
        "pattern_name":      pattern_name,
        "signal_type":       signal_type,
        "category":          category,
        "price_at_alert":    price,
        "rsi_value":         rsi,
        "ma150_value":       ma150,
        "success_rate":      success_rate,
        "occurrences":       occurrences,
        "high_risk":         high_risk,
        "volume_ratio":      vol_ratio,
        "stop_loss":         stop_loss,
        "take_profit":       take_profit,
        "take_profit_2":     take_profit_2,
        "rr_ratio":          rr_ratio,
        "rs_vs_spy":         rs_vs_spy,
        "earnings_imminent": earnings_imminent,
        "earnings_date":     earnings_date,
    }


def _save_validated_patterns(ticker: str, candles: list[dict]):
    """Run backtest for ALL known patterns and persist results to validated_patterns."""
    for pattern_name in ALL_PATTERNS:
        stats = backtester.backtest(candles, pattern_name)
        if stats["occurrences"] < MIN_OCCURRENCES:
            continue
        if (stats["occurrences"] >= GOLD_OCCURRENCES
                and stats["success_rate"] >= GOLD_SUCCESS_RATE):
            signal_type = "gold"
        elif stats["success_rate"] >= MIN_SUCCESS_RATE:
            signal_type = "standard"
        else:
            continue
        repo.upsert_validated_pattern(
            ticker=ticker,
            pattern_name=pattern_name,
            occurrences=stats["occurrences"],
            successes=stats["successes"],
            success_rate=stats["success_rate"],
            avg_gain=stats["avg_gain"],
            signal_type=signal_type,
        )


def get_stock_profile(ticker: str) -> dict:
    """
    Return today's full analysis for one ticker:
    - RSI, MA150, volume ratio
    - Patterns detected on the last candle (regardless of volume)
    - Top validated patterns historically
    """
    rows = repo.get_candles(ticker, 400)
    if len(rows) < MIN_CANDLES_RSI:
        return {"ticker": ticker, "error": "not enough candles"}

    volumes = [float(r["volume"]) if r.get("volume") else 0.0 for r in rows]
    candles = _to_float_candles(rows)
    closes  = [c["close"] for c in candles]
    price   = closes[-1]

    # Volume
    vol_today = volumes[-1]
    avg_20d   = sum(volumes[-21:-1]) / 20 if len(volumes) >= 21 else None
    vol_ratio = round(vol_today / avg_20d, 2) if avg_20d else None

    # RSI
    rsi_val = indicators.calculate_rsi(closes)
    rsi_sig = indicators.rsi_signal(closes)

    # MA150
    ma150_val = indicators.calculate_ma150(closes)
    ma150_sig = indicators.ma150_signal(closes)

    # Patterns today (ignore volume filter)
    patterns_today = []
    if len(candles) >= 4:
        detected = detector.detect_all(candles[-4:])
        for p in detected:
            stats = backtester.backtest(candles, p)
            patterns_today.append({
                "name": p,
                "occurrences": stats["occurrences"],
                "success_rate": stats["success_rate"],
                "avg_gain": stats["avg_gain"],
            })

    # Top historical patterns — add strength score and sort
    top_patterns = repo.get_validated_patterns(ticker)
    for p in top_patterns:
        p["strength_score"] = _strength_score(
            p.get("success_rate_10pct"),
            p.get("total_appearances"),
            p.get("avg_gain"),
        )
    top_patterns.sort(key=lambda p: p["strength_score"], reverse=True)

    ma200_val = indicators.calculate_ma(closes, 200)

    return {
        "ticker":  ticker,
        "price":   price,
        "rsi":     {"value": rsi_val, "signal": rsi_sig["type"] if rsi_sig else None},
        "ma150":   {"value": ma150_val, "signal": ma150_sig["type"] if ma150_sig else None,
                    "position": "below" if (ma150_val and price < ma150_val) else "above"},
        "ma200":   {"value": ma200_val,
                    "above": ma200_val is None or price >= ma200_val},
        "volume":  {"today": int(vol_today), "avg20d": int(avg_20d) if avg_20d else None,
                    "ratio": vol_ratio, "passes": bool(vol_ratio and vol_ratio >= VOLUME_MIN_RATIO)},
        "patterns_today": patterns_today,
        "top_patterns":   top_patterns,
    }


def _strength_score(success_rate: float | None, occurrences: int | None, avg_gain: float | None) -> float:
    """Composite pattern strength: success_rate * log(occurrences) * avg_gain / 100."""
    import math
    if not success_rate or not occurrences or not avg_gain:
        return 0.0
    return round(success_rate * math.log(max(occurrences, 1)) * avg_gain / 100, 2)


_BULLISH_SIGNAL_PATTERNS = {
    'Hammer', 'Inverted Hammer', 'Bullish Engulfing',
    'Morning Star', 'Three White Soldiers', 'Dragonfly Doji',
    'Pin Bar', 'Pin Bar (Bull)', 'Piercing Line',
    'RSI Oversold', 'MA150 Touch', 'MA150 Cross', 'MA150 Bullish Cross',
}


def _auto_paper_buy(alert: dict) -> None:
    """
    Execute a paper trade whenever a Gold + bullish signal fires.

    Position Sizing — 2% Equity Risk Rule
    ──────────────────────────────────────
    risk_amount    = total_equity × 0.02          (never risk more than 2% per trade)
    risk_per_share = entry_price − stop_loss       (ATR-based stop from _compute_rr)
    quantity       = risk_amount / risk_per_share

    Cap: no single position may exceed 20% of total equity.
    Min: skip if calculated position value < $200 (signal not viable).
    """
    EQUITY_RISK_PCT    = 0.02   # 2% of total equity risked per trade
    MAX_POSITION_PCT   = 0.20   # no single position > 20% of equity
    MIN_POSITION_USD   = 200.0  # minimum viable trade
    MAX_OPEN_POSITIONS = 6

    try:
        # ── Earnings safety gate ──────────────────────────────────────────────
        if alert.get("earnings_imminent"):
            logger.info(f"Paper buy skipped ({alert['ticker']}): earnings imminent")
            return

        cash      = repo.get_paper_cash()
        positions = repo.get_paper_positions()

        if len(positions) >= MAX_OPEN_POSITIONS:
            logger.info(f"Paper buy skipped ({alert['ticker']}): max {MAX_OPEN_POSITIONS} positions")
            return

        if any(p["ticker"] == alert["ticker"] for p in positions):
            logger.info(f"Paper buy skipped ({alert['ticker']}): position already open")
            return

        price     = float(alert["price_at_alert"])
        stop_loss = alert.get("stop_loss")

        total_value = cash + sum(p["quantity"] * p["avg_price"] for p in positions)

        # ── 2% risk rule ─────────────────────────────────────────────────────
        if stop_loss and float(stop_loss) < price:
            risk_amount    = total_value * EQUITY_RISK_PCT          # e.g. $200 on $10k
            risk_per_share = price - float(stop_loss)               # distance to stop
            quantity       = risk_amount / risk_per_share
        else:
            # No valid stop → fallback to 5% of equity (conservative fixed allocation)
            quantity = (total_value * 0.05) / price

        # Cap: never let one position exceed MAX_POSITION_PCT of equity
        max_qty  = (total_value * MAX_POSITION_PCT) / price
        quantity = round(min(quantity, max_qty), 4)

        position_value = quantity * price
        if position_value < MIN_POSITION_USD:
            logger.info(
                f"Paper buy skipped ({alert['ticker']}): "
                f"position ${position_value:.0f} below minimum ${MIN_POSITION_USD:.0f}"
            )
            return
        if position_value > cash:
            logger.info(f"Paper buy skipped ({alert['ticker']}): insufficient cash ${cash:.0f}")
            return

        ok = repo.execute_paper_buy(
            ticker=alert["ticker"],
            quantity=quantity,
            price=price,
            stop_loss=stop_loss,
            take_profit=alert.get("take_profit"),
        )
        if ok:
            pct_risked = ((price - float(stop_loss)) * quantity / total_value * 100
                         if stop_loss and float(stop_loss) < price else 0)
            logger.info(
                f"Paper BUY: {alert['ticker']} ×{quantity} @ ${price:.2f} "
                f"(${position_value:.0f} position, {pct_risked:.1f}% equity risked)"
            )
    except Exception as exc:
        logger.warning(f"Paper trade error ({alert.get('ticker')}): {exc}")


def _spy_high_risk() -> bool:
    """Return True if SPY's last close is below its 50-day MA."""
    rows = repo.get_candles("SPY", SPY_MA_PERIOD + 5)
    if len(rows) < SPY_MA_PERIOD:
        logger.debug("SPY: not enough candles for MA50 check — assuming safe")
        return False
    closes = [float(r["close"]) for r in rows]
    ma50 = indicators.calculate_ma(closes, SPY_MA_PERIOD)
    if ma50 is None:
        return False
    is_risky = closes[-1] < ma50
    logger.info(f"SPY MA50 check: close={closes[-1]:.2f} ma50={ma50:.2f} high_risk={is_risky}")
    return is_risky


def scan_ticker(
    ticker: str,
    high_risk_market: bool = False,
    settings: dict | None = None,
    spy_closes: list[float] | None = None,
) -> list[dict]:
    """Run the full scan for one ticker. Returns list of alert dicts."""
    settings = settings or {}
    vol_min_ratio   = float(settings.get("volume_min_ratio",   VOLUME_MIN_RATIO))
    min_success     = float(settings.get("min_success_rate",   MIN_SUCCESS_RATE))
    rsi_oversold    = float(settings.get("rsi_oversold_level", 30))

    rows = repo.get_candles(ticker, 400)
    if len(rows) < MIN_CANDLES_RSI:
        logger.info(f"{ticker}: only {len(rows)} candles — skipping")
        return []

    # ── Volume (informational — no longer a hard blocker) ────────────────────
    # Volume is recorded on every alert so the user can judge quality,
    # but low volume alone does not suppress a valid pattern signal.
    volumes = [float(r["volume"]) if r.get("volume") else 0.0 for r in rows]
    vol_ratio = indicators.volume_ratio(volumes)
    if vol_ratio is not None:
        logger.debug(f"{ticker}: volume ratio {vol_ratio:.2f}x avg")

    candles = _to_float_candles(rows)
    closes  = [c["close"] for c in candles]
    price   = closes[-1]

    # ── Always update validated patterns (independent of volume filter) ───────
    try:
        _save_validated_patterns(ticker, candles)
    except Exception as exc:
        logger.warning(f"{ticker}: could not save validated patterns — {exc}")

    # ── ATR — computed once, used per-signal ─────────────────────────────────
    atr = indicators.calculate_atr(candles) or (price * 0.015)  # fallback 1.5%

    # ── MA200 Trend Filter ────────────────────────────────────────────────────
    ma200       = indicators.calculate_ma(closes, 200)
    above_ma200 = ma200 is None or price >= ma200   # None = not enough data → allow
    if ma200 is not None and not above_ma200:
        logger.info(
            f"{ticker}: price ${price:.2f} below MA200 ${ma200:.2f} — BUY signals suppressed"
        )

    # ── Relative Strength vs SPY (5-day) ─────────────────────────────────────
    rs_5d = indicators.calculate_rs_vs_spy(closes, spy_closes) if spy_closes else None

    # ── Earnings Safety Filter ────────────────────────────────────────────────
    earnings_imminent, earnings_date = check_earnings_imminent(ticker)
    if earnings_imminent:
        logger.info(
            f"{ticker}: earnings on {earnings_date} within {TRADING_DAYS_WINDOW} trading days "
            f"— Gold BUY auto-trade suppressed"
        )

    alerts: list[dict] = []

    # ── Type 1A: RSI ──────────────────────────────────────────────────────────
    rsi_val = indicators.calculate_rsi(closes)
    rsi_sig = indicators.rsi_signal(closes)
    # Apply user-configurable RSI threshold
    if rsi_val is not None and rsi_val < rsi_oversold:
        rsi_sig = {"type": "RSI Oversold", "rsi": rsi_val, "zone": "oversold"}
    elif rsi_sig and rsi_sig["zone"] != "oversold":
        rsi_sig = None
    if rsi_sig and rsi_sig["zone"] == "oversold" and above_ma200:
        sl, tp1, tp2, rr = _compute_rr(candles, price, "RSI Oversold", atr)
        alerts.append(_build_alert(
            ticker, rsi_sig["type"], "technical", "technical", price,
            rsi=rsi_sig["rsi"],
            high_risk=high_risk_market,
            vol_ratio=vol_ratio,
            stop_loss=sl, take_profit=tp1, take_profit_2=tp2, rr_ratio=rr,
            rs_vs_spy=rs_5d,
            earnings_imminent=earnings_imminent, earnings_date=earnings_date,
        ))
        logger.info(f"{ticker}: RSI oversold {rsi_sig['rsi']:.1f} | SL={sl} TP1={tp1} TP2={tp2} RR={rr} RS={rs_5d}")

    # ── Type 1B: MA150 ────────────────────────────────────────────────────────
    ma_sig    = indicators.ma150_signal(closes)
    ma150_val = indicators.calculate_ma150(closes)
    if ma_sig:
        sl, tp1, tp2, rr = _compute_rr(candles, price, ma_sig["type"], atr, ma150=ma150_val)
        alerts.append(_build_alert(
            ticker, ma_sig["type"], "technical", "technical", price,
            ma150=ma_sig["ma150"],
            high_risk=high_risk_market,
            vol_ratio=vol_ratio,
            stop_loss=sl, take_profit=tp1, take_profit_2=tp2, rr_ratio=rr,
            rs_vs_spy=rs_5d,
            earnings_imminent=earnings_imminent, earnings_date=earnings_date,
        ))
        logger.info(f"{ticker}: {ma_sig['type']} | SL={sl} TP1={tp1} TP2={tp2} RR={rr} RS={rs_5d}")

    # ── Type 2: Pattern + backtest ────────────────────────────────────────────
    if len(candles) >= 4:
        patterns_today = detector.detect_all(candles[-4:])

        for pattern_name in patterns_today:
            stats = backtester.backtest(candles, pattern_name)

            if stats["occurrences"] < MIN_OCCURRENCES:
                logger.debug(f"{ticker}/{pattern_name}: only {stats['occurrences']} occurrences — skip")
                continue

            if stats["success_rate"] < MIN_SUCCESS_RATE:
                logger.debug(f"{ticker}/{pattern_name}: success rate {stats['success_rate']}% — skip")
                continue

            # MA200 trend filter: suppress BUY patterns when below MA200
            is_bullish = pattern_name in _BULLISH_SIGNAL_PATTERNS
            if is_bullish and not above_ma200:
                logger.debug(f"{ticker}/{pattern_name}: below MA200 — BUY suppressed")
                continue

            if (stats["occurrences"] >= GOLD_OCCURRENCES
                    and stats["success_rate"] >= GOLD_SUCCESS_RATE):
                signal_type = "gold"
            else:
                signal_type = "standard"

            sl, tp1, tp2, rr = _compute_rr(candles, price, pattern_name, atr, ma150=ma150_val)
            alerts.append(_build_alert(
                ticker, pattern_name, signal_type, "pattern", price,
                rsi=rsi_val,
                ma150=ma150_val,
                success_rate=stats["success_rate"],
                occurrences=stats["occurrences"],
                high_risk=high_risk_market,
                vol_ratio=vol_ratio,
                stop_loss=sl, take_profit=tp1, take_profit_2=tp2, rr_ratio=rr,
                rs_vs_spy=rs_5d,
                earnings_imminent=earnings_imminent, earnings_date=earnings_date,
            ))
            logger.info(
                f"{ticker}: {pattern_name} [{signal_type}] "
                f"sr={stats['success_rate']}% n={stats['occurrences']} "
                f"SL={sl} TP1={tp1} TP2={tp2} RR={rr} RS={rs_5d}"
            )

    return alerts


def run_scan(
    on_progress: Callable[[str, int, int], None] | None = None,
    settings: dict | None = None,
) -> dict:
    """
    Run the full watchlist scan.
    Saves each alert to DB immediately after detecting it.
    Returns { ticker: [alert, ...], ... }
    """
    settings = settings or {}
    watchlist = repo.get_watchlist()
    tickers   = [r["ticker"] for r in watchlist]

    if not tickers:
        logger.warning("Watchlist is empty — nothing to scan")
        return {}

    # Reset per-run earnings cache (yfinance results are valid for one scan cycle)
    clear_cache()

    # Check SPY market condition once for the whole run
    high_risk_market = _spy_high_risk()

    # Fetch SPY closes once for RS-vs-SPY calculation (all tickers share the same SPY data)
    spy_rows   = repo.get_candles("SPY", 10)
    spy_closes = [float(r["close"]) for r in spy_rows] if spy_rows else []

    all_results: dict[str, list[dict]] = {}

    for i, ticker in enumerate(tickers):
        if on_progress:
            on_progress(ticker, i + 1, len(tickers))

        try:
            alerts = scan_ticker(
                ticker,
                high_risk_market=high_risk_market,
                settings=settings,
                spy_closes=spy_closes,
            )
            for alert in alerts:
                is_new = repo.save_alert(alert)
                if not is_new:
                    continue  # already alerted today — skip paper buy
                # Auto paper trade on bullish (LONG-only) signals
                # Bearish patterns (Evening Star, Shooting Star, etc.) never trigger a buy
                is_bullish_signal = alert["pattern_name"] in _BULLISH_SIGNAL_PATTERNS
                if is_bullish_signal:
                    _auto_paper_buy(alert)
            all_results[ticker] = alerts
            logger.info(f"{ticker}: {len(alerts)} alert(s) generated")
        except Exception as exc:
            logger.error(f"{ticker}: scan error — {exc}")
            all_results[ticker] = []

    # Auto-resolve pending alerts that are ≥14 days old
    try:
        resolved = repo.resolve_pending_alerts()
        if resolved:
            logger.info(f"Auto-resolved {resolved} pending alert(s)")
    except Exception as exc:
        logger.warning(f"Alert resolution failed: {exc}")

    # Send email after every scan (alert digest or heartbeat if 0 alerts)
    all_new_alerts = [a for alerts in all_results.values() for a in alerts]
    finished_at = datetime.datetime.now().strftime("%H:%M:%S")
    if all_new_alerts:
        logger.info(
            f"Scan finished at {finished_at}. "
            f"{len(all_new_alerts)} alert(s) found. "
            f"Sending digest to {config.ALERT_EMAIL_TO}"
        )
    else:
        logger.info(
            f"Scan finished at {finished_at}. "
            f"0 alerts found across {len(tickers)} tickers. "
            f"Sending empty-result email to {config.ALERT_EMAIL_TO}"
        )
    try:
        send_digest(all_new_alerts, tickers_scanned=len(tickers))
    except Exception as exc:
        logger.warning(f"Email digest error: {exc}")

    return all_results
