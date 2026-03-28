"""
Earnings & Sector helpers — powered by yfinance (free, no API key needed).

check_earnings_imminent(ticker)
    Returns (imminent: bool, next_date: date | None).
    Imminent = earnings within the next TRADING_DAYS_WINDOW trading days.
    Results are cached per scan run; call clear_cache() at the start of run_scan().

get_sector(ticker)
    Returns the sector string (e.g. 'Technology') or None on failure.
    Used at paper-buy time to enforce ≤30% sector exposure.
"""

import datetime
import logging

import yfinance as yf

logger = logging.getLogger(__name__)

TRADING_DAYS_WINDOW = 3   # calendar trading days that count as "imminent"

# Per-run cache: reset by clear_cache() at the top of run_scan()
_cache: dict[str, tuple[bool, datetime.date | None]] = {}


def _count_trading_days(start: datetime.date, end: datetime.date) -> int:
    """Return the number of weekday (Mon–Fri) days between start and end, inclusive."""
    count = 0
    d = start
    while d <= end:
        if d.weekday() < 5:  # 0=Mon … 4=Fri
            count += 1
        d += datetime.timedelta(days=1)
    return count


def check_earnings_imminent(ticker: str) -> tuple[bool, datetime.date | None]:
    """
    Return (imminent, next_earnings_date).

    imminent = True  →  earnings fall within the next TRADING_DAYS_WINDOW trading days.
    Result is cached; call clear_cache() once per scan run.
    On any yfinance error the function returns (False, None) — safe default.
    """
    if ticker in _cache:
        return _cache[ticker]

    try:
        cal = yf.Ticker(ticker).calendar
        # calendar is a dict: {'Earnings Date': [Timestamp, ...], ...}
        dates_raw = cal.get("Earnings Date") if isinstance(cal, dict) else None
        if not dates_raw:
            _cache[ticker] = (False, None)
            return (False, None)

        today = datetime.date.today()
        future_dates = []
        for d in dates_raw:
            as_date = d.date() if hasattr(d, "date") else d
            if as_date >= today:
                future_dates.append(as_date)

        if not future_dates:
            _cache[ticker] = (False, None)
            return (False, None)

        next_date = min(future_dates)
        imminent   = _count_trading_days(today, next_date) <= TRADING_DAYS_WINDOW
        result     = (imminent, next_date)
        _cache[ticker] = result
        logger.debug(f"{ticker}: next earnings {next_date}, imminent={imminent}")
        return result

    except Exception as exc:
        logger.debug(f"Earnings check failed for {ticker}: {exc}")
        _cache[ticker] = (False, None)
        return (False, None)


def get_sector(ticker: str) -> str | None:
    """
    Return the sector string from yfinance (e.g. 'Technology', 'Healthcare').
    Falls back to 'industry' if 'sector' is missing.
    Returns None on any error so callers can skip the sector check gracefully.
    """
    try:
        info = yf.Ticker(ticker).info
        return info.get("sector") or info.get("industry") or None
    except Exception as exc:
        logger.debug(f"Sector lookup failed for {ticker}: {exc}")
        return None


def clear_cache() -> None:
    """Reset the per-run earnings cache. Call at the start of each run_scan()."""
    _cache.clear()
