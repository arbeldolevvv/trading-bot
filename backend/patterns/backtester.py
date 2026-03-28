"""
Historical backtester.

For a given pattern and a full list of daily candles, scans every position
in the history (leaving 14 bars at the end for forward-return measurement)
and computes:
  - occurrences  : how many times the pattern fired
  - successes    : how many times max gain in next 14 days >= 3 %
  - success_rate : successes / occurrences * 100
  - avg_gain     : average max-gain across ALL occurrences (win or lose)
"""

import logging
from patterns.detector import pattern_matches_at

logger = logging.getLogger(__name__)

FORWARD_DAYS   = 14    # look-ahead window
SUCCESS_GAIN   = 3.0   # % gain required to count as "success"
MIN_WINDOW     = 4     # max candles needed by any pattern


def backtest(candles: list[dict], pattern_name: str) -> dict:
    """
    candles: list of dicts with at least 'close' key (and open/high/low).
             Ordered oldest → newest.
    Returns: { occurrences, successes, success_rate, avg_gain }
    """
    n = len(candles)
    if n < MIN_WINDOW + FORWARD_DAYS + 1:
        return {"occurrences": 0, "successes": 0, "success_rate": 0.0, "avg_gain": 0.0}

    occurrences = 0
    successes   = 0
    gains: list[float] = []

    # Stop at n - FORWARD_DAYS so we always have 14 future bars
    for i in range(MIN_WINDOW - 1, n - FORWARD_DAYS):
        window = candles[max(0, i - MIN_WINDOW + 1): i + 1]

        if pattern_matches_at(pattern_name, window):
            occurrences += 1
            entry = float(candles[i]["close"])
            if entry == 0:
                continue
            future_closes = [float(candles[i + k]["close"]) for k in range(1, FORWARD_DAYS + 1)]
            max_gain = max((p - entry) / entry * 100.0 for p in future_closes)
            gains.append(max_gain)
            if max_gain >= SUCCESS_GAIN:
                successes += 1

    success_rate = round(successes / occurrences * 100, 1) if occurrences else 0.0
    avg_gain     = round(sum(gains) / len(gains), 2)       if gains       else 0.0

    return {
        "occurrences":  occurrences,
        "successes":    successes,
        "success_rate": success_rate,
        "avg_gain":     avg_gain,
    }
