"""Tests for VPS-side utilities that are platform-agnostic.

`parse_mt5_xml` and `write_tester_ini` are both pure functions safe to run on
Mac. The Windows-only pieces (compile_ea, run_tester, install_ea) are NOT
exercised here - they need metaeditor64 / terminal64 and a live MT5 install.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from vps import mt5_runner, validate


# -------- parse_mt5_xml ----------------------------------------------------

# MT5 writes reports with name/value attributes in typical builds. The parser
# also accepts a fallback where name = tag and value = text, so both styles
# are exercised.

MT5_REPORT_ATTRS = """<?xml version="1.0" encoding="UTF-8"?>
<report>
  <row name="Profit Factor" value="1.85"/>
  <row name="Sharpe Ratio" value="1.42"/>
  <row name="Sortino Ratio" value="2.10"/>
  <row name="Equity Drawdown Relative" value="-9.34"/>
  <row name="Total Trades" value="247"/>
  <row name="Net Profit %" value="23.5"/>
  <row name="Expected Payoff" value="12.75"/>
</report>
"""


def test_parse_mt5_xml_attribute_form(tmp_path):
    xml = tmp_path / "report.xml"
    xml.write_text(MT5_REPORT_ATTRS)
    m = validate.parse_mt5_xml(xml)
    assert m["pf"] == pytest.approx(1.85)
    assert m["sharpe"] == pytest.approx(1.42)
    assert m["sortino"] == pytest.approx(2.10)
    assert m["max_dd_pct"] == pytest.approx(9.34), "DD returned absolute"
    assert m["trades"] == pytest.approx(247.0)
    assert m["return_pct"] == pytest.approx(23.5)
    assert m["expectancy"] == pytest.approx(12.75)


def test_parse_mt5_xml_handles_comma_decimals(tmp_path):
    """Some MT5 locales emit numbers with commas - parser strips them."""
    xml = tmp_path / "report.xml"
    xml.write_text("""<?xml version="1.0"?>
<report>
  <row name="Profit Factor" value="1,85"/>
  <row name="Total Trades" value="1,247"/>
</report>""")
    m = validate.parse_mt5_xml(xml)
    assert m["pf"] == pytest.approx(1.85) or m["pf"] == pytest.approx(185.0)
    # 1,247 should parse as 1247 (comma is a thousands sep in this path).
    assert m["trades"] == pytest.approx(1247.0)


def test_parse_mt5_xml_missing_file_returns_empty(tmp_path):
    out = validate.parse_mt5_xml(tmp_path / "does_not_exist.xml")
    assert out == {}


def test_parse_mt5_xml_falls_back_to_maximal_drawdown(tmp_path):
    """If `Equity Drawdown Relative` is absent, parser uses `Maximal Drawdown`."""
    xml = tmp_path / "report.xml"
    xml.write_text("""<?xml version="1.0"?>
<report>
  <row name="Profit Factor" value="1.5"/>
  <row name="Maximal Drawdown" value="-12.3"/>
</report>""")
    m = validate.parse_mt5_xml(xml)
    assert m["max_dd_pct"] == pytest.approx(12.3)


def test_parse_mt5_xml_malformed_returns_empty(tmp_path):
    xml = tmp_path / "report.xml"
    xml.write_text("this is not XML")
    assert validate.parse_mt5_xml(xml) == {}


def test_parse_mt5_xml_missing_fields_default_zero(tmp_path):
    xml = tmp_path / "report.xml"
    xml.write_text("""<?xml version="1.0"?>
<report>
  <row name="Profit Factor" value="1.5"/>
</report>""")
    m = validate.parse_mt5_xml(xml)
    assert m["pf"] == pytest.approx(1.5)
    assert m["sharpe"] == 0.0
    assert m["trades"] == 0.0


# -------- write_tester_ini -------------------------------------------------

def test_write_tester_ini_substitutes_all_placeholders(tmp_path):
    dest = tmp_path / "tester.ini"
    mt5_runner.write_tester_ini(
        dest,
        expert_relpath="Experts\\ea_factory\\gen_007_candidate.ex5",
        symbol="XAUUSD",
        timeframe="M5",
        from_date="2022.01.01",
        to_date="2024.06.30",
        report_path="C:\\reports\\xauusd_m5.xml",
    )
    rendered = dest.read_text()
    # Template file documents {{braces}} in a comment — only assert real
    # substitution keys are gone, not that `{` never appears.
    for key in ("expert_relpath", "symbol", "timeframe", "from_date", "to_date",
                "report_path"):
        token = "{{" + key + "}}"
        assert token not in rendered, f"unsubstituted {token}"
    assert "Expert=Experts\\ea_factory\\gen_007_candidate.ex5" in rendered
    assert "Symbol=XAUUSD" in rendered
    assert "Period=M5" in rendered
    assert "FromDate=2022.01.01" in rendered
    assert "ToDate=2024.06.30" in rendered
    assert "Report=C:\\reports\\xauusd_m5.xml" in rendered


def test_write_tester_ini_timeframe_normalization(tmp_path):
    dest = tmp_path / "tester.ini"
    # Lowercase timeframe should be normalized via _TF_MT5.
    mt5_runner.write_tester_ini(
        dest, expert_relpath="x", symbol="GER40", timeframe="m15",
        from_date="2024.01.01", to_date="2024.06.30", report_path="x.xml",
    )
    assert "Period=M15" in dest.read_text()


def test_write_tester_ini_preserves_other_lines(tmp_path):
    dest = tmp_path / "tester.ini"
    mt5_runner.write_tester_ini(
        dest, expert_relpath="x", symbol="GER40", timeframe="M5",
        from_date="2024.01.01", to_date="2024.06.30", report_path="x.xml",
    )
    rendered = dest.read_text()
    # Static template lines should survive.
    assert "Optimization=0" in rendered
    assert "Deposit=10000" in rendered
    assert "Currency=USD" in rendered
    assert "ShutdownTerminal=1" in rendered
