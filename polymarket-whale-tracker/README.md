# Polymarket Whale Tracker

Discover, rank, and monitor profitable wallets ("whales") on [Polymarket](https://polymarket.com) using only public data. No API key required.

Polymarket is fully on-chain (Polygon). Every trade is public, so **every trader's entire history and current portfolio is visible**. This tool turns that into an actionable leaderboard and a live alert feed.

## Why this can be an edge

- **Copy-trade** wallets that consistently print money.
- **Fade** wallets that are persistent losers (dumb money).
- Detect **coordinated positioning** across a market.
- Catch **informed flow** seconds after it hits on-chain.

> Pure data/engineering edge. No prediction required.

## What it does

1. **Discover** — scrapes recent trades from Polymarket's Data API and harvests active wallet addresses.
2. **Score** — computes realized + unrealized PnL, ROI, volume, win rate, Sharpe-ish consistency per wallet.
3. **Rank** — filters (min volume, min trades, min age) and builds a leaderboard.
4. **Watch** — polls the top-N wallets and streams their new trades to the console / file / webhook.

## Quickstart

```bash
cd polymarket-whale-tracker
python3 -m venv .venv && source .venv/bin/activate
pip install -e .

# 1. Pull the recent trade tape and cache wallets
whales discover --pages 10

# 2. Score every wallet we saw (cashflow PnL, ROI, volume, markets, etc.)
whales score --min-trades 3 --concurrency 10

# 3. Show the top 20 whales by total PnL
whales rank --by total_pnl --min-volume 5000 --min-trades 20 --top 20 --wide

# 4. Drill into a specific wallet (live re-score)
whales wallet 0xead152b855effa6b5b5837f53b24c0756830c76a

# 5. Backtest: "if I had copy-traded this whale for 60 days with $5k…"
whales backtest 0xead152b855effa6b5b5837f53b24c0756830c76a \
    --days 60 --seed 5000 --copy-ratio 0.005 --slippage-bps 100

# 6. Screen: backtest the top-10 whales in one shot
whales backtest-top --top 10 --days 60 --seed 5000 --copy-ratio 0.005

# 7. Watch the current top-10 live and print new trades as they hit the chain
whales watch --top 10 --interval 30
```

## Data sources

| API | Use |
|---|---|
| `data-api.polymarket.com/trades` | recent trade tape (wallet discovery) |
| `data-api.polymarket.com/positions` | open positions + unrealized PnL |
| `data-api.polymarket.com/closed-positions` | closed positions + realized PnL |
| `data-api.polymarket.com/activity` | per-wallet trade history |
| `data-api.polymarket.com/value` | total portfolio value |
| `gamma-api.polymarket.com/markets` | market metadata |

All endpoints are public; rate limit ~30 req/s on Data API, ~10 req/s on Gamma.

> **Note on `/trades` pagination:** Polymarket caps the offset at ~3000 on the global trade tape (you can't infinitely paginate backwards). To build a deep wallet universe, run `whales discover` periodically (every 5 min) and the local SQLite cache will accumulate wallets over time. Per-wallet `/activity` has a much deeper history, so once a wallet is in the cache you can pull its full trade history.

## Running it on a schedule (macOS / launchd)

One-line install — registers two launchd agents for your user:

```bash
./scripts/install_launchd.sh
```

This sets up:

| Job | Cadence | What it does |
|---|---|---|
| `com.whales.discover` | every 5 min (runs at load) | pulls recent trades, grows the wallet cache |
| `com.whales.score` | every 6 hours | re-scores every wallet with >=3 cached trades |

Check status & logs:

```bash
launchctl list | grep whales
tail -f data/logs/discover.log
tail -f data/logs/score.log
./.venv/bin/whales stats         # snapshot of cache size / freshness
```

After ~24 hours you should have tens of thousands of wallets. After a week, you'll have a meaningful universe to run real walk-forward backtests against.

Uninstall:

```bash
./scripts/uninstall_launchd.sh
```

The local SQLite cache (`data/whales.db`) is not touched by install/uninstall.

> Logs auto-rotate when they hit 10 MB.
> The `score` job caps each run at `WHALES_SCORE_MAX=2000` wallets by default (~15 min of API time at 8-way concurrency). Set the env var higher in `scripts/score_tick.sh` if you want it to chew through more per cycle.

## What the backtester found (honest result)

On a sample of the top-8 wallets by realized PnL, copy-trading them over the
last 60 days with a $5k seed, 0.5% size ratio, and 100 bps slippage produced
returns between **-3% and +0%**. Meaning:

> **Most whales' headline PnL is locked in open positions they already hold.
> By the time they show up on a leaderboard, they've already been right —
> copying them today means buying at the same price they did, with zero edge
> plus your slippage.**

The edge lives in wallets whose returns are *realized and repeatable* (high
closed_positions, many distinct_markets, long active_days, consistent ROI
across time windows). Those are rare and you need a much larger wallet
universe than one discovery snapshot to find them. That's why `discover` is
designed to be run on a schedule — accumulating wallets and re-scoring lets
you filter for long-term track records, not recent luck.

## Honest caveats

- **PnL from Polymarket's /closed-positions endpoint is misleading** — that
  endpoint returns only winning resolved positions, so losses are invisible.
  This tool computes PnL from **cashflow** (BUY vs. SELL/REDEEM/REWARD) for
  accuracy. Losing wallets look negative, as they should.
- **Selection bias** — today's winners may just be lucky. Require long
  `active_days`, many `distinct_markets`, and high `closed_positions` before
  trusting a wallet.
- **Capacity is limited** — if you copy a whale with size, you move the
  price. Works best on liquid markets with slippage budgets.
- **Resolution risk** — some of a whale's unrealized PnL disappears at
  oracle resolution.
- **The backtester is optimistic** — it assumes you fill at the whale's
  observed price + a fixed slippage haircut. Real latency is variable; a
  realistic latency-aware fill model would be the natural next upgrade.

## Project layout

```
src/whale_tracker/
  api.py         # async Polymarket client with rate limiting + retries
  db.py          # SQLite storage (trades, wallets, scores, watcher state)
  config.py      # env-driven settings
  discover.py    # wallet discovery from /trades
  pnl.py         # per-wallet cashflow PnL scoring
  leaderboard.py # ranking + filters + table/JSON output
  backtest.py    # copy-trade replay engine + multi-wallet screener
  watcher.py     # live poll + diff new trades + optional webhook
  cli.py         # typer CLI (init, discover, score, rank, wallet, backtest,
                 #            backtest-top, watch)
```

## License

MIT — this is a research tool. Not financial advice. You will probably lose money.
