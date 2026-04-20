# polybot

A safety-first Polymarket CLOB trading bot. Runs locally on your machine.
**Dry-run by default.** Hard risk caps enforced before every order.
Your private key never leaves this directory.

> ⚠️ This is a research tool. Prediction markets are high-risk, illiquid,
> and have resolution uncertainty. Expect to lose money, especially while
> developing a strategy. Start with a tiny test amount (≤ $10).

---

## Safety model — read this first

1. **`LIVE_TRADING=false` by default.** The bot logs every decision it
   *would* make but never sends an order. You only flip to `true` in
   `.env` when you're ready.
2. **Your `PRIVATE_KEY` lives in a local `.env` file**, gitignored,
   loaded only into this Python process. Do not paste it into any chat.
   Set `chmod 600 .env`.
3. **Hard caps** enforced in code, every tick, before every order:
   - `MAX_NOTIONAL_PER_ORDER` (default $2)
   - `MAX_NOTIONAL_PER_MARKET` (default $5)
   - `MAX_TOTAL_EXPOSURE` (default $25)
   - `MAX_ORDERS_PER_DAY` (default 20)
   - `MAX_DAILY_LOSS` (default $5 — bot halts for the day if breached)
   - `MIN_EDGE` (default 2c — skip signals with less than this edge)
4. **Kill switch.** `touch data/KILL` from any terminal — the bot halts
   within one tick. `polybot unkill` (or `rm data/KILL`) clears it.
5. **Journal.** Every decision, order, and fill is written to
   `data/journal.db`. Nothing is hidden.

---

## Install

```bash
cd polybot
python3 -m venv .venv && source .venv/bin/activate
pip install -U pip
pip install -e .
```

> **Python 3.14 note:** `py-clob-client` depends on `eth-account`, which
> may not have prebuilt wheels for 3.14 yet. If install fails, use
> Python 3.11 or 3.12:
> `python3.12 -m venv .venv && source .venv/bin/activate`.

Copy the environment template:

```bash
cp .env.example .env
chmod 600 .env
```

Then edit `.env` and fill in (at minimum) `PRIVATE_KEY` when you're
ready to go live. **Leave `LIVE_TRADING=false` until you've finished
dry-run testing.**

---

## Dry-run workflow (do this first)

The bot works fully without a private key in dry-run mode — all it does
is read public market data and log hypothetical decisions.

```bash
# See which markets the bot would consider
polybot markets

# Inspect one market's order book
polybot book <token_id>

# Run the loop in dry-run mode — Ctrl-C to stop
polybot run

# See today's decision count / PnL
polybot status
```

Watch the log. You should see either `no signals this tick` or
`[DRY-RUN] would BUY …` entries. Open `data/journal.db` in any SQLite
viewer to audit the decisions table.

---

## Going live (only after dry-run looks sane)

### 1. Fund your Polymarket account

The CLOB is on **Polygon** (chain id 137). You need:

- A small amount of **MATIC/POL** for gas (a couple of cents goes a long way).
- **USDC.e on Polygon** to trade with.

If you already use the Polymarket web app, you have a funded proxy
wallet. On the Polymarket UI, find your deposit address ("Funder"), and
your **private key for the signing EOA** (if you used Magic Link /
email signup, use the "Export private key" option in the web app).

### 2. Pick the right signature type

| How you signed up                         | `SIGNATURE_TYPE` | `FUNDER`                   |
|-------------------------------------------|------------------|----------------------------|
| Standalone EOA (you generated the key)    | `0`              | *(leave blank)*            |
| Polymarket email / magic-link             | `1`              | your Polymarket deposit addr |
| Browser proxy wallet (MetaMask-style)     | `2`              | your Polymarket deposit addr |

### 3. Configure `.env`

```env
PRIVATE_KEY=<hex, with or without 0x>
SIGNATURE_TYPE=1
FUNDER=0xYourPolymarketDepositAddress
LIVE_TRADING=false        # keep false for one more dry run
MAX_NOTIONAL_PER_ORDER=2
MAX_TOTAL_EXPOSURE=25
MAX_DAILY_LOSS=5
```

Run once more in dry-run and confirm it still behaves.

### 4. Flip the switch

Set `LIVE_TRADING=true` in `.env`. Run:

```bash
polybot run
```

You'll see a `LIVE` banner with the caps printed back at you. Orders
will now hit the CLOB.

### Emergency stop

From any terminal:

```bash
polybot kill          # halts the loop
polybot cancel-all    # cancels every open order
```

---

## CLI

```
polybot run           Start the loop (dry-run unless LIVE_TRADING=true)
polybot markets       List top active markets
polybot book <tid>    Show order book for an outcome token
polybot status        Show today's counts and caps
polybot cancel-all    Cancel every open order (live only)
polybot kill          Engage the kill switch file
polybot unkill        Clear the kill switch file
```

---

## Layout

```
src/polybot/
  config.py         pydantic settings from .env
  journal.py        SQLite audit log
  risk.py           hard caps + kill switch
  data.py           Gamma + CLOB read APIs
  client.py         py-clob-client wrapper (order placement)
  strategies/
    base.py
    mispricing.py   placeholder example strategy
  runner.py         main loop
  cli.py            typer CLI
scripts/
  run_bot.py        `python scripts/run_bot.py`
  list_markets.py
tests/
  test_risk.py
```

---

## The strategy that ships

`MispricingStrategy` is deliberately simple and conservative. It looks
for YES books with a wide spread (≥ 3¢) and posts a resting BUY one
tick above the best bid if it's at least `MIN_EDGE` below the midpoint.
**It is not tested alpha.** It exists so you can verify the full
pipeline end-to-end before writing a real strategy.

To add your own: subclass `polybot.strategies.base.Strategy`, implement
`generate_signals`, and register it in `polybot/strategies/__init__.py`.

---

## Things this bot deliberately does NOT do

- It does not hold your keys anywhere except your local `.env`.
- It does not send data anywhere other than Polymarket's public APIs.
- It does not transfer funds off Polymarket — only places/cancels orders.
- It does not bypass or raise the risk caps at runtime; change them in `.env` and restart.

## License

MIT. Not financial advice.
