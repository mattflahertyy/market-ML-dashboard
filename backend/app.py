# backend/app.py
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import yfinance as yf
import pandas as pd
import datetime as dt
import pytz

app = FastAPI()

# ---------------- Connection Manager ---------------- #
class ConnectionManager:
    def __init__(self):
        self.connections = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, message: str):
        for ws in list(self.connections):
            try:
                await ws.send_text(message)
            except:
                self.disconnect(ws)

manager = ConnectionManager()

# Store ticks for the current session
tick_history: list[dict] = []

@app.get("/")
async def root():
    return {"status": "Backend running"}

# ---------------- Replay Market Ticks ---------------- #
# ---------------- Replay Market Ticks (last 5 days) ---------------- #
async def replay_ticks(symbol="NVDA", interval="1m"):
    eastern = pytz.timezone("US/Eastern")
    utc = pytz.UTC
    today = dt.date.today()

    # Helper to find the previous N trading days including today
    def get_last_n_trading_days(n: int):
        days = []
        d = today
        while len(days) < n:
            if d.weekday() < 5:  # Mon-Fri
                days.append(d)
            d -= dt.timedelta(days=1)
        return sorted(days)

    last_5_days = get_last_n_trading_days(5)

    tick_history.clear()
    for trading_day in last_5_days:
        market_open_local = eastern.localize(dt.datetime.combine(trading_day, dt.time(9, 30)))
        market_close_local = eastern.localize(dt.datetime.combine(trading_day, dt.time(16, 0)))
        market_open_utc = market_open_local.astimezone(utc)
        market_close_utc = market_close_local.astimezone(utc)

        # Fetch intraday data for this day
        try:
            df = yf.download(
                tickers=symbol,
                start=trading_day,
                end=trading_day + dt.timedelta(days=1),
                interval=interval,
                progress=False,
                auto_adjust=True
            )
        except Exception as e:
            print(f"⚠ Failed download for {trading_day}: {e}")
            continue

        if df.empty:
            print(f"⚠ No intraday data for {trading_day}.")
            continue

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [c[0] for c in df.columns]

        for idx, row in df.iterrows():
            ts = int(pd.to_datetime(idx).timestamp())
            if ts < int(market_open_utc.timestamp()) or ts > int(market_close_utc.timestamp()):
                continue
            tick = {
                "symbol": symbol,
                "time": ts,
                "close": float(row["Close"]),
                "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
            }
            tick_history.append(tick)

    # Broadcast all historical ticks
    for t in tick_history:
        await manager.broadcast(json.dumps(t))

    if tick_history:
        last_timestamp = tick_history[-1]["time"]
        print(f"▶ Loaded {len(tick_history)} ticks from last 5 trading days.")
    else:
        last_timestamp = 0

    # ---------------- Poll for Live Ticks ---------------- #
    market_open_local = eastern.localize(dt.datetime.combine(today, dt.time(9, 30)))
    market_close_local = eastern.localize(dt.datetime.combine(today, dt.time(16, 0)))
    market_open_utc = market_open_local.astimezone(utc)
    market_close_utc = market_close_local.astimezone(utc)

    while True:
        now_utc = dt.datetime.now(tz=utc)
        if now_utc > market_close_utc:
            print("⏹ Market closed, stopping live polling.")
            break

        try:
            new_df = yf.download(
                tickers=symbol,
                start=now_utc - dt.timedelta(minutes=5),
                interval=interval,
                progress=False,
                auto_adjust=True
            )
        except Exception as e:
            print(f"⚠ Failed live download: {e}")
            await asyncio.sleep(30)
            continue

        if new_df.empty:
            await asyncio.sleep(30)
            continue

        if isinstance(new_df.index, pd.DatetimeIndex):
            new_df = new_df.reset_index()

        for _, row in new_df.iterrows():
            ts_val = row.get("Datetime", row.get("index", row.name))
            ts = int(pd.to_datetime(ts_val).timestamp())
            if ts <= last_timestamp or ts < int(market_open_utc.timestamp()) or ts > int(market_close_utc.timestamp()):
                continue

            tick = {
                "symbol": symbol,
                "time": ts,
                "close": float(row["Close"]),
                "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
            }
            tick_history.append(tick)
            await manager.broadcast(json.dumps(tick))
            last_timestamp = ts

        await asyncio.sleep(30)

# ---------------- Startup Event ---------------- #
@app.on_event("startup")
async def start_stream():
    asyncio.create_task(replay_ticks())

# ---------------- WebSocket Endpoint ---------------- #
@app.websocket("/ws/ticks")
async def ws_ticks(ws: WebSocket):
    await manager.connect(ws)
    # Send backlog to new client
    for t in tick_history:
        try:
            await ws.send_text(json.dumps(t))
        except:
            return
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
