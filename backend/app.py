# backend/app.py
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import yfinance as yf
import pandas as pd
import datetime as dt
import pytz
from fastapi.middleware.cors import CORSMiddleware

# --- ML Imports ---
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
import numpy as np

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# ---------------- ML Model ---------------- #
ml_model = None

def compute_rsi(series: pd.Series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def build_features(df: pd.DataFrame):
    """Generate simple technical features from OHLCV."""
    X = pd.DataFrame(index=df.index)
    X["return_1"] = df["Close"].pct_change()
    X["sma_5"] = df["Close"].rolling(5).mean()
    X["sma_15"] = df["Close"].rolling(15).mean()
    X["rsi"] = compute_rsi(df["Close"], 14)
    return X.fillna(0)

def train_model(symbol="NVDA"):
    """Train simple logistic regression on past 30 days of 5m data."""
    df = yf.download(symbol, period="30d", interval="5m", auto_adjust=True, progress=False)
    if df.empty:
        return None
    X = build_features(df)
    y = (df["Close"].shift(-1) > df["Close"]).astype(int).fillna(0)
    model = make_pipeline(StandardScaler(), LogisticRegression())
    model.fit(X, y.values.ravel())
    return model

# ---------------- API Endpoints ---------------- #
@app.get("/")
async def root():
    return {"status": "Backend running"}

@app.get("/advanced-stats/{symbol}")
async def advancedStats(symbol: str):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        if not info:
            return {"stats": {}}
        stats = {
            "previousClose": info.get("previousClose"),
            "open": info.get("open"),
            "bid": info.get("bid"),
            "ask": info.get("ask"),
            "dayLow": info.get("dayLow"),
            "dayHigh": info.get("dayHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "volume": info.get("volume"),
            "averageVolume": info.get("averageVolume"),
            "marketCap": info.get("marketCap"),
            "beta": info.get("beta"),
            "trailingPE": info.get("trailingPE"),
            "trailingEps": info.get("trailingEps"),
            "dividendRate": info.get("dividendRate"),
        }
        return {"stats": stats}
    except Exception as e:
        return {"error": str(e)}

@app.get("/predict/{symbol}")
async def predict(symbol: str):
    """Predict next move for given stock."""
    global ml_model
    df = yf.download(symbol, period="5d", interval="5m", auto_adjust=True, progress=False)
    if df.empty or ml_model is None:
        return {"error": "No data or model not available"}

    X = build_features(df)
    latest = X.iloc[[-1]]  # keep as DataFrame to preserve column names
    proba = ml_model.predict_proba(latest)[0]
    pred = int(ml_model.predict(latest)[0])
    return {
        "symbol": symbol,
        "prediction": "UP" if pred == 1 else "DOWN",
        "confidence": round(float(proba[pred]), 3)
    }

# ---------------- Replay Market Ticks ---------------- #
async def replay_ticks(symbol="NVDA", interval="1m"):
    eastern = pytz.timezone("US/Eastern")
    utc = pytz.UTC
    today = dt.date.today()

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
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
            }
            tick_history.append(tick)

    # Broadcast all historical ticks
    for t in tick_history:
        await manager.broadcast(json.dumps(t))

    last_timestamp = tick_history[-1]["time"] if tick_history else 0
    if tick_history:
        print(f"▶ Loaded {len(tick_history)} ticks from last 5 trading days.")

    # Poll for live ticks
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
            ts_val = row.get("Datetime", row.name)
            if isinstance(ts_val, pd.Series):
                ts_val = ts_val.iloc[0]
            ts = int(pd.to_datetime(ts_val).timestamp())

            close_val = row["Close"]
            if isinstance(close_val, pd.Series):
                close_val = close_val.iloc[0]
            volume_val = row["Volume"]
            if isinstance(volume_val, pd.Series):
                volume_val = volume_val.iloc[0]

            if ts <= last_timestamp or ts < int(market_open_utc.timestamp()) or ts > int(market_close_utc.timestamp()):
                    continue

            tick = {
                "symbol": symbol,
                "time": ts,
                "date": pd.to_datetime(ts_val).strftime("%Y-%m-%d"),
                "open": float(row["Open"].iloc[0]),
                "high": float(row["High"].iloc[0]),
                "low": float(row["Low"].iloc[0]),
                "close": float(row["Close"].iloc[0]),
                "volume": int(volume_val) if not pd.isna(volume_val) else 0,
            }
            tick_history.append(tick)
            await manager.broadcast(json.dumps(tick))
            last_timestamp = ts

        await asyncio.sleep(30)

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

# ---------------- Startup Event ---------------- #
@app.on_event("startup")
async def startup_event():
    global ml_model
    ml_model = train_model("NVDA")  # initial ML model
    asyncio.create_task(replay_ticks())  # start tick replay
