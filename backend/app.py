# backend/app.py
import asyncio, json
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
async def replay_ticks(symbol="NVDA", interval="1m"):
    today = dt.date.today()

    def last_trading_day(d: dt.date):
        while d.weekday() >= 5:  # 5=Sat, 6=Sun
            d -= dt.timedelta(days=1)
        return d

    trading_day = last_trading_day(today)
    start = dt.datetime.combine(trading_day, dt.time(9, 30))

    # Pull all data from 9:30 to now
    df = yf.download(
        tickers=symbol,
        start=start - dt.timedelta(days=1),
        end=dt.datetime.now(),
        interval=interval,
        progress=False,
        auto_adjust=True
    )

    if df.empty:
        print(f"⚠ No data returned for {trading_day}.")
        return

    utc = pytz.UTC
    start_utc = utc.localize(start)
    now_utc = dt.datetime.now(tz=utc)

    df = df.loc[(df.index >= start_utc) & (df.index <= now_utc)]
    if df.empty:
        print(f"⚠ No intraday data between 9:30 and now.")
        return

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]

    # Pre-fill tick_history so late joiners see the full day's chart
    tick_history.clear()
    for idx, row in df.iterrows():
        timestamp = int(pd.to_datetime(idx).timestamp())
        close_val = row["Close"].iloc[0] if isinstance(row["Close"], pd.Series) else row["Close"]
        vol_val = row["Volume"].iloc[0] if isinstance(row["Volume"], pd.Series) else row["Volume"]
        volume_int = int(vol_val) if not pd.isna(vol_val) else 0

        tick = {
            "symbol": symbol,
            "time": timestamp,
            "close": float(close_val),
            "volume": volume_int,
        }
        tick_history.append(tick)

    # Broadcast all preloaded ticks
    for t in tick_history:
        await manager.broadcast(json.dumps(t))

    last_timestamp = tick_history[-1]["time"] if tick_history else 0
    print(f"▶ Loaded {len(tick_history)} historical ticks; now polling for live updates.")

    # Poll for new data every 30 seconds
    while True:
        new_df = yf.download(
            tickers=symbol,
            start=dt.datetime.now() - dt.timedelta(minutes=5),
            interval=interval,
            progress=False,
            auto_adjust=True
        )

        if new_df.empty:
            await asyncio.sleep(30)
            continue

        if isinstance(new_df.index, pd.DatetimeIndex):
            new_df = new_df.reset_index()

        for _, row in new_df.iterrows():
            ts_val = row.get("Datetime", row.get("index", row.name))
            if isinstance(ts_val, pd.Series):
                ts_val = ts_val.iloc[0]
            ts = int(pd.to_datetime(ts_val).timestamp())

            if ts <= last_timestamp:
                continue

            close_val = row["Close"].iloc[0] if isinstance(row["Close"], pd.Series) else row["Close"]
            vol_val = row["Volume"].iloc[0] if isinstance(row["Volume"], pd.Series) else row["Volume"]
            volume_int = int(vol_val) if not pd.isna(vol_val) else 0

            tick = {
                "symbol": symbol,
                "time": ts,
                "close": float(close_val),
                "volume": volume_int,
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
