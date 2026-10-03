// Free tool «what could run by itself in my week» (benchmark 2026-10-01, generator type): pick a role → chores people in
// that role repeat, each one a sentence you can hand to Unchore. A fixed list (no AI call, nothing costs anything).
import { k } from "../i18n";

export type Idea = { text: string; recipe?: string };
export const ROLES: { id: string; name: string; ideas: Idea[] }[] = [
  { id: "founder", name: k("Founder"), ideas: [
    { text: k("Every morning, a short brief of news about my market and my competitors"), recipe: "news" },
    { text: k("Tell me when a competitor changes their pricing page"), recipe: "page_watch" },
    { text: k("Every Monday, list the emails I haven't answered for 3 days") },
    { text: k("Watch my competitors' Facebook and Instagram ads every day"), recipe: "meta_ad_library" },
    { text: k("Tell me the dollar exchange rate every morning"), recipe: "fx" },
    { text: k("Remind me of investor updates on the first of every month"), recipe: "reminder" },
  ] },
  { id: "agency", name: k("Agency owner"), ideas: [
    { text: k("Send me yesterday's Meta ads report card every morning"), recipe: "meta_ads_report" },
    { text: k("Watch my Meta ads every hour and pause the ones that cost too much"), recipe: "meta_ads_guard" },
    { text: k("Tell me when a client's website goes down or changes"), recipe: "page_watch" },
    { text: k("Every Friday, remind me to send each client their weekly report"), recipe: "reminder" },
    { text: k("Every morning, three new ad ideas for a client's product"), recipe: "ai_digest" },
    { text: k("Watch a client's competitors' ads every day"), recipe: "meta_ad_library" },
  ] },
  { id: "developer", name: k("Developer"), ideas: [
    { text: k("Tell me when a library I use posts a new release"), recipe: "page_watch" },
    { text: k("Every morning, the top AI and developer news in five lines"), recipe: "news" },
    { text: k("Tell me when a status page shows an outage"), recipe: "page_watch" },
    { text: k("Remind me to renew my domains and certificates a week before they expire"), recipe: "reminder" },
    { text: k("Build me a small one-page tool and put it online") },
    { text: k("Tell me when Bitcoin drops below a price I choose"), recipe: "crypto" },
  ] },
  { id: "marketer", name: k("Marketer"), ideas: [
    { text: k("Every morning, what's trending in my field"), recipe: "trend_radar" },
    { text: k("Watch my competitors' Facebook and Instagram ads every day"), recipe: "meta_ad_library" },
    { text: k("Send me yesterday's Meta ads report card every morning"), recipe: "meta_ads_report" },
    { text: k("Every morning, five post ideas for today"), recipe: "ai_digest" },
    { text: k("Tell me when a competitor posts a new blog article"), recipe: "page_watch" },
    { text: k("Remind me of posting days for each channel"), recipe: "reminder" },
  ] },
  { id: "shop", name: k("Shop owner"), ideas: [
    { text: k("Watch the lowest price of a product and tell me when it drops"), recipe: "danawa_lowest" },
    { text: k("Tell me when a supplier's page posts new stock or prices"), recipe: "page_watch" },
    { text: k("Tell me the weather every morning (for foot traffic and deliveries)"), recipe: "weather" },
    { text: k("Every morning, a reply draft for yesterday's customer reviews") },
    { text: k("Remind me of tax and payment deadlines"), recipe: "reminder" },
    { text: k("Tell me the dollar exchange rate every morning"), recipe: "fx" },
  ] },
  { id: "freelancer", name: k("Freelancer"), ideas: [
    { text: k("Tell me when a job board posts work that fits me"), recipe: "page_watch" },
    { text: k("Remind me to send invoices at the end of every month"), recipe: "reminder" },
    { text: k("Remind me of every project deadline three days and one day before"), recipe: "reminder" },
    { text: k("Every morning, the news in my field in five lines"), recipe: "news" },
    { text: k("Tell me the dollar exchange rate every morning"), recipe: "fx" },
    { text: k("Build me a simple price quote calculator page for my clients") },
  ] },
  { id: "office", name: k("Office worker"), ideas: [
    { text: k("Every Monday morning, my week's meetings and deadlines on one page") },
    { text: k("Remind me of every report deadline a day before"), recipe: "reminder" },
    { text: k("Every morning, the news about my company and industry"), recipe: "news" },
    { text: k("Watch a flight fare and tell me when it gets cheaper"), recipe: "google_flights" },
    { text: k("Tell me the weather every morning"), recipe: "weather" },
    { text: k("Tell me when an internal notice page posts something new"), recipe: "page_watch" },
  ] },
  { id: "student", name: k("Student"), ideas: [
    { text: k("Remind me of every assignment three days and one day before"), recipe: "reminder" },
    { text: k("Tell me when the scholarship page posts a new notice"), recipe: "page_watch" },
    { text: k("Tell me when concert tickets for a singer I like go on sale"), recipe: "page_watch" },
    { text: k("Every morning, one new word and one idea to think about"), recipe: "ai_digest" },
    { text: k("Watch a flight fare and tell me when it gets cheaper"), recipe: "google_flights" },
    { text: k("Tell me the weather every morning"), recipe: "weather" },
  ] },
];
