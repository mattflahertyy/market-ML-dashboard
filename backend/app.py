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

# store current session ticks
tick_history: list[dict] = []

@app.get("/")
async def root():
    return {"status": "Backend running"}

# ---------------- Replay Market Ticks ---------------- #
async def replay_ticks(symbol="AAPL", interval="1m", total_duration=200.0):
    """
    Streams today's (or last weekday's) trading session.
    """
    today = dt.date.today()

    # Get most recent weekday (Mon–Fri)
    def last_trading_day(d: dt.date):
        while d.weekday() >= 5:  # 5=Sat, 6=Sun
            d -= dt.timedelta(days=1)
        return d

    trading_day = last_trading_day(today)
    start = dt.datetime.combine(trading_day, dt.time(9, 30))
    end = dt.datetime.combine(trading_day, dt.time(16, 0))

    df = yf.download(
        tickers=symbol,
        start=start - dt.timedelta(days=1),  # buffer
        end=end,
        interval=interval,
        progress=False,
    )

    if df.empty:
        print(f"⚠ No data returned for {trading_day}.")
        return

    # Normalize timezones
    utc = pytz.UTC
    start_utc = utc.localize(start)
    end_utc = utc.localize(end)

    # Filter intraday data
    df = df.loc[(df.index >= start_utc) & (df.index <= end_utc)]
    if df.empty:
        print(f"⚠ No intraday data for {trading_day} between 9:30–16:00.")
        return

    # Flatten MultiIndex if needed
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]

    num_ticks = len(df)
    sleep_time = total_duration / num_ticks
    print(f"▶ Replaying {num_ticks} ticks from {trading_day} (~{sleep_time:.2f}s/tick)")

    for idx, row in df.iterrows():
        try:
            timestamp = int(pd.to_datetime(idx).timestamp())
            close_val = row["Close"].iloc[0] if isinstance(row["Close"], pd.Series) else row["Close"]
            vol_val = row["Volume"].iloc[0] if isinstance(row["Volume"], pd.Series) else row["Volume"]

            tick = {
                "symbol": symbol,
                "time": timestamp,
                "close": float(close_val),
                "volume": int(vol_val) if not pd.isna(vol_val) else 0,
            }

            tick_history.append(tick)  # store tick for future reconnects
            await manager.broadcast(json.dumps(tick))
            await asyncio.sleep(sleep_time)

        except Exception as e:
            print(f"⚠ Error processing row {idx}: {e}")
            continue

# ---------------- Startup Event ---------------- #
@app.on_event("startup")
async def start_stream():
    asyncio.create_task(replay_ticks())

# ---------------- WebSocket Endpoint ---------------- #
@app.websocket("/ws/ticks")
async def ws_ticks(ws: WebSocket):
    await manager.connect(ws)

    # Send all previous ticks first
    for t in tick_history:
        await ws.send_text(json.dumps(t))

    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        manager.disconnect(ws)
