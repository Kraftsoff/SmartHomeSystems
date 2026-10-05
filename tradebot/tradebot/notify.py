"""Telegram notifications + remote control from your phone.

Create a bot with @BotFather, get your chat id from @userinfobot, set
TB_TELEGRAM_TOKEN and TB_TELEGRAM_CHAT_ID. Only that chat id is obeyed.
"""
from __future__ import annotations

import logging
import threading
import time

import httpx

log = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, token: str, chat_id: str, engine=None) -> None:
        self.token = token
        self.chat_id = str(chat_id)
        self.engine = engine
        self.base = f"https://api.telegram.org/bot{token}"
        self._client = httpx.Client(timeout=35)
        self._offset = 0
        self._stop = threading.Event()

    # --- outbound ---------------------------------------------------------------
    def send(self, text: str) -> None:
        try:
            self._client.post(f"{self.base}/sendMessage", json={"chat_id": self.chat_id, "text": text[:4000]})
        except Exception as exc:  # noqa: BLE001
            log.warning("telegram send failed: %s", exc)

    # --- inbound commands ---------------------------------------------------------
    def start_polling(self) -> threading.Thread:
        t = threading.Thread(target=self._poll_loop, name="telegram", daemon=True)
        t.start()
        return t

    def stop(self) -> None:
        self._stop.set()

    def _poll_loop(self) -> None:
        while not self._stop.is_set():
            try:
                r = self._client.get(f"{self.base}/getUpdates", params={"offset": self._offset, "timeout": 30})
                for upd in r.json().get("result", []):
                    self._offset = upd["update_id"] + 1
                    msg = upd.get("message") or {}
                    if str((msg.get("chat") or {}).get("id")) != self.chat_id:
                        continue
                    text = (msg.get("text") or "").strip()
                    if text.startswith("/"):
                        self.send(self.handle_command(text))
            except Exception as exc:  # noqa: BLE001
                log.warning("telegram poll failed: %s", exc)
                time.sleep(5)

    def handle_command(self, text: str) -> str:
        cmd, *args = text.split()
        cmd = cmd.lower().split("@")[0]
        e = self.engine
        if e is None:
            return "engine not attached"
        if cmd == "/status":
            return format_status(e.status())
        if cmd == "/positions":
            st = e.status()
            if not st["positions"]:
                return "no open positions"
            return "\n".join(
                f"{p['side']} {p['symbol']} qty={p['qty']:.6g} entry={p['entry_price']:.6g} now={p['price']:.6g} "
                f"upnl={p['unrealized']:+.4f} stop={p['stop'] and round(p['stop'], 6)}"
                for p in st["positions"]
            )
        if cmd == "/trades":
            trades = e.storage.trades(limit=10)
            if not trades:
                return "no trades yet"
            return "\n".join(f"{t.symbol} {'L' if t.side == 1 else 'S'} {t.pnl:+.4f} ({t.return_pct:+.2f}%) {t.exit_reason}" for t in trades)
        if cmd == "/pause":
            e.pause()
            return "paused: no new entries"
        if cmd == "/resume":
            e.resume()
            return "resumed"
        if cmd == "/kill":
            e.kill("telegram /kill")
            return "KILLED: all positions closed, trading stopped. /reset to re-arm"
        if cmd == "/reset":
            e.reset_kill()
            return "kill switch reset"
        if cmd == "/close" and args:
            return "closed" if e.close_symbol(args[0].upper()) else "no such position"
        return ("/status /positions /trades /pause /resume /kill /reset /close SYMBOL")


def format_status(st: dict) -> str:
    flags = []
    if st["paused"]:
        flags.append("PAUSED")
    if st["killed"]:
        flags.append(f"KILLED ({st['kill_reason']})")
    if st["daily_halt"]:
        flags.append("DAILY-HALT")
    return (
        f"[{st['mode']}] equity {st['equity']:.4f}  dd {st['drawdown_pct']:.2f}%  today {st['daily_pnl_pct']:+.2f}%\n"
        f"positions: {len(st['positions'])}  {' '.join(flags) or 'ok'}\n"
        f"{st['strategy']['name']} {st['timeframe']} {', '.join(st['symbols'])}"
    )
