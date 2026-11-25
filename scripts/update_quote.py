"""Fetch SOXL daily prices from Yahoo Finance and write data/soxl.json."""
import json, urllib.request, datetime, pathlib

URL = "https://query1.finance.yahoo.com/v8/finance/chart/SOXL?range=1y&interval=1d"
req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
res = json.load(urllib.request.urlopen(req, timeout=30))["chart"]["result"][0]
ts = res["timestamp"]
closes = res["indicators"]["quote"][0]["close"]
highs = res["indicators"]["quote"][0]["high"]
lows = res["indicators"]["quote"][0]["low"]
pts = [(t, c, h, l) for t, c, h, l in zip(ts, closes, highs, lows) if c is not None]
daily = [{"date": datetime.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"), "close": round(c, 2)} for t, c, _, _ in pts]
meta = res["meta"]
price = round(meta.get("regularMarketPrice") or pts[-1][1], 2)
prev = round(pts[-2][1], 2) if len(pts) > 1 else price
out = {
    "symbol": "SOXL",
    "price": price,
    "prevClose": prev,
    "change": round(price - prev, 2),
    "changePct": round((price / prev - 1) * 100, 2),
    "asOf": datetime.datetime.utcfromtimestamp(meta.get("regularMarketTime", pts[-1][0])).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "low52": round(min(l for *_, l in pts if l is not None), 2),
    "high52": round(max(h for _, _, h, _ in pts if h is not None), 2),
    "source": "Yahoo Finance",
    "daily": daily[-130:],
}
p = pathlib.Path(__file__).resolve().parent.parent / "data" / "soxl.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(out["asOf"], out["price"])
