"""
Fetches 1 year of daily OHLCV candles from IBKR for every stock in the
watchlist, then stores them in PostgreSQL via the repository.

Rate limit: IBKR allows ~6 historical-data requests per minute.
We wait RATE_LIMIT_DELAY seconds between each ticker to stay safe.
"""
import asyncio
import logging
from typing import Callable

from ib_insync import IB, Stock

from db import repository as repo

logger = logging.getLogger(__name__)

RATE_LIMIT_DELAY = 11   # seconds between requests  (~5.5 req/min, safely under 6)


async def fetch_ticker(ib: IB, ticker: str) -> int:
    """
    Fetch 1 year of daily candles for one ticker and upsert into DB.
    Returns the number of candles stored.
    Raises on connection/data errors so the caller can record status.
    """
    contract = Stock(ticker, "SMART", "USD")
    qualified = await ib.qualifyContractsAsync(contract)
    if not qualified:
        raise ValueError(f"Could not qualify contract for {ticker}")

    bars = await ib.reqHistoricalDataAsync(
        qualified[0],
        endDateTime="",          # up to now
        durationStr="1 Y",
        barSizeSetting="1 day",
        whatToShow="TRADES",
        useRTH=True,
        formatDate=1,
    )

    if not bars:
        logger.warning(f"{ticker}: no bars returned (market closed / pacing?)")
        return 0

    for bar in bars:
        repo.upsert_candle(
            ticker=ticker,
            date=str(bar.date),
            open=float(bar.open),
            high=float(bar.high),
            low=float(bar.low),
            close=float(bar.close),
            volume=int(bar.volume),
        )

    logger.info(f"{ticker}: stored {len(bars)} candles")
    return len(bars)


async def fetch_all(
    ib: IB,
    on_progress: Callable[[str, int, int], None] | None = None,
) -> dict:
    """
    Fetch candles for every ticker in the watchlist.
    Calls on_progress(ticker, current_index, total) before each request.
    Returns a dict: { ticker: {"status": "ok"|"error", "candles": N, "error": "..."} }
    """
    watchlist = repo.get_watchlist()
    tickers = [row["ticker"] for row in watchlist]
    results: dict = {}

    if not tickers:
        logger.warning("Watchlist is empty — nothing to fetch")
        return results

    logger.info(f"Fetching candles for {len(tickers)} tickers: {tickers}")

    for i, ticker in enumerate(tickers):
        if on_progress:
            on_progress(ticker, i + 1, len(tickers))

        try:
            count = await fetch_ticker(ib, ticker)
            results[ticker] = {"status": "ok", "candles": count}
        except Exception as exc:
            logger.error(f"{ticker}: {exc}")
            results[ticker] = {"status": "error", "error": str(exc)}

        # Respect IBKR rate limits between requests
        if i < len(tickers) - 1:
            logger.info(f"Rate-limit pause {RATE_LIMIT_DELAY}s before next ticker...")
            await asyncio.sleep(RATE_LIMIT_DELAY)

    return results
