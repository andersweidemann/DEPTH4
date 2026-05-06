"""Campaign overlay merge + factory matrix helpers."""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from agents import backtester, config


def test_deep_merge_lists_replaced():
    base = {"a": 1, "t": [1, 2], "n": {"x": 1}}
    over = {"t": [9], "n": {"y": 2}}
    m = config.deep_merge(base, over)
    assert m["a"] == 1
    assert m["t"] == [9]
    assert m["n"]["x"] == 1
    assert m["n"]["y"] == 2


def test_load_with_overlay_campaign_fields():
    repo = config.repo_root()
    overlay_path = repo / "config" / "campaigns" / "ger40_m15.discovery.yaml"
    assert overlay_path.is_file()

    try:
        config.set_overlay(str(overlay_path.relative_to(repo)))
        cfg = config.load()
        assert cfg["timeframes"] == ["M15"]
        assert cfg["factory_backtest_symbols"] == ["GER40"]
        assert cfg["acceptance"]["pf_min"] < 1.5
        assert "campaign" in cfg
        assert "GER40" in cfg["campaign"]["architect_brief"]
    finally:
        config.set_overlay(None)
        config.clear_load_cache()


def test_matrix_kwargs_only_when_locked():
    try:
        config.set_overlay("config/campaigns/ger40_m15.discovery.yaml")
        cfg = config.load()
        kw = backtester.matrix_kwargs_from_factory_config(cfg)
        assert kw["symbols"] == ["GER40"]
        assert kw["timeframes"] == ["M15"]
    finally:
        config.set_overlay(None)
        config.clear_load_cache()

    cfg2 = config.load()
    assert backtester.matrix_kwargs_from_factory_config(cfg2) == {}


def test_param_sweep_recipe_yaml_parse():
    p = config.repo_root() / "config" / "campaigns" / "examples" / "param_sweep_recipe.yaml"
    data = yaml.safe_load(p.read_text(encoding="utf-8"))
    assert data["trials"] == 60
    assert len(data["mutations"]) >= 1
