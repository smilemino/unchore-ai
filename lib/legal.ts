import { k } from "./i18n";
// Public policy pages (pricing · terms · refund · privacy · contact) — Stripe reviews these before turning on payments (2026-09-30).
export const SUPPORT_EMAIL = "support@unchore.ai";
export const UPDATED = "October 3, 2026";

export type LegalPage = { title: string; updated?: boolean; body: string[] };

export const LEGAL: Record<"about" | "pricing" | "terms" | "refund" | "privacy" | "contact", LegalPage> = {
  // Google's app review needs a public page that says what the app does and why it asks for Google data (2026-10-01).
  // Facts only — the marketing page still comes last (owner 2026-09-29).
  about: {
    title: k("About Unchore"),
    body: [
      "Unchore is a personal AI assistant. Ask it anything by text or voice. When a task repeats, Unchore offers to do it for you from then on and sets up the automation, after you say yes.",
      "You use the AI account you already have (for example your own Claude plan, an OpenRouter key or an API key), or Unchore credit.",
      "Google account (optional): if you connect it, Unchore uses three things and nothing else. Calendar: it reads your events when you ask about your schedule, and adds an event only after you press «Yes». Gmail: it sends a mail you asked it to write, only after you press «Yes» — it never reads your inbox. Google Drive: it opens only the files you pick in Google's own file picker, so you can ask questions about them.",
      "Everything that sends, pays, books or deletes waits for your «Yes». You can disconnect Google any time in Settings.",
      "Unchore, Inc. is a Delaware corporation. Read our Privacy Policy for how we handle your data.",
    ],
  },
  pricing: {
    title: k("Pricing"),
    body: [
      "Free — $0. Chat by text or voice, files and memory, and a limited number of automations.",
      "Unchore Pro — $12 per month. More automations, more phone notifications, family alerts and setup help.",
      "Every new member can try Pro free for 30 days. No card is needed for the trial.",
      "To be plain about it: Pro isn't free after the trial. The Free plan stays free, and nothing is charged unless you choose Pro.",
      "If you choose to keep Pro after the trial, we charge $12 every month until you cancel. Prices are in US dollars. Sales tax may be added where required.",
      `To cancel, email ${SUPPORT_EMAIL}. We confirm by email and you are not charged again.`,
      "AI use: you can connect your own AI account (for example your own Claude plan, OpenRouter or API key) and pay that provider directly, or use Unchore credit below.",
      "Unchore credit (optional, for using AI without your own AI account): AI is charged at the AI provider's price with no markup. Each top-up adds a fee of 10% + $0.50. Top-ups start at $10. Credit is used only inside Unchore.",
    ],
  },
  terms: {
    title: k("Terms of Service"),
    updated: true,
    body: [
      'These terms are an agreement between you and Unchore, Inc., a Delaware corporation ("Unchore", "we").',
      "1. The service. Unchore is an online personal AI assistant. You need an account to use it. You must be at least 18.",
      "2. Your account. Keep your login safe. You are responsible for what happens in your account.",
      "3. Plans and billing. The Free plan costs nothing. New members can try Unchore Pro free for 30 days without a card. If you choose to keep Pro, it is $12 per month and renews every month until you cancel. Unchore credit is prepaid and used only inside Unchore. We charge the card you give us through our payment processor, Stripe.",
      `4. Cancellation and refunds. You can cancel at any time by emailing ${SUPPORT_EMAIL}. If you ask within 14 days of a charge, we refund that month in full. See our Refund Policy.`,
      "5. Your data. You own the data you connect to Unchore. We use it only to run the service for you. See our Privacy Policy.",
      "6. Acceptable use. Do not use Unchore to break the law, send spam, or access accounts you don't have permission to use.",
      "7. Actions you approve. Unchore suggests tasks and runs them after you approve them. You are responsible for checking and approving actions taken in your connected accounts.",
      "8. Changes. We may update these terms or our prices. If we make a big change, we will email you at least 30 days before it applies to you. We may suspend accounts that break these terms.",
      '9. No warranty; limit of liability. The service is provided "as is". To the extent the law allows, our total liability is limited to what you paid us in the last 12 months.',
      "10. YouTube. Unchore uses YouTube API Services to publish its own videos. Watching or using that YouTube content is also subject to the YouTube Terms of Service (https://www.youtube.com/t/terms).",
      "11. Governing law. These terms are governed by the laws of the State of Delaware, USA.",
    ],
  },
  refund: {
    title: k("Refund Policy"),
    body: [
      `You can cancel your subscription at any time by emailing ${SUPPORT_EMAIL}. After you cancel, you keep access until the end of the month you already paid for, and you will not be charged again.`,
      `If you are not happy, email ${SUPPORT_EMAIL} within 14 days of a charge and we will refund that month in full. Refunds go back to the original card, usually within 5 to 10 business days.`,
      "The 30-day Pro trial needs no card, so you are never charged during the trial. The Free plan is never charged.",
    ],
  },
  privacy: {
    title: k("Privacy Policy"),
    updated: true,
    body: [
      'Unchore, Inc. ("we") runs unchore.ai. This policy explains what we collect and why.',
      "What we collect: your name and email; your conversations, files and memory; the accounts you choose to connect (such as your Google account or your own AI provider) and the data the assistant needs to do the tasks you approve; and basic usage logs.",
      "Google account (only if you connect it): Unchore can see your calendar and add events, send mail as you, and open the Google Drive files you pick. It does not read your mail inbox or the rest of your Drive. Adding an event or sending a mail only happens after you press «Yes». You can disconnect any time in Settings or in your Google Account.",
      "Unchore's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
      "How we use Google data: only to give you the feature you asked for — answering your question about your calendar or a Drive file you picked, adding an event, or sending a mail you approved. We do not use Google data for anything else: not to train or improve AI models, not for ads, not for «Help improve Unchore», and we never sell it. A chat that used your Google data is kept out of «Help improve Unchore» from then on, and copies made from that chat before are deleted. People at Unchore do not read your Google data unless you ask us to, it is needed for security or abuse, or the law requires it.",
      "Who receives Google data: to answer, the part of your Google data the request needs (for example the events in the week you asked about, or the text of the file you picked) is sent to the AI model that answers you, and to a quick model of the same connection that decides what to read. Unchore sends Google data only to AI services that do not use it to train or improve their models: Anthropic (Claude API), OpenAI (API), xAI (Grok API) with your own API key — their APIs don't train on what you send unless you opt in — and OpenRouter, with your key or with Unchore credit, where every such request is marked to go only to model providers that neither store nor train on it. Unchore does not send Google data to consumer plans (a Claude or ChatGPT subscription), Google Gemini, DeepSeek or Moonshot AI (Kimi), or to a computer you connected: with those, Unchore doesn't read your Google account and asks you to pick one of the services above. Google data is not shared with anyone else, except Unchore's hosting and database providers that store your chats for us, encrypted.",
      "Keeping and deleting Google data: Calendar events and Drive files are read when needed and not kept separately; what the answer says about them stays in your chat (encrypted) until you delete the chat. Your Google sign-in tokens are stored encrypted. Disconnecting Google in Settings revokes Unchore's access at Google and deletes the tokens at once; you can also revoke access in your Google Account.",
      "YouTube: Unchore uses YouTube API Services only to upload our own short videos to Unchore's own YouTube channel. It does not access, store or share any YouTube data of our users. By using our YouTube content you agree to the YouTube Terms of Service (https://www.youtube.com/t/terms). Google's Privacy Policy (https://policies.google.com/privacy) applies to YouTube. The channel owner can revoke our access at any time at https://security.google.com/settings/security/permissions, and we then delete the stored access token within 7 days.",
      "Payments: card payments are handled by Stripe. We do not store your full card number.",
      "How we use it: to run Unchore for you, to bill you, and to contact you about your account. If «Help improve Unchore» is on, a scrubbed, encrypted copy of chats without Google data is kept for 90 days to find and fix mistakes; it is never used to train AI models. We do not sell your data.",
      "AI providers: to answer a request, the parts of your chat it needs are sent to the AI you chose (Anthropic, OpenAI, Google, xAI, DeepSeek, Moonshot AI or OpenRouter). With your own AI account or key, that company handles it under your agreement with them; with Unchore credit, requests go through OpenRouter only to providers that do not store or train on them. Google data follows the stricter rule above.",
      "Choosing the AI: when your chat is set to «Auto», the first 3,000 characters of your message are also sent to Jev, a small model on OpenRouter that only answers whether a quick or a stronger AI should reply. Unchore pays for this; if you connected your own OpenRouter key, your key is used.",
      "Messages you share (only if you turn on «Someone sent me this message»): Unchore never reads your text messages or notifications. Only a message you share or paste into Unchore is kept — in that sender's chat, encrypted, like your other chats — to organize what it asks and draft a reply. Card and national ID numbers in it are masked when it arrives. Replies are never sent by Unchore: they open in your own messaging app and you send them yourself. You can delete the chat at any time.",
      "Call recordings (only if you turn on «Calls → requests» in Settings): Unchore never reads your phone's calls or call log by itself. When you add a call recording, we receive it for a short time only to turn its speech into text on our own server; as soon as that is done (or couldn't be done) the sound is deleted and only the text stays, encrypted, in your account. Turning the text into a list of requests uses your own AI key. Telling the other person that the call is recorded and summarised by AI is your responsibility — in some countries and states their consent is required. Unchore never sends anything to the other person.",
      'Storage and security: your conversations are encrypted in our database. You can turn off "Help improve Unchore" in Settings.',
      `Your choices: you can export or delete your data, or close your account, at any time by emailing ${SUPPORT_EMAIL}.`,
    ],
  },
  contact: {
    title: k("Contact"),
    body: ["Unchore, Inc. — a Delaware corporation.", `Email: ${SUPPORT_EMAIL}`, "We reply within 2 business days."],
  },
};
