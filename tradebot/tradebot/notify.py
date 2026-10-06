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

HELP = ("/status  /positions  /trades [book]\n"
        "/pause [book]  /resume [book]  /kill [book]  /reset [book]  /close BOOK SYMBOL\n"
        "/ideas  /approve ID  /reject ID  /scan")


class TelegramNotifier:
    def __init__(self, token: str, chat_id: str, engine=None, supervisor=None, intel=None) -> None:
        self.token = token
        self.chat_id = str(chat_id)
        self.engine = engine
        self.supervisor = supervisor
        self.intel = intel
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

    # --- routing ----------------------------------------------------------------------
    def _engines(self, book: str | None) -> list[tuple[str, object]]:
        if self.supervisor is not None:
            pairs = [(b.name, e) for b, e in self.supervisor.engines.items()]
            if book:
                pairs = [(n, e) for n, e in pairs if n == book.lower()]
            return pairs
        return [("default", self.engine)] if self.engine is not None else []

    def handle_command(self, text: str) -> str:
        cmd, *args = text.split()
        cmd = cmd.lower().split("@")[0]
        if cmd == "/status":
            pairs = self._engines(None)
            if not pairs:
                return "engine not attached"
            out = [f"{name}: {format_status(e.status())}" for name, e in pairs]
            if self.intel is not None:
                st = self.intel.status()
                out.append(f"intel: mode={st['mode']} pending={st['pending']}")
            return "\n\n".join(out)
        if cmd == "/positions":
            lines = []
            for name, e in self._engines(None):
                for p in e.status()["positions"]:
                    lines.append(f"[{name}] {p['side']} {p['symbol']} qty={p['qty']:.6g} entry={p['entry_price']:.6g} "
                                 f"now={p['price']:.6g} upnl={p['unrealized']:+.4f} stop={p['stop'] and round(p['stop'], 6)}")
            return "\n".join(lines) or "no open positions"
        if cmd == "/trades":
            lines = []
            for name, e in self._engines(args[0] if args else None):
                for t in e.storage.trades(limit=10):
                    lines.append(f"[{name}] {t.symbol} {'L' if t.side == 1 else 'S'} {t.pnl:+.4f} ({t.return_pct:+.2f}%) {t.exit_reason}")
            return "\n".join(lines) or "no trades yet"
        if cmd in ("/pause", "/resume", "/kill", "/reset"):
            pairs = self._engines(args[0] if args else None)
            if not pairs:
                return "no such book / engine not attached"
            for _, e in pairs:
                {"/pause": e.pause, "/resume": e.resume, "/reset": e.reset_kill,
                 "/kill": lambda e=e: e.kill("telegram /kill")}[cmd]()
            names = f" ({', '.join(n for n, _ in pairs)})" if self.supervisor is not None else ""
            return {"/pause": f"paused{names}: no new entries", "/resume": f"resumed{names}",
                    "/kill": f"KILLED{names}: all positions closed, trading stopped. /reset to re-arm",
                    "/reset": f"kill switch reset{names}"}[cmd]
        if cmd == "/close" and args:
            if self.supervisor is not None and len(args) >= 2:
                e = self.supervisor.engine(args[0].lower())
                return "closed" if e and e.close_symbol(args[1].upper()) else "no such position"
            if self.engine is not None:
                return "closed" if self.engine.close_symbol(args[0].upper()) else "no such position"
            return "usage: /close BOOK SYMBOL"
        if cmd == "/ideas":
            if self.intel is None:
                return "intel module is off"
            rows = self.intel.storage.proposals(status="pending", limit=10)
            return "\n".join(f"#{p['id']} [{p['book']}] {p['direction'].upper()} {p['symbol']} conf={p['confidence']:.2f}: {p['rationale'][:100]}"
                             for p in rows) or "no pending ideas"
        if cmd == "/approve" and args and self.intel is not None:
            ok, why = self.intel.execute(int(args[0]))
            return f"approved #{args[0]}: {why}" if ok else f"cannot execute #{args[0]}: {why}"
        if cmd == "/reject" and args and self.intel is not None:
            return f"rejected #{args[0]}" if self.intel.reject(int(args[0])) else "no such pending idea"
        if cmd == "/scan" and self.intel is not None:
            r = self.intel.run_once()
            return f"scan done: {r}"
        return HELP


def format_status(st: dict) -> str:
    flags = []
    if st["paused"]:
        flags.append("PAUSED")
    if st["killed"]:
        flags.append(f"KILLED ({st['kill_reason']})")
    if st["daily_halt"]:
        flags.append("DAILY-HALT")
    if not st.get("market_open", True):
        flags.append("MARKET-CLOSED")
    return (
        f"[{st['mode']}] equity {st['equity']:.4f}  dd {st['drawdown_pct']:.2f}%  today {st['daily_pnl_pct']:+.2f}%\n"
        f"positions: {len(st['positions'])}  {' '.join(flags) or 'ok'}\n"
        f"{st['strategy']['name']} {st['timeframe']} {', '.join(st['symbols'])}"
    )
