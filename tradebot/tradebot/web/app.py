"""Control panel: FastAPI JSON API + a mobile-friendly single page with tabs."""
from __future__ import annotations

import os
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

_HTML_PATH = os.path.join(os.path.dirname(__file__), "index.html")


def create_app(engine=None, token: str = "", supervisor=None, intel=None) -> FastAPI:
    """Single-engine mode (engine=...) or multi-book mode (supervisor=...)."""
    app = FastAPI(title="tradebot", docs_url=None, redoc_url=None)

    def auth(request: Request) -> None:
        if not token:
            return
        supplied = (request.headers.get("x-token") or request.query_params.get("token")
                    or request.cookies.get("tb_token") or "")
        if not secrets.compare_digest(supplied, token):
            raise HTTPException(status_code=401, detail="bad token")

    def get_engine(book: str | None = None):
        if supervisor is not None:
            if book is None:
                engines = list(supervisor.engines.values())
                if not engines:
                    raise HTTPException(status_code=404, detail="no running books")
                return engines[0]
            e = supervisor.engine(book)
            if e is None:
                raise HTTPException(status_code=404, detail=f"book {book} is not running")
            return e
        if engine is None:
            raise HTTPException(status_code=404, detail="no engine")
        return engine

    @app.get("/", response_class=HTMLResponse)
    def index(request: Request, _=Depends(auth)):
        with open(_HTML_PATH, encoding="utf-8") as fh:
            resp = HTMLResponse(fh.read())
        if token and request.query_params.get("token"):
            resp.set_cookie("tb_token", token, httponly=True, samesite="strict", max_age=30 * 86400)
        return resp

    @app.get("/healthz")
    def healthz():
        running = any(e.running for e in supervisor.engines.values()) if supervisor else bool(engine and engine.running)
        return {"ok": True, "running": running}

    # --- overview ---------------------------------------------------------------------
    @app.get("/api/books")
    def books(_=Depends(auth)):
        if supervisor is None:
            return {"books": [{"name": "default", "title": "default", "enabled": True, "status": get_engine().status()}],
                    "total_equity": get_engine().equity}
        return supervisor.status()

    # --- per book (book=None -> first / single engine, keeps the v0.1 API working) ------
    def register(prefix: str, book_param: bool):
        def _e(book: str | None = None):
            return get_engine(book)

        @app.get(prefix + "/status")
        def status(book: str | None = None, _=Depends(auth)):
            return _e(book).status()

        @app.get(prefix + "/trades")
        def trades(book: str | None = None, limit: int = 100, _=Depends(auth)):
            return [t.to_dict() for t in _e(book).storage.trades(limit=limit)]

        @app.get(prefix + "/equity")
        def equity(book: str | None = None, limit: int = 2000, _=Depends(auth)):
            return _e(book).storage.equity_curve(limit=limit)

        @app.get(prefix + "/events")
        def events(book: str | None = None, limit: int = 100, _=Depends(auth)):
            return _e(book).storage.events(limit=limit)

        @app.post(prefix + "/pause")
        def pause(book: str | None = None, _=Depends(auth)):
            _e(book).pause()
            return {"ok": True, "paused": True}

        @app.post(prefix + "/resume")
        def resume(book: str | None = None, _=Depends(auth)):
            _e(book).resume()
            return {"ok": True, "paused": False}

        @app.post(prefix + "/kill")
        def kill(book: str | None = None, _=Depends(auth)):
            _e(book).kill("web panel kill")
            return {"ok": True, "killed": True}

        @app.post(prefix + "/reset-kill")
        def reset_kill(book: str | None = None, _=Depends(auth)):
            _e(book).reset_kill()
            return {"ok": True, "killed": False}

        @app.post(prefix + "/close/{symbol:path}")
        def close(symbol: str, book: str | None = None, _=Depends(auth)):
            if not _e(book).close_symbol(symbol.upper()):
                return JSONResponse({"ok": False, "error": "no such position"}, status_code=404)
            return {"ok": True}

    register("/api", book_param=False)
    register("/api/books/{book}", book_param=True)

    # --- intel ----------------------------------------------------------------------------
    @app.get("/api/intel/status")
    def intel_status(_=Depends(auth)):
        return intel.status() if intel else {"mode": "off"}

    @app.get("/api/intel/events")
    def intel_events(limit: int = 100, _=Depends(auth)):
        return intel.storage.intel_events(limit=limit) if intel else []

    @app.get("/api/intel/proposals")
    def intel_proposals(status: str | None = None, limit: int = 100, _=Depends(auth)):
        return intel.storage.proposals(status=status, limit=limit) if intel else []

    @app.post("/api/intel/proposals/{pid}/approve")
    def intel_approve(pid: int, _=Depends(auth)):
        if intel is None:
            raise HTTPException(status_code=404, detail="intel off")
        ok, why = intel.execute(pid)
        return JSONResponse({"ok": ok, "detail": why}, status_code=200 if ok else 409)

    @app.post("/api/intel/proposals/{pid}/reject")
    def intel_reject(pid: int, _=Depends(auth)):
        if intel is None:
            raise HTTPException(status_code=404, detail="intel off")
        return {"ok": intel.reject(pid)}

    @app.post("/api/intel/run")
    def intel_run(_=Depends(auth)):
        if intel is None:
            raise HTTPException(status_code=404, detail="intel off")
        try:
            return intel.run_once()
        except Exception as exc:  # noqa: BLE001
            return JSONResponse({"ok": False, "error": f"{type(exc).__name__}: {exc}"}, status_code=500)

    @app.post("/api/intel/ingest")
    async def intel_ingest(request: Request, _=Depends(auth)):
        """Push events from any external tool: JSON list or {items: [...]}; optional ?source=name."""
        if intel is None:
            raise HTTPException(status_code=404, detail="intel off")
        payload = await request.json()
        fields = payload.pop("fields", None) if isinstance(payload, dict) else None
        n = intel.ingest(payload, source=request.query_params.get("source", "webhook"), fields=fields)
        return {"ok": True, "new_events": n}

    return app
