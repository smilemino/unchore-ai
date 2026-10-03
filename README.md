# Unchore

**Ask anything. If it repeats, Unchore does it for you.**

[unchore.ai](https://unchore.ai) · Try the screen you can reshape by talking — no sign-up: [live demo](https://smilemino.github.io/unchore-malleable-ui/) · Security sibling: [Unchore Defend](https://github.com/smilemino/unchore-defend)

> Ask «what's the USD/KRW rate?» → you get the number with the line it came from → Unchore asks once: «Want me to tell you every morning?» → yes → it runs once in front of you, then on schedule. No workflow builder, no nodes.

Unchore answers like any AI. Then, when a question is something you'll need again — a price, a fare, a deadline — it offers once to take care of it from now on, picks a *verified recipe*, runs it once so you see the real value, and schedules it.

- **Answer first, offer once.** A small judge decides whether an offer is worth making (rules v3: 95% agreement with human labels on 60 everyday questions, 0–3 needless offers).
- **Verified recipes, not improvised scraping.** The AI only picks a recipe and fills its arguments. Recipes show the exact source line and stop instead of guessing.
- **Bring your own key.** Claude, GPT or OpenRouter. Keys and saved logins are encrypted (AES-256-GCM).
- **Never pays, sends or deletes without your yes.**

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill DATABASE_URL, UNCHORE_SECRET_KEY (32 bytes base64), APP_URL
pnpm migrate
pnpm dev                     # http://localhost:3500
```

Scheduler: call `GET /api/cron/tick` every minute and `GET /api/cron/nightly` once a night with `Authorization: Bearer $CRON_SECRET`.

## Recipes

| id | what | runs on |
|---|---|---|
| fx | ECB exchange rate | server |
| crypto | Upbit (KRW) / CoinGecko (USD) | server |
| weather | Open-Meteo | server |
| news | Google News RSS | server |
| stock_kr | Naver Finance | server |
| page_watch | first line with all keywords on a public page | server |
| danawa_lowest | lowest price in Korea | browser worker |
| google_flights | lowest fare | browser worker |
| ai_digest | your AI writes a scheduled brief | server |
| reminder | fixed reminder | server |

*Humans do the creative work. AI does the chores.*

## Why open source

Your keys, your saved logins and your schedules are the most private things an assistant touches. You should be able to read every line that handles them — and run it yourself.

## Contributing

Recipes are the core asset: one small file that fetches one value and shows the line it came from. New recipes and fixes are welcome — open an issue with the site and the value you want watched.

## License

[AGPL-3.0](LICENSE). Use it, change it, self-host it. If you run a modified version as a service for others, share your changes under the same license.
