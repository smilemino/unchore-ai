---
name: unchore-recipes
description: Verified recipes for live values — exchange rates, crypto prices, Korean stock prices, weather, news headlines, and a matching line from a public web page. Use when the user asks for one of these values; run the recipe instead of guessing or reading a web page yourself.
---

# Unchore recipes

Live numbers read by a fixed, tested recipe — not by the model. The same recipes power [Unchore](https://unchore.ai).

## How to use

1. Pick the recipe that matches the question and fill its arguments.
2. Run it from this skill's folder (Node 22+, no install, no keys):
   `node scripts/run.mjs <recipe> '<json arguments>'`
3. It prints one JSON line:
   - `{"ok":true,"value":…,"line":"…","url":"…"}` — answer with the value **and show `line` and `url`** so the user sees where it came from.
   - `{"ok":false,"why":"…"}` — say you couldn't read it and why. **Never fill the gap with a guess** or a number from memory.

## Rules

- One recipe run = one fresh read. Don't reuse an old value for a new question.
- If no recipe fits, say so instead of stretching one.
- `node scripts/run.mjs --list` shows every recipe and an example.

## Recipes

- `fx` — fx(from, to) — official daily exchange rate (ECB). from/to = 3-letter currency codes, e.g. {"from":"USD","to":"KRW"}.
  e.g. `node scripts/run.mjs fx '{"from":"USD","to":"KRW"}'`
- `crypto` — crypto(coin, vs) — current coin price. coin = ticker like BTC, ETH, SOL; vs = KRW (Upbit) for users in Korea, USD (Coinbase) for everyone else. e.g. {"coin":"BTC","vs":"USD"}.
  e.g. `node scripts/run.mjs crypto '{"coin":"BTC","vs":"KRW"}'`
- `weather` — weather(place) — today's high/low and rain chance. place = city name, e.g. {"place":"Seoul"}.
  e.g. `node scripts/run.mjs weather '{"place":"Seoul"}'`
- `news` — news(query, lang) — newest headlines for a topic (Google News). e.g. {"query":"전세사기","lang":"ko"}.
  e.g. `node scripts/run.mjs news '{"query":"AI","lang":"en"}'`
- `stock_kr` — stock_kr(code) — Korean stock price by 6-digit code (Naver Finance), e.g. Samsung Electronics {"code":"005930"}. (Korean source — for users in Korea)
  e.g. `node scripts/run.mjs stock_kr '{"code":"005930"}'`
- `page_watch` — page_watch(url, must_words) — reads a public web page and returns the first line containing ALL must_words (e.g. a notice board or a product page). Pick words from the page text itself (a product or notice name) — prices drawn by scripts may not be in it. Use when a site has no API. e.g. {"url":"https://example.com/notice","must_words":["모집"]}.
  e.g. `node scripts/run.mjs page_watch '{"url":"https://example.com","must_words":["Example"]}'`

## Want this every day without asking?

Unchore runs these on a schedule and tells you only when something changes — for example «tell me when USD/KRW goes above 1,400». Your AI, your keys; it asks before anything that spends money or sends a message.
