"""
Technical indicators: RSI(14) and MA(150).
All functions accept a plain list[float] of closing prices (oldest → newest).
"""


def calculate_rsi(closes: list[float], period: int = 14) -> float | None:
    """
    Wilder's RSI. Returns None if not enough data.
    RSI < 30  → oversold (buy signal)
    RSI > 70  → overbought
    """
    if len(closes) < period + 1:
        return None

    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [d if d > 0 else 0.0 for d in deltas]
    losses = [-d if d < 0 else 0.0 for d in deltas]

    # Seed with simple average over first `period` deltas
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Wilder's smoothing for the rest
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 2)


def calculate_ma(closes: list[float], period: int) -> float | None:
    """Simple moving average over the last `period` closes."""
    if len(closes) < period:
        return None
    return round(sum(closes[-period:]) / period, 4)


def calculate_ma150(closes: list[float]) -> float | None:
    return calculate_ma(closes, 150)


# ── Touch / Cross detection ───────────────────────────────────────────────────

MA_TOUCH_BAND = 0.015   # price within 1.5 % of MA is considered "touching"


def is_ma_touch(price: float, ma: float) -> bool:
    """True when price is within ±1.5 % of the MA."""
    return abs(price - ma) / ma <= MA_TOUCH_BAND


def is_ma_bullish_cross(prev_close: float, curr_close: float,
                        prev_ma: float, curr_ma: float) -> bool:
    """Price crosses from below to above the MA."""
    return prev_close < prev_ma and curr_close >= curr_ma


def is_ma_bearish_cross(prev_close: float, curr_close: float,
                        prev_ma: float, curr_ma: float) -> bool:
    """Price crosses from above to below the MA."""
    return prev_close > prev_ma and curr_close <= curr_ma


def calculate_atr(candles: list[dict], period: int = 14) -> float | None:
    """
    Wilder's Average True Range.
    candles: list of dicts with 'high', 'low', 'close' keys (floats).
    Returns None if not enough data.

    True Range = max(
        high - low,
        |high - prev_close|,
        |low  - prev_close|
    )
    ATR = Wilder's smoothed average of TR over `period` bars.
    """
    if len(candles) < period + 1:
        return None

    trs: list[float] = []
    for i in range(1, len(candles)):
        high       = candles[i]["high"]
        low        = candles[i]["low"]
        prev_close = candles[i - 1]["close"]
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        trs.append(tr)

    # Seed with simple average of first `period` TRs
    atr = sum(trs[:period]) / period
    # Wilder's smoothing for the rest
    for tr in trs[period:]:
        atr = (atr * (period - 1) + tr) / period

    return round(atr, 6)


def volume_ratio(volumes: list[float], lookback: int = 20) -> float | None:
    """
    Return today's volume divided by the lookback-day average volume.
    Returns None if not enough data or today's volume is zero.
    """
    if len(volumes) < lookback + 1 or volumes[-1] == 0:
        return None
    avg = sum(volumes[-(lookback + 1):-1]) / lookback
    return round(volumes[-1] / avg, 2) if avg > 0 else None


def rsi_signal(closes: list[float]) -> dict | None:
    """
    Returns a signal dict if RSI condition is met, else None.
    Requires at least 16 closes (14-period RSI + 1 delta + 1 spare).
    """
    rsi = calculate_rsi(closes)
    if rsi is None:
        return None
    if rsi < 30:
        return {"type": "RSI Oversold", "rsi": rsi, "zone": "oversold"}
    if rsi > 70:
        return {"type": "RSI Overbought", "rsi": rsi, "zone": "overbought"}
    return None


def ma150_signal(closes: list[float]) -> dict | None:
    """
    Returns a signal dict if MA150 condition is met, else None.
    Checks: touch band, bullish cross, bearish cross.
    """
    if len(closes) < 151:
        return None

    ma_now  = calculate_ma150(closes)
    ma_prev = calculate_ma150(closes[:-1])
    price   = closes[-1]
    prev    = closes[-2]

    if ma_now is None or ma_prev is None:
        return None

    if is_ma_bullish_cross(prev, price, ma_prev, ma_now):
        return {"type": "MA150 Bullish Cross", "ma150": ma_now, "price": price}

    if is_ma_bearish_cross(prev, price, ma_prev, ma_now):
        return {"type": "MA150 Bearish Cross", "ma150": ma_now, "price": price}

    if is_ma_touch(price, ma_now):
        side = "above" if price >= ma_now else "below"
        return {"type": f"MA150 Touch ({side})", "ma150": ma_now, "price": price}

    return None


def calculate_rs_vs_spy(
    stock_closes: list[float],
    spy_closes:   list[float],
    period: int = 5,
) -> float | None:
    """
    Relative Strength vs SPY over `period` trading days.

    Returns stock_return - spy_return as a decimal fraction.
    e.g.  0.023  → stock beat SPY by +2.3%
         -0.011  → stock lagged SPY by -1.1%

    Positive = outperforming SPY (a leading indicator of breakout strength).
    """
    if len(stock_closes) < period + 1 or len(spy_closes) < period + 1:
        return None
    stock_ret = stock_closes[-1] / stock_closes[-(period + 1)] - 1
    spy_ret   = spy_closes[-1]   / spy_closes[-(period + 1)]   - 1
    return round(stock_ret - spy_ret, 4)
