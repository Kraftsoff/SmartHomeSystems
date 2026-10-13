import pytest

from tradebot.risk import RiskLimits, RiskManager


def test_fixed_fractional_sizing():
    rm = RiskManager(RiskLimits(risk_per_trade_pct=1.0, max_position_pct=100.0))
    # equity 1000, price 100, stop 98 -> risk 10 -> qty 5
    r = rm.position_size(1000.0, 100.0, 98.0)
    assert r.ok and r.qty == pytest.approx(5.0) and r.risk_amount == pytest.approx(10.0)


def test_max_position_caps_size():
    rm = RiskManager(RiskLimits(risk_per_trade_pct=5.0, max_position_pct=20.0))
    r = rm.position_size(1000.0, 100.0, 99.0)  # unconstrained qty would be 50 (notional 5000)
    assert r.notional == pytest.approx(200.0)


def test_min_notional_bumps_within_tolerance_then_refuses():
    rm = RiskManager(RiskLimits(risk_per_trade_pct=1.0, max_position_pct=50.0, max_risk_mult=3.0))
    # $50 account, 1% risk = $0.5, stop 2% away -> notional 25 >= min 10 : untouched
    r = rm.position_size(50.0, 100.0, 98.0, min_notional=10.0)
    assert r.notional == pytest.approx(25.0)
    # stop 10% away -> notional 5 < min 10 -> bumped to ~10.2, risk 1.02 <= 1.5 ok
    r = rm.position_size(50.0, 100.0, 90.0, min_notional=10.0)
    assert r.ok and r.notional == pytest.approx(10.2)
    # stop 40% away -> bump would risk 4.08 > 1.5 -> refuse
    r = rm.position_size(50.0, 100.0, 60.0, min_notional=10.0)
    assert not r.ok


def test_refuses_without_stop():
    rm = RiskManager(RiskLimits())
    assert not rm.position_size(100.0, 10.0, None).ok


def test_daily_halt_and_kill_switch():
    rm = RiskManager(RiskLimits(max_daily_loss_pct=3.0, max_drawdown_pct=10.0, max_open_positions=1))
    day0 = 1_700_000_000_000
    assert rm.update_equity(100.0, day0) == []
    assert rm.can_open(0) == (True, "")
    assert rm.can_open(1)[0] is False
    ev = rm.update_equity(96.5, day0 + 3_600_000)
    assert rm.daily_halt and any("daily loss" in e for e in ev)
    assert rm.can_open(0)[0] is False
    ev = rm.update_equity(97.0, day0 + 86_400_000)  # next day
    assert not rm.daily_halt and any("new day" in e for e in ev)
    ev = rm.update_equity(89.0, day0 + 90_000_000)
    assert rm.killed and rm.can_open(0)[0] is False
    rm.reset_kill()
    assert not rm.killed
