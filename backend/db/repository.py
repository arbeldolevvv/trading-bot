"""
Database repository — Python backend uses psycopg2 directly.
Prisma ORM (Next.js) handles the same DB for watchlist reads.
"""
import psycopg
from psycopg.rows import dict_row
import config


def get_connection():
    return psycopg.connect(config.DATABASE_URL, row_factory=dict_row)


# ── Watchlist ─────────────────────────────────────────────────────────────────

def get_watchlist() -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ticker, name FROM watchlist ORDER BY added_at DESC")
            return [dict(r) for r in cur.fetchall()]


# ── Candles ───────────────────────────────────────────────────────────────────

def upsert_candle(ticker: str, date: str, open: float, high: float,
                  low: float, close: float, volume: int | None = None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO candles (ticker, date, open, high, low, close, volume)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (ticker, date) DO UPDATE SET
                    open   = EXCLUDED.open,
                    high   = EXCLUDED.high,
                    low    = EXCLUDED.low,
                    close  = EXCLUDED.close,
                    volume = EXCLUDED.volume
                """,
                (ticker, date, open, high, low, close, volume),
            )
        conn.commit()


def get_candles(ticker: str, days: int = 400) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT date, open, high, low, close, volume
                FROM (
                    SELECT date, open, high, low, close, volume
                    FROM candles
                    WHERE ticker = %s
                    ORDER BY date DESC
                    LIMIT %s
                ) sub
                ORDER BY date ASC
                """,
                (ticker, days),
            )
            return [dict(r) for r in cur.fetchall()]


# ── Validated Patterns ────────────────────────────────────────────────────────

def upsert_validated_pattern(ticker: str, pattern_name: str, occurrences: int,
                              successes: int, success_rate: float, avg_gain: float,
                              signal_type: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO validated_patterns
                    (ticker, pattern_name, total_appearances, total_successes_10pct,
                     success_rate_10pct, avg_gain, signal_type, is_validated, last_updated)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, NOW())
                ON CONFLICT (ticker, pattern_name) DO UPDATE SET
                    total_appearances   = EXCLUDED.total_appearances,
                    total_successes_10pct = EXCLUDED.total_successes_10pct,
                    success_rate_10pct  = EXCLUDED.success_rate_10pct,
                    avg_gain            = EXCLUDED.avg_gain,
                    signal_type         = EXCLUDED.signal_type,
                    is_validated        = TRUE,
                    last_updated        = NOW()
                """,
                (ticker, pattern_name, occurrences, successes,
                 success_rate, avg_gain, signal_type),
            )
        conn.commit()


def get_validated_patterns(ticker: str | None = None) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            if ticker:
                cur.execute(
                    """
                    SELECT * FROM validated_patterns
                    WHERE ticker = %s AND is_validated = TRUE
                    ORDER BY success_rate_10pct DESC, total_appearances DESC
                    """,
                    (ticker,),
                )
            else:
                cur.execute(
                    """
                    SELECT * FROM validated_patterns
                    WHERE is_validated = TRUE
                    ORDER BY success_rate_10pct DESC, total_appearances DESC
                    LIMIT 200
                    """
                )
            rows = cur.fetchall()
            import math
            result = []
            for r in rows:
                d = dict(r)
                for k in ("success_rate_10pct", "avg_gain"):
                    if d.get(k) is not None:
                        d[k] = float(d[k])
                if d.get("last_updated"):
                    d["last_updated"] = d["last_updated"].isoformat()
                # Compute strength score
                sr  = d.get("success_rate_10pct") or 0
                occ = d.get("total_appearances") or 0
                ag  = d.get("avg_gain") or 0
                d["strength_score"] = round(sr * math.log(max(occ, 1)) * ag / 100, 2) if sr and occ and ag else 0.0
                result.append(d)
            return result


# ── Alerts ────────────────────────────────────────────────────────────────────

def save_alert(alert: dict) -> bool:
    """
    Insert a new alert row. Ignores duplicate (ticker + pattern + same day).
    Returns True if newly inserted, False if already existed today.
    alert dict keys: ticker, pattern_name, signal_type, category,
                     price_at_alert, rsi_value, ma150_value,
                     success_rate, occurrences,
                     high_risk, volume_ratio,
                     stop_loss, take_profit, take_profit_2, rr_ratio, rs_vs_spy,
                     earnings_date, earnings_imminent
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Deduplication: skip if same ticker+pattern already saved today
            cur.execute(
                """SELECT 1 FROM alerts
                   WHERE ticker = %s AND pattern_name = %s
                   AND detected_at >= CURRENT_DATE
                   AND detected_at < CURRENT_DATE + INTERVAL '1 day'
                   LIMIT 1""",
                (alert["ticker"], alert["pattern_name"]),
            )
            if cur.fetchone():
                return False  # already saved today

            cur.execute(
                """
                INSERT INTO alerts
                    (ticker, pattern_name, signal_type, category,
                     price_at_alert, rsi_value, ma150_value,
                     success_rate, occurrences, outcome,
                     high_risk, volume_ratio,
                     stop_loss, take_profit, take_profit_2, rr_ratio, rs_vs_spy,
                     earnings_date, earnings_imminent)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending',
                        %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    alert["ticker"],
                    alert["pattern_name"],
                    alert["signal_type"],
                    alert.get("category", "pattern"),
                    alert.get("price_at_alert"),
                    alert.get("rsi_value"),
                    alert.get("ma150_value"),
                    alert.get("success_rate"),
                    alert.get("occurrences"),
                    alert.get("high_risk", False),
                    alert.get("volume_ratio"),
                    alert.get("stop_loss"),
                    alert.get("take_profit"),
                    alert.get("take_profit_2"),
                    alert.get("rr_ratio"),
                    alert.get("rs_vs_spy"),
                    alert.get("earnings_date"),
                    alert.get("earnings_imminent", False),
                ),
            )
        conn.commit()
    return True


def resolve_pending_alerts() -> int:
    """
    For every 'pending' alert where detected_at is ≥14 calendar days ago,
    look at the next 14 daily candles and mark outcome = 'success' or 'fail'.
    Returns the number of alerts resolved.
    """
    resolved = 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, ticker, price_at_alert, detected_at
                FROM alerts
                WHERE outcome = 'pending'
                  AND detected_at <= NOW() - INTERVAL '14 days'
                """
            )
            pending = cur.fetchall()

        for row in pending:
            alert_id    = row["id"]
            ticker      = row["ticker"]
            price_alert = float(row["price_at_alert"]) if row["price_at_alert"] else None
            alert_date  = row["detected_at"].date() if hasattr(row["detected_at"], "date") else None

            if price_alert is None or alert_date is None:
                continue

            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT close FROM candles
                    WHERE ticker = %s AND date > %s
                    ORDER BY date ASC
                    LIMIT 14
                    """,
                    (ticker, alert_date),
                )
                forward = [float(r["close"]) for r in cur.fetchall()]

            if not forward:
                continue

            max_gain_pct = (max(forward) - price_alert) / price_alert * 100
            actual_gain  = (forward[-1] - price_alert) / price_alert * 100
            outcome      = "success" if max_gain_pct >= 3.0 else "fail"

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE alerts
                    SET outcome = %s, actual_gain = %s, resolved_at = NOW()
                    WHERE id = %s
                    """,
                    (outcome, round(actual_gain, 2), alert_id),
                )
            conn.commit()
            resolved += 1

            # Auto-close paper position if one is open for this ticker
            sell_price = forward[-1]
            execute_paper_sell(
                ticker,
                price=sell_price,
                notes=f"Alert resolved: {outcome} ({round(actual_gain, 2):+.2f}%)",
            )

    return resolved


# ── Paper Trading ─────────────────────────────────────────────────────────────

def get_paper_cash() -> float:
    """Return current cash balance, initialising the portfolio row if needed."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT cash_balance FROM paper_portfolio WHERE id = 1")
            row = cur.fetchone()
            if row:
                return float(row["cash_balance"])
            # First run — seed the portfolio
            cur.execute(
                "INSERT INTO paper_portfolio (id, cash_balance) VALUES (1, 10000)"
            )
        conn.commit()
    return 10000.0


def get_paper_positions() -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM paper_positions ORDER BY opened_at DESC"
            )
            rows = cur.fetchall()
            result = []
            for r in rows:
                d = dict(r)
                for k in ("quantity", "avg_price", "stop_loss", "take_profit",
                          "highest_price", "trailing_stop_pct"):
                    if d.get(k) is not None:
                        d[k] = float(d[k])
                result.append(d)
            return result


def execute_paper_buy(
    ticker: str,
    quantity: float,
    price: float,
    stop_loss: float | None = None,
    take_profit: float | None = None,
    alert_id: int | None = None,
    sector: str | None = None,
) -> bool:
    """
    Open a new paper position. Returns True on success, False if insufficient cash.
    If a position already exists for the ticker, averages down.
    highest_price is initialised to entry price for trailing stop tracking.
    """
    total_cost = round(quantity * price, 4)
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Ensure portfolio row exists
            cur.execute(
                "INSERT INTO paper_portfolio (id, cash_balance) VALUES (1, 10000) ON CONFLICT DO NOTHING"
            )
            cur.execute("SELECT cash_balance FROM paper_portfolio WHERE id = 1")
            cash = float(cur.fetchone()["cash_balance"])

            if total_cost > cash:
                return False

            # Upsert position (average down if already open)
            cur.execute(
                """
                INSERT INTO paper_positions
                    (ticker, quantity, avg_price, stop_loss, take_profit,
                     highest_price, sector, opened_at, alert_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), %s)
                ON CONFLICT (ticker) DO UPDATE SET
                    quantity  = paper_positions.quantity + EXCLUDED.quantity,
                    avg_price = (
                        (paper_positions.avg_price * paper_positions.quantity)
                        + (EXCLUDED.avg_price * EXCLUDED.quantity)
                    ) / (paper_positions.quantity + EXCLUDED.quantity),
                    stop_loss     = COALESCE(EXCLUDED.stop_loss, paper_positions.stop_loss),
                    take_profit   = COALESCE(EXCLUDED.take_profit, paper_positions.take_profit),
                    highest_price = GREATEST(COALESCE(paper_positions.highest_price, 0), EXCLUDED.highest_price),
                    sector        = COALESCE(EXCLUDED.sector, paper_positions.sector)
                """,
                (ticker, quantity, price, stop_loss, take_profit,
                 price,   # highest_price = entry price on first buy
                 sector, alert_id),
            )

            # Deduct cash
            cur.execute(
                "UPDATE paper_portfolio SET cash_balance = cash_balance - %s WHERE id = 1",
                (total_cost,),
            )

            # Log trade
            cur.execute(
                """
                INSERT INTO paper_trades
                    (ticker, action, quantity, price_per_share, total_cost,
                     stop_loss, take_profit, alert_id, notes)
                VALUES (%s, 'buy', %s, %s, %s, %s, %s, %s, %s)
                """,
                (ticker, quantity, price, total_cost, stop_loss, take_profit,
                 alert_id, f"Auto-buy @ ${price:.2f}"),
            )
        conn.commit()
    return True


def execute_paper_sell(ticker: str, price: float, notes: str = "") -> dict | None:
    """
    Close an open paper position. Returns the trade record or None if no position."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM paper_positions WHERE ticker = %s", (ticker,)
            )
            pos = cur.fetchone()
            if not pos:
                return None

            qty      = float(pos["quantity"])
            proceeds = round(qty * price, 4)
            gain_pct = round((price / float(pos["avg_price"]) - 1) * 100, 2)

            # Return proceeds to cash
            cur.execute(
                "UPDATE paper_portfolio SET cash_balance = cash_balance + %s WHERE id = 1",
                (proceeds,),
            )

            # Remove position
            cur.execute(
                "DELETE FROM paper_positions WHERE ticker = %s", (ticker,)
            )

            # Log trade (store gain_pct as dedicated field for win-rate analytics)
            cur.execute(
                """
                INSERT INTO paper_trades
                    (ticker, action, quantity, price_per_share, total_cost, notes, gain_pct)
                VALUES (%s, 'sell', %s, %s, %s, %s, %s)
                RETURNING id, executed_at
                """,
                (ticker, qty, price, proceeds,
                 notes or f"Auto-sell @ ${price:.2f} ({gain_pct:+.2f}%)",
                 gain_pct),
            )
            trade = dict(cur.fetchone())
        conn.commit()
    return trade


def update_trailing_stop(ticker: str, new_stop: float, highest_price: float) -> None:
    """Ratchet up the stop-loss and record the new highest_price for a position."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE paper_positions
                SET stop_loss = %s, highest_price = %s
                WHERE ticker = %s
                """,
                (new_stop, highest_price, ticker),
            )
        conn.commit()


def get_paper_trades(limit: int = 100) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM paper_trades ORDER BY executed_at DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
            result = []
            for r in rows:
                d = dict(r)
                for k in ("quantity", "price_per_share", "total_cost",
                          "stop_loss", "take_profit", "gain_pct"):
                    if d.get(k) is not None:
                        d[k] = float(d[k])
                if d.get("executed_at"):
                    d["executed_at"] = d["executed_at"].isoformat()
                result.append(d)
            return result


def get_alert_by_id(alert_id: int) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, ticker, pattern_name, signal_type, category,
                          price_at_alert, success_rate, occurrences,
                          stop_loss, take_profit, take_profit_2, rr_ratio,
                          rs_vs_spy, earnings_imminent, detected_at
                   FROM alerts WHERE id = %s""",
                (alert_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            d = dict(row)
            for k in ("price_at_alert", "success_rate", "stop_loss",
                      "take_profit", "take_profit_2", "rr_ratio", "rs_vs_spy"):
                if d.get(k) is not None:
                    d[k] = float(d[k])
            if d.get("detected_at"):
                d["detected_at"] = d["detected_at"].isoformat()
            return d


def get_alerts(outcome: str | None = "pending", limit: int = 100) -> list[dict]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            if outcome:
                cur.execute(
                    """
                    SELECT * FROM alerts
                    WHERE outcome = %s
                    ORDER BY detected_at DESC
                    LIMIT %s
                    """,
                    (outcome, limit),
                )
            else:
                cur.execute(
                    "SELECT * FROM alerts ORDER BY detected_at DESC LIMIT %s",
                    (limit,),
                )
            rows = cur.fetchall()
            # Convert Decimal → float and date → str for JSON serialisation
            result = []
            for r in rows:
                d = dict(r)
                for k in ("price_at_alert", "rsi_value", "ma150_value",
                          "success_rate", "actual_gain",
                          "volume_ratio", "stop_loss", "take_profit", "take_profit_2",
                          "rr_ratio", "rs_vs_spy"):
                    if d.get(k) is not None:
                        d[k] = float(d[k])
                if d.get("detected_at"):
                    d["detected_at"] = d["detected_at"].isoformat()
                if d.get("resolved_at"):
                    d["resolved_at"] = d["resolved_at"].isoformat()
                if d.get("earnings_date"):
                    d["earnings_date"] = str(d["earnings_date"])
                # earnings_imminent is bool — no conversion needed
                result.append(d)
            return result
