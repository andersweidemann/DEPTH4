import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
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
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bollinger_series = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self._bb_width_series[-1])
        bb_width_percentile = rf.get("params").get("percentile")
        if bb_width_val < np.percentile(self._bb_width_series, bb_width_percentile):
            return True
        return False

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        er = self.spec.get("entry_rule")
        if not er:
            return
        rsi_val = float(self._rsi_series[-1])
        rsi_thresholds = er.get("params").get("rsi_thresholds")
        if rsi_val < rsi_thresholds[0] or rsi_val > rsi_thresholds[1]:
            bollinger_val = self._bollinger_series[-1]
            close_val = self.data.Close[-1]
            if (rsi_val < rsi_thresholds[0] and close_val < bollinger_val[0]) or (rsi_val > rsi_thresholds[1] and close_val > bollinger_val[1]):
                self.sl_price = close_val - (1.5 * float(self._atr_series[-1])) if close_val > bollinger_val[1] else close_val + (1.5 * float(self._atr_series[-1]))
                self.tp_price = bollinger_val[0] if close_val < bollinger_val[0] else bollinger_val[1]
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr_series[-1], self.equity)
                self.position.enter(lots)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params").get("time_stop")
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        atr_now = float(self._atr_series[-1])
        price = float(self.data.Close[-1])
        if trade.is_long and trade.pl_pct > 0:
            new_sl = price - (1.5 * atr_now)
            if trade.sl is None or new_sl > trade.sl:
                trade.sl = new_sl
        elif not trade.is_long and trade.pl_pct > 0:
            new_sl = price + (1.5 * atr_now)
            if trade.sl is None or new_sl < trade.sl:
                trade.sl = new_sl