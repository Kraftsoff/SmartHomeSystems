"""Control panel: FastAPI JSON API + a mobile-friendly single page."""
from __future__ import annotations

import os
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

_HTML_PATH = os.path.join(os.path.dirname(__file__), "index.html")


def create_app(engine, token: str = "") -> FastAPI:
    app = FastAPI(title="tradebot", docs_url=None, redoc_url=None)

    def auth(request: Request) -> None:
        if not token:
            return
        supplied = (
            request.headers.get("x-token")
            or request.query_params.get("token")
            or request.cookies.get("tb_token")
            or ""
        )
        if not secrets.compare_digest(supplied, token):
            raise HTTPException(status_code=401, detail="bad token")

    @app.get("/", response_class=HTMLResponse)
    def index(request: Request, _=Depends(auth)):
        with open(_HTML_PATH, encoding="utf-8") as fh:
            resp = HTMLResponse(fh.read())
        if token and request.query_params.get("token"):
            resp.set_cookie("tb_token", token, httponly=True, samesite="strict", max_age=30 * 86400)
        return resp

    @app.get("/api/status")
    def status(_=Depends(auth)):
        return engine.status()

    @app.get("/api/trades")
    def trades(limit: int = 100, _=Depends(auth)):
        return [t.to_dict() for t in engine.storage.trades(limit=limit)]

    @app.get("/api/equity")
    def equity(limit: int = 2000, _=Depends(auth)):
        return engine.storage.equity_curve(limit=limit)

    @app.get("/api/events")
    def events(limit: int = 100, _=Depends(auth)):
        return engine.storage.events(limit=limit)

    @app.post("/api/pause")
    def pause(_=Depends(auth)):
        engine.pause()
        return {"ok": True, "paused": True}

    @app.post("/api/resume")
    def resume(_=Depends(auth)):
        engine.resume()
        return {"ok": True, "paused": False}

    @app.post("/api/kill")
    def kill(_=Depends(auth)):
        engine.kill("web panel kill")
        return {"ok": True, "killed": True}

    @app.post("/api/reset-kill")
    def reset_kill(_=Depends(auth)):
        engine.reset_kill()
        return {"ok": True, "killed": False}

    @app.post("/api/close/{symbol:path}")
    def close(symbol: str, _=Depends(auth)):
        ok = engine.close_symbol(symbol.upper())
        if not ok:
            return JSONResponse({"ok": False, "error": "no such position"}, status_code=404)
        return {"ok": True}

    @app.get("/healthz")
    def healthz():
        return {"ok": True, "running": engine.running}

    return app
