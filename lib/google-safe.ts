import { type Provider, providerOf } from "./ai";

// Google user data goes only to AI services that don't train on it (Google API Services User Data Policy, Limited Use —
// Google's review of 2026-10-02 asked for this). Checked 2026-10-02 against each provider's own terms:
//   anthropic, openai, xai — paid API: inputs aren't used for training unless the customer opts in.
//   openrouter (the member's key) and credit (Unchore's) — only with provider.data_collection "deny" on the request (lib/ai.ts
//   noTrain), which routes only to providers that don't store or train on prompts.
// Not allowed: claude_sub / chatgpt_sub (consumer plans — training depends on the member's own settings), gemini (the free tier
// trains and a key doesn't say its tier), deepseek (trains on API data by default), kimi (no clear API commitment found).
export const GOOGLE_SAFE: readonly Provider[] = ["anthropic", "openai", "xai", "openrouter", "credit"];
export const googleSafe = (model: string | null | undefined): boolean => Boolean(model) && GOOGLE_SAFE.includes(providerOf(model!));

/** For the answering AI when the member asked about their Google account but this AI may train on what it reads. */
export const GOOGLE_UNSAFE_NOTE = "## Google account not read this time\nThe member asked about their Google account (calendar, Drive or mail), but Unchore did not read it for this answer: the AI answering now is one that may use what it reads to train (their Claude or ChatGPT plan, Gemini, DeepSeek or Kimi), and Unchore sends Google data only to AIs that don't — Claude, ChatGPT or Grok with their own API key, OpenRouter, or Unchore credit. Say this in one or two plain sentences and tell them to pick one of those in the AI menu under the message box and ask again. Don't guess what is in their account.";
