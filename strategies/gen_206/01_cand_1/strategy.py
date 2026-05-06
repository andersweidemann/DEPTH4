import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.atr = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self.upper_bb, self.lower_bb = self.I(bollinger, self.data, 20)
        self.asia_range_high = self.I(donchian, self.data, 48, "high")
        self.asia_range_low = self.I(donchian, self.data, 48, "low")

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_val = float(self.atr[-1])
        atr_percentile = rf["params"]["percentile"]
        return atr_val > np.percentile(self.atr, atr_percentile)

    def _filters_ok(self) -> bool:
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec["entry_rules"]
        if self.position:
            return
        if entry_rules["long"]["condition"]:
            self.sl_price = self.data.Low[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data._pip
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data._pip
            lots = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk"], self.equity, self.data, self.sl_price)
            self.position.enter_long(lots)
        elif entry_rules["short"]["condition"]:
            self.sl_price = self.data.High[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data._pip
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data._pip
            lots = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk"], self.equity, self.data, self.sl_price)
            self.position.enter_short(lots)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("hours")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60 // self.data._period:
                    self.position.close()
                    return