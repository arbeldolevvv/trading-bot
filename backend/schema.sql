-- PatternScanner database schema
-- Run this once on a fresh PostgreSQL database

CREATE TABLE IF NOT EXISTS watchlist (
    ticker   VARCHAR(10) PRIMARY KEY,
    name     VARCHAR(100),
    added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candles (
    ticker  VARCHAR(10)    NOT NULL,
    date    DATE           NOT NULL,
    open    DECIMAL(12,4)  NOT NULL,
    high    DECIMAL(12,4)  NOT NULL,
    low     DECIMAL(12,4)  NOT NULL,
    close   DECIMAL(12,4)  NOT NULL,
    volume  BIGINT,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS validated_patterns (
    id           SERIAL PRIMARY KEY,
    ticker       VARCHAR(10)   NOT NULL,
    pattern_name VARCHAR(100)  NOT NULL,
    occurrences  INTEGER       NOT NULL DEFAULT 0,
    successes    INTEGER       NOT NULL DEFAULT 0,
    success_rate DECIMAL(5,2)  NOT NULL DEFAULT 0,
    avg_gain     DECIMAL(8,4)  NOT NULL DEFAULT 0,
    signal_type  VARCHAR(10)   NOT NULL DEFAULT 'standard',
    last_updated TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (ticker, pattern_name)
);

CREATE TABLE IF NOT EXISTS alerts (
    id                SERIAL PRIMARY KEY,
    ticker            VARCHAR(10)   NOT NULL,
    pattern_name      VARCHAR(100)  NOT NULL,
    signal_type       VARCHAR(10)   NOT NULL DEFAULT 'standard',
    category          VARCHAR(20)   NOT NULL DEFAULT 'pattern',
    detected_at       TIMESTAMPTZ   DEFAULT NOW(),
    price_at_alert    DECIMAL(12,4),
    rsi_value         DECIMAL(8,4),
    ma150_value       DECIMAL(12,4),
    success_rate      DECIMAL(5,2),
    occurrences       INTEGER,
    outcome           VARCHAR(10)   NOT NULL DEFAULT 'pending',
    actual_gain       DECIMAL(8,4),
    resolved_at       TIMESTAMPTZ,
    high_risk         BOOLEAN       DEFAULT FALSE,
    volume_ratio      DECIMAL(6,2),
    stop_loss         DECIMAL(12,4),
    take_profit       DECIMAL(12,4),
    take_profit_2     DECIMAL(12,4),
    rr_ratio          DECIMAL(6,2),
    rs_vs_spy         DECIMAL(8,4),
    earnings_date     DATE,
    earnings_imminent BOOLEAN       DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS paper_portfolio (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    cash_balance  DECIMAL(12,4) NOT NULL DEFAULT 10000
);

INSERT INTO paper_portfolio (id, cash_balance)
VALUES (1, 10000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS paper_positions (
    id               SERIAL PRIMARY KEY,
    ticker           VARCHAR(10)   NOT NULL UNIQUE,
    quantity         DECIMAL(10,4) NOT NULL,
    avg_price        DECIMAL(12,4) NOT NULL,
    stop_loss        DECIMAL(12,4),
    take_profit      DECIMAL(12,4),
    highest_price    DECIMAL(12,4),
    trailing_stop_pct DECIMAL(5,2) NOT NULL DEFAULT 5,
    sector           VARCHAR(50),
    opened_at        TIMESTAMPTZ   DEFAULT NOW(),
    alert_id         INTEGER
);

CREATE TABLE IF NOT EXISTS paper_trades (
    id             SERIAL PRIMARY KEY,
    ticker         VARCHAR(10)   NOT NULL,
    action         VARCHAR(4)    NOT NULL,
    quantity       DECIMAL(10,4) NOT NULL,
    price_per_share DECIMAL(12,4) NOT NULL,
    total_cost     DECIMAL(12,4) NOT NULL,
    stop_loss      DECIMAL(12,4),
    take_profit    DECIMAL(12,4),
    alert_id       INTEGER,
    executed_at    TIMESTAMPTZ   DEFAULT NOW(),
    notes          TEXT,
    gain_pct       DECIMAL(8,4)
);
