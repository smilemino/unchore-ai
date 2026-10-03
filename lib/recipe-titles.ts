// Recipe names the browser can show without loading the recipes themselves (they carry server code).
// tests/growth-share.test.ts keeps this list the same as lib/recipes/index.ts.
import { k } from "./i18n";

export const RECIPE_TITLES: Record<string, string> = {
  fx: k("Exchange rate"), crypto: k("Crypto price"), weather: k("Weather"), news: k("News watch"), trend_radar: k("Trend radar"),
  stock_kr: k("Korean stock price"), page_watch: k("Page watch"), ai_digest: k("AI brief"), reminder: k("Reminder"),
  danawa_lowest: k("Lowest price (Danawa, Korea)"), google_flights: k("Lowest flight fare (Google Flights)"),
  meta_ad_library: k("Competitor ads (Meta Ad Library)"), meta_ads_report: k("Meta ads report card"), meta_ads_guard: k("Meta ads guard"),
};

// Skill tree (components/SkillTree.tsx): recipes grouped into branches, with a first sentence that starts each one in chat.
export const SKILL_BRANCHES: { name: string; skills: { recipe: string; ask: string }[] }[] = [
  { name: k("Money & prices"), skills: [
    { recipe: "fx", ask: k("Tell me the dollar exchange rate every morning") },
    { recipe: "crypto", ask: k("Tell me when Bitcoin drops below a price I choose") },
    { recipe: "stock_kr", ask: k("Tell me a Korean stock's price every day at market close") },
    { recipe: "danawa_lowest", ask: k("Watch the lowest price of a product and tell me when it drops") },
    { recipe: "google_flights", ask: k("Watch a flight fare and tell me when it gets cheaper") },
  ] },
  { name: k("Keeping up"), skills: [
    { recipe: "news", ask: k("Send me the news on a topic every morning") },
    { recipe: "weather", ask: k("Tell me the weather every morning") },
    { recipe: "page_watch", ask: k("Tell me when a web page posts something new") },
  ] },
  { name: k("Ads"), skills: [
    { recipe: "meta_ads_report", ask: k("Send me yesterday's Meta ads report card every morning") },
    { recipe: "meta_ads_guard", ask: k("Watch my Meta ads every hour and pause the ones that cost too much") },
    { recipe: "meta_ad_library", ask: k("Watch my competitors' Facebook and Instagram ads every day") },
  ] },
  { name: k("Every day"), skills: [
    { recipe: "reminder", ask: k("Remind me of something every day") },
    { recipe: "ai_digest", ask: k("Write me something new every morning — a workout, a word, an idea") },
  ] },
];

// Our team's picks (plan v11 §13 D): what the founder and the AI team really run, made general — no company data. They show on the
// empty first screen and start in chat with their first sentence. `checked` recipes run for real in the nightly self-check
// (a canary in lib/recipes/index.ts — tests/founder-picks.test.ts keeps this list honest); the others are «tried», not checked.
export const CHECKED_NIGHTLY = new Set(["fx", "crypto", "weather", "news", "trend_radar", "stock_kr", "page_watch", "danawa_lowest", "meta_ad_library"]);
export const FOUNDER_PICKS: { recipe: string; title: string; ask: string }[] = [
  { recipe: "news", title: k("Morning news brief"), ask: k("Every morning at 8:30, send me the top economy and AI news") },
  { recipe: "page_watch", title: k("Competitor page watch"), ask: k("Watch a competitor's web page and tell me when it changes") },
  { recipe: "ai_digest", title: k("Weekly one-page plan"), ask: k("Every Monday at 8, help me write a one-page to-do list for the week") },
  { recipe: "fx", title: k("Exchange-rate line"), ask: k("Tell me when the dollar goes above a rate I choose") },
  { recipe: "crypto", title: k("Bitcoin price line"), ask: k("Tell me when Bitcoin drops below a price I choose") },
];
