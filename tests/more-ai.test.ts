import { describe, expect, it } from "vitest";
import { connectWhich, detectKey, looksLikeKey, namedAi, skGuesses } from "../lib/chat-setup";
import { autoModel, chooseModel, fallbackModel, fastModel, KEY_PROVIDERS, MODELS, pickStandIn, PROVIDERS, providerOf } from "../lib/ai";

// Owner 2026-10-01: «like AI Soul — ChatGPT, OpenRouter and other AI keys, all inside the chat, without tiring the brain».
describe("more AIs — which company is this key from?", () => {
  it("Gemini (AIza…) and Grok (xai-…) keys are told apart by their first letters", () => {
    const g = "AIza" + "S".repeat(35);
    expect(detectKey(g)).toEqual({ provider: "gemini", key: g });
    expect(detectKey(`제 키예요 ${"xai-" + "k".repeat(60)}`)?.provider).toBe("xai");
    expect(detectKey("sk-svcacct-" + "x".repeat(40))?.provider).toBe("openai");
    // Google's newer AI Studio keys start «AQ.» (2026-10-01: the company key looked like this and went to the AI as a message)
    expect(detectKey(`이거요 AQ.Ab8RN6${"z".repeat(46)}`)?.provider).toBe("gemini");
  });
  it("in the «API key» step, a key of a shape we don't know is still a key (tried at every company), a sentence isn't", () => {
    expect(looksLikeKey("gsk_" + "Q".repeat(40))).toBe(true);
    expect(looksLikeKey("내일 서울 날씨 알려 줘")).toBe(false);
    expect(looksLikeKey("https://example.com/a")).toBe(false);
    expect(skGuesses("gsk_" + "Q".repeat(40))).toContain("gemini");
  });
  it("a plain sk- key is tried at the likeliest company first (DeepSeek keys are 32 hex)", () => {
    expect(skGuesses("sk-" + "0123456789abcdef".repeat(2))[0]).toBe("deepseek");
    expect(skGuesses("sk-" + "A".repeat(48))[0]).toBe("openai");
    expect(new Set(skGuesses("sk-" + "A".repeat(48)))).toEqual(new Set(["openai", "deepseek", "kimi"]));
  });
  it("«connect …» opens the right steps", () => {
    expect(connectWhich("챗GPT 연결")).toBe("chatgpt");
    expect(connectWhich("connect my ChatGPT")).toBe("chatgpt");
    expect(connectWhich("Conectar ChatGPT", "conectar ChatGPT")).toBe("chatgpt");
    expect(connectWhich("제미나이 연결")).toBe("key");
    expect(connectWhich("API 키 연결")).toBe("key");
    expect(connectWhich("GPT 키 연결")).toBe("key");
    expect(connectWhich("클로드 연결")).toBe("claude");
  });
});

describe("more AIs — models", () => {
  it("every model id belongs to its own provider", () => {
    for (const p of [...PROVIDERS, "credit" as const]) for (const m of MODELS[p]) expect(providerOf(m.id), m.id).toBe(p);
  });
  it("key providers are the providers that aren't plans", () => {
    expect([...KEY_PROVIDERS].sort()).toEqual(PROVIDERS.filter((p) => !p.endsWith("_sub")).sort());
  });
  it("a member with only a Gemini key gets Gemini; ChatGPT plan comes right after the Claude plan", () => {
    expect(chooseModel({ gemini: "k" })).toBe("gemini:gemini-pro-latest");
    expect(fastModel({ gemini: "k" })).toBe("gemini:gemini-flash-latest");
    expect(autoModel({ deepseek: "k" }, "왜 이렇게 됐는지 분석해 줘")).toBe("deepseek:deepseek-reasoner");
    expect(chooseModel({ chatgpt_sub: "u", openai: "k" })).toBe("cx:gpt-6-sol");
    expect(chooseModel({ claude_sub: "u", chatgpt_sub: "u" })).toBe("sub:opus");
    expect(fallbackModel({ chatgpt_sub: "u", gemini: "k" }, ["cx:gpt-6-sol"])).toBe("gemini:gemini-pro-latest");
  });
  it("a retired model name is swapped for the newest of the same kind", () => {
    expect(pickStandIn("gemini", ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview", "embedding-001"], "gemini-flash-latest")).toBe("gemini-3.8-flash");
    expect(pickStandIn("xai", ["grok-4.6", "grok-4.10", "grok-imagine"], "grok-4.7")).toBe("grok-4.10");
    expect(pickStandIn("kimi", ["kimi-k3", "kimi-k3.1", "moonshot-v1-8k"], "kimi-k2")).toBe("kimi-k3.1");
    expect(pickStandIn("deepseek", ["deepseek-reasoner"], "deepseek-chat")).toBeNull();
  });
});

describe("«이번엔 제미나이로 답해 줘» — this answer from the AI they named", () => {
  const has = (...ps: string[]) => (id: string) => ps.includes(providerOf(id));
  it("picks the named AI when it's connected", () => {
    expect(namedAi("이번엔 제미나이로 답해 줘", has("gemini"))).toBe("gemini:gemini-pro-latest");
    expect(namedAi("Use Grok for this one", has("xai"))).toBe("xai:grok-4.7");
    expect(namedAi("GPT로 대답해 봐", has("chatgpt_sub", "openai"))).toBe("cx:gpt-6-sol");
    expect(namedAi("GPT로 대답해 봐", has("openai"))).toBe("gpt-6-sol");
    expect(namedAi("딥시크로 알려 줘", has("openrouter"))).toBe("deepseek/deepseek-v4.1-flash");
  });
  it("leaves the pick alone otherwise", () => {
    expect(namedAi("제미나이로 답해 줘", has("anthropic"))).toBeNull();          // not connected — the AI says so (settings guide)
    expect(namedAi("GPT와 클로드 비교해 줘", has("openai", "anthropic"))).toBeNull();   // two names = a question about them
    expect(namedAi("제미나이가 뭐야?", has("gemini"))).toBeNull();               // a question about it, not a pick
    expect(namedAi("x".repeat(200) + " use gemini", has("gemini"))).toBeNull();
  });
});
