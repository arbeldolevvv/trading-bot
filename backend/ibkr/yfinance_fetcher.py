"""
yfinance-based candle fetcher — used automatically when IBKR TWS is unavailable.
Fetches 1 year of daily OHLCV for every watchlist ticker and upserts into DB.
No rate-limit delays needed (yfinance is a free public API).
"""
import logging
from typing import Callable

import yfinance as yf

from db import repository as repo

logger = logging.getLogger(__name__)


def fetch_ticker_yf(ticker: str) -> int:
    """Fetch 1 year of daily candles for one ticker via yfinance. Returns candles stored."""
    hist = yf.Ticker(ticker).history(period="1y", interval="1d", auto_adjust=True)
    if hist.empty:
        logger.warning(f"{ticker}: yfinance returned no data")
        return 0
    for date, row in hist.iterrows():
        repo.upsert_candle(
            ticker=ticker,
            date=str(date.date()),
            open=float(row["Open"]),
            high=float(row["High"]),
            low=float(row["Low"]),
            close=float(row["Close"]),
            volume=int(row["Volume"]) if row.get("Volume") else None,
        )
    logger.info(f"{ticker}: stored {len(hist)} candles via yfinance")
    return len(hist)


def fetch_all_yf(
    on_progress: Callable[[str, int, int], None] | None = None,
) -> dict:
    """
    Fetch candles for every ticker in the watchlist via yfinance.
    Returns { ticker: {"status": "ok"|"error", "candles": N, "error": "..."} }
    """
    watchlist = repo.get_watchlist()
    tickers = [r["ticker"] for r in watchlist]
    results: dict = {}

    if not tickers:
        logger.warning("Watchlist empty — nothing to fetch")
        return results

    logger.info(f"yfinance fetch starting: {len(tickers)} tickers")

    for i, ticker in enumerate(tickers):
        if on_progress:
            on_progress(ticker, i + 1, len(tickers))
        try:
            count = fetch_ticker_yf(ticker)
            results[ticker] = {"status": "ok", "candles": count}
        except Exception as exc:
            logger.error(f"{ticker} yfinance error: {exc}")
            results[ticker] = {"status": "error", "error": str(exc)}

    logger.info(f"yfinance fetch complete: {sum(1 for r in results.values() if r['status'] == 'ok')} ok, "
                f"{sum(1 for r in results.values() if r['status'] == 'error')} errors")
    return results
