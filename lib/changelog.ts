// «What's new» (app/changes — benchmark 2026-10-01: small sites that show their build log look alive and earn trust).
// Newest first. Plain words for members, one line each; add a line when something members can notice goes live.
import { k } from "./i18n";

export const CHANGES: { date: string; items: string[] }[] = [
  { date: "2026-10-01", items: [
    k("Free tools, no sign-up: chore cost, AI cost (live prices), automation ideas, cron in plain words, website security check, chore-doer type."),
    k("Apps you ask for are now opened and clicked through in a test browser before you get the link, and fixed if something breaks."),
    k("Put your own web address on an app Unchore built for you."),
    k("Your month on the Automations page: how many checks Unchore did for you, with a link to share."),
  ] },
  { date: "2026-09-30", items: [
    k("Ask for an app and get a link: Unchore writes it, checks it and puts it online."),
    k("Meta ads guard and a morning report card; competitors' ads from the public Ad Library."),
    k("Android app with voice, a small floating window and a pause when a call comes in."),
    k("Unchore credit: use AI without your own AI account, at the AI company's price."),
    k("My notes: a notebook that grows from your chats, with a download for Obsidian."),
    k("Voice mode: talk over it to stop it, one topic at a time, and it closes when you say you're done."),
    k("Sign in with GitHub; connect your Google Calendar, Gmail and Drive."),
    k("Unchore in 58 languages, including the words you say to it."),
  ] },
  { date: "2026-09-29", items: [
    k("First version: chat by text or voice, and when something repeats Unchore offers to automate it — prices, fares, news, reminders."),
    k("Automations show the source line of every value, and stop instead of guessing when a value can't be read."),
    k("Bring your own AI: your Claude plan, an OpenRouter or API key."),
  ] },
];
