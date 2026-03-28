"""
Candlestick pattern detector.

Each public function accepts a list of candle dicts (oldest → newest):
    [{"open": float, "high": float, "low": float, "close": float}, ...]

`detect_all(candles)` returns a list of detected pattern names at the
LAST candle position (i.e. "what pattern completed today?").
"""

from typing import TypedDict


class Candle(TypedDict):
    open:  float
    high:  float
    low:   float
    close: float


# ── Helpers ───────────────────────────────────────────────────────────────────

def _body(c: Candle) -> float:
    return abs(c["close"] - c["open"])

def _upper_wick(c: Candle) -> float:
    return c["high"] - max(c["open"], c["close"])

def _lower_wick(c: Candle) -> float:
    return min(c["open"], c["close"]) - c["low"]

def _total_range(c: Candle) -> float:
    return c["high"] - c["low"]

def _is_bull(c: Candle) -> bool:
    return c["close"] > c["open"]

def _is_bear(c: Candle) -> bool:
    return c["close"] < c["open"]


# ── Pattern detectors (each returns True / False) ─────────────────────────────

def is_doji(c: Candle) -> bool:
    r = _total_range(c)
    return r > 0 and _body(c) <= r * 0.05

def is_dragonfly_doji(c: Candle) -> bool:
    r = _total_range(c)
    return (r > 0 and _body(c) <= r * 0.05
            and _lower_wick(c) >= r * 0.60
            and _upper_wick(c) <= r * 0.05)

def is_gravestone_doji(c: Candle) -> bool:
    r = _total_range(c)
    return (r > 0 and _body(c) <= r * 0.05
            and _upper_wick(c) >= r * 0.60
            and _lower_wick(c) <= r * 0.05)

def is_hammer(c: Candle) -> bool:
    b = _body(c)
    return (b > 0
            and _lower_wick(c) >= b * 2.0
            and _upper_wick(c) <= b * 0.3)

def is_inverted_hammer(c: Candle) -> bool:
    b = _body(c)
    return (b > 0
            and _upper_wick(c) >= b * 2.0
            and _lower_wick(c) <= b * 0.3)

def is_pin_bar_bull(c: Candle) -> bool:
    b = _body(c)
    return (b > 0
            and _lower_wick(c) >= b * 3.0
            and _upper_wick(c) <= b * 0.5)

def is_pin_bar_bear(c: Candle) -> bool:
    b = _body(c)
    return (b > 0
            and _upper_wick(c) >= b * 3.0
            and _lower_wick(c) <= b * 0.5)

def is_marubozu_bull(c: Candle) -> bool:
    b = _body(c)
    return (_is_bull(c) and b > 0
            and _upper_wick(c) <= b * 0.02
            and _lower_wick(c) <= b * 0.02)

def is_marubozu_bear(c: Candle) -> bool:
    b = _body(c)
    return (_is_bear(c) and b > 0
            and _upper_wick(c) <= b * 0.02
            and _lower_wick(c) <= b * 0.02)

# ── 2-candle patterns ─────────────────────────────────────────────────────────

def is_bullish_engulfing(prev: Candle, curr: Candle) -> bool:
    return (_is_bear(prev) and _is_bull(curr)
            and curr["open"] <= prev["close"]
            and curr["close"] >= prev["open"])

def is_bearish_engulfing(prev: Candle, curr: Candle) -> bool:
    return (_is_bull(prev) and _is_bear(curr)
            and curr["open"] >= prev["close"]
            and curr["close"] <= prev["open"])

def is_piercing_line(prev: Candle, curr: Candle) -> bool:
    return (_is_bear(prev) and _is_bull(curr)
            and curr["open"] < prev["low"]
            and curr["close"] > prev["open"] + _body(prev) * 0.5)

def is_dark_cloud_cover(prev: Candle, curr: Candle) -> bool:
    return (_is_bull(prev) and _is_bear(curr)
            and curr["open"] > prev["high"]
            and curr["close"] < prev["open"] - _body(prev) * 0.5)

def is_bullish_harami(prev: Candle, curr: Candle) -> bool:
    return (_is_bear(prev) and _is_bull(curr)
            and curr["open"] > prev["close"]
            and curr["close"] < prev["open"]
            and _body(curr) < _body(prev) * 0.5)

def is_bearish_harami(prev: Candle, curr: Candle) -> bool:
    return (_is_bull(prev) and _is_bear(curr)
            and curr["open"] < prev["close"]
            and curr["close"] > prev["open"]
            and _body(curr) < _body(prev) * 0.5)

# ── 3-candle patterns ─────────────────────────────────────────────────────────

def is_morning_star(a: Candle, b: Candle, c: Candle) -> bool:
    return (_is_bear(a)
            and _body(b) <= _body(a) * 0.3
            and _is_bull(c)
            and c["close"] > a["open"] - _body(a) * 0.5)

def is_evening_star(a: Candle, b: Candle, c: Candle) -> bool:
    return (_is_bull(a)
            and _body(b) <= _body(a) * 0.3
            and _is_bear(c)
            and c["close"] < a["open"] + _body(a) * 0.5)

def is_three_white_soldiers(a: Candle, b: Candle, c: Candle) -> bool:
    return (all(_is_bull(x) for x in [a, b, c])
            and b["open"] > a["open"] and b["open"] < a["close"]
            and c["open"] > b["open"] and c["open"] < b["close"]
            and c["close"] > b["close"] > a["close"])

def is_three_black_crows(a: Candle, b: Candle, c: Candle) -> bool:
    return (all(_is_bear(x) for x in [a, b, c])
            and b["open"] < a["open"] and b["open"] > a["close"]
            and c["open"] < b["open"] and c["open"] > b["close"]
            and c["close"] < b["close"] < a["close"])

# ── 4-candle custom patterns ──────────────────────────────────────────────────

def is_three_red_doji(a: Candle, b: Candle, c: Candle, d: Candle) -> bool:
    """3 consecutive bearish candles followed by a Doji."""
    return (all(_is_bear(x) for x in [a, b, c]) and is_doji(d))


# ── Master detector ───────────────────────────────────────────────────────────

def detect_all(candles: list[Candle]) -> list[str]:
    """
    Run every pattern detector against the last candle position.
    Returns list of pattern name strings that match.
    Expects `candles` to have at least 4 entries for full coverage.
    """
    found: list[str] = []
    n = len(candles)
    if n < 1:
        return found

    c0 = candles[-1]
    c1 = candles[-2] if n >= 2 else None
    c2 = candles[-3] if n >= 3 else None
    c3 = candles[-4] if n >= 4 else None

    # Single-candle
    if is_doji(c0):            found.append("Doji")
    if is_dragonfly_doji(c0):  found.append("Dragonfly Doji")
    if is_gravestone_doji(c0): found.append("Gravestone Doji")
    if is_hammer(c0):          found.append("Hammer")
    if is_inverted_hammer(c0): found.append("Inverted Hammer")
    if is_pin_bar_bull(c0):    found.append("Pin Bar (Bull)")
    if is_pin_bar_bear(c0):    found.append("Pin Bar (Bear)")
    if is_marubozu_bull(c0):   found.append("Marubozu (Bull)")
    if is_marubozu_bear(c0):   found.append("Marubozu (Bear)")

    # Context-dependent single-candle (need previous candle direction)
    if c1:
        if _is_bull(c1) and is_hammer(c0):          found.append("Hanging Man")
        if _is_bull(c1) and is_inverted_hammer(c0): found.append("Shooting Star")

    # Two-candle
    if c1:
        if is_bullish_engulfing(c1, c0):  found.append("Bullish Engulfing")
        if is_bearish_engulfing(c1, c0):  found.append("Bearish Engulfing")
        if is_piercing_line(c1, c0):      found.append("Piercing Line")
        if is_dark_cloud_cover(c1, c0):   found.append("Dark Cloud Cover")
        if is_bullish_harami(c1, c0):     found.append("Bullish Harami")
        if is_bearish_harami(c1, c0):     found.append("Bearish Harami")

    # Three-candle
    if c1 and c2:
        if is_morning_star(c2, c1, c0):          found.append("Morning Star")
        if is_evening_star(c2, c1, c0):          found.append("Evening Star")
        if is_three_white_soldiers(c2, c1, c0):  found.append("Three White Soldiers")
        if is_three_black_crows(c2, c1, c0):     found.append("Three Black Crows")

    # Four-candle
    if c1 and c2 and c3:
        if is_three_red_doji(c3, c2, c1, c0):    found.append("3 Red + Doji")

    return found


# ── Pattern-specific detection for backtester ─────────────────────────────────

_PATTERN_FN: dict = {
    "Doji":                 lambda w: len(w) >= 1 and is_doji(w[-1]),
    "Dragonfly Doji":       lambda w: len(w) >= 1 and is_dragonfly_doji(w[-1]),
    "Gravestone Doji":      lambda w: len(w) >= 1 and is_gravestone_doji(w[-1]),
    "Hammer":               lambda w: len(w) >= 1 and is_hammer(w[-1]),
    "Inverted Hammer":      lambda w: len(w) >= 1 and is_inverted_hammer(w[-1]),
    "Pin Bar (Bull)":       lambda w: len(w) >= 1 and is_pin_bar_bull(w[-1]),
    "Pin Bar (Bear)":       lambda w: len(w) >= 1 and is_pin_bar_bear(w[-1]),
    "Marubozu (Bull)":      lambda w: len(w) >= 1 and is_marubozu_bull(w[-1]),
    "Marubozu (Bear)":      lambda w: len(w) >= 1 and is_marubozu_bear(w[-1]),
    "Hanging Man":          lambda w: len(w) >= 2 and _is_bull(w[-2]) and is_hammer(w[-1]),
    "Shooting Star":        lambda w: len(w) >= 2 and _is_bull(w[-2]) and is_inverted_hammer(w[-1]),
    "Bullish Engulfing":    lambda w: len(w) >= 2 and is_bullish_engulfing(w[-2], w[-1]),
    "Bearish Engulfing":    lambda w: len(w) >= 2 and is_bearish_engulfing(w[-2], w[-1]),
    "Piercing Line":        lambda w: len(w) >= 2 and is_piercing_line(w[-2], w[-1]),
    "Dark Cloud Cover":     lambda w: len(w) >= 2 and is_dark_cloud_cover(w[-2], w[-1]),
    "Bullish Harami":       lambda w: len(w) >= 2 and is_bullish_harami(w[-2], w[-1]),
    "Bearish Harami":       lambda w: len(w) >= 2 and is_bearish_harami(w[-2], w[-1]),
    "Morning Star":         lambda w: len(w) >= 3 and is_morning_star(w[-3], w[-2], w[-1]),
    "Evening Star":         lambda w: len(w) >= 3 and is_evening_star(w[-3], w[-2], w[-1]),
    "Three White Soldiers": lambda w: len(w) >= 3 and is_three_white_soldiers(w[-3], w[-2], w[-1]),
    "Three Black Crows":    lambda w: len(w) >= 3 and is_three_black_crows(w[-3], w[-2], w[-1]),
    "3 Red + Doji":         lambda w: len(w) >= 4 and is_three_red_doji(w[-4], w[-3], w[-2], w[-1]),
}


def pattern_matches_at(pattern_name: str, candles: list[Candle]) -> bool:
    """Returns True if pattern_name fires on the last candle of `candles`."""
    fn = _PATTERN_FN.get(pattern_name)
    return fn(candles) if fn else False
