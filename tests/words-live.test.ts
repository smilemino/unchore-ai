// The checks really understand other languages now (2026-09-30 owner: «a command that works in Korean must work in every
// country's language»). Everyday sentences only — the word lists come from scripts/i18n.mjs (translate → native review →
// blind back-translation), so a phrase this basic missing means the list needs another pass.
import { describe, expect, it } from "vitest";
import { askedStop, askedTimed, askedTimedRecent, priceLine } from "@/lib/reminders";
import { blocked, decideOps, words } from "@/lib/memory";
import { yesNo } from "@/lib/taste";
import { needsContext } from "@/lib/pick-floor";
import { signalOf } from "@/lib/nightly-review";
import { guessFaceAny } from "@/lib/face-words";
import { needsStrong } from "@/lib/ai";
import { wantsGoogle } from "@/lib/google-lookup";
import { mentionsGlossary } from "@/lib/glossary";
import { wantsConnect } from "@/lib/chat-setup";
import { isRefusal } from "@/lib/defend";
import { splitTech } from "@/lib/answer-fold";
import { previewLine } from "@/lib/conv-line";
import { scrub } from "@/lib/privacy";

describe("reminders in other languages", () => {
  it("a timed ask is seen («every morning», «in 30 minutes»)", () => {
    expect(askedTimed("毎朝8時にニュースをまとめて")).toBe(true);
    expect(askedTimed("Erinnere mich alle 30 Minuten ans Trinken")).toBe(true);
    expect(askedTimed("Recuérdame todos los días a las 9")).toBe(true);
    expect(askedTimedRecent(["Rappelle-moi de payer le loyer", "demain à 8 h"])).toBe(true);
    expect(askedTimed("Quelle est la capitale de l'Australie ?")).toBe(false);
  });
  it("stopping reminders, and a bare «stop» outside voice mode", () => {
    expect(askedStop("リマインダーを止めて")).toBe(true);
    expect(askedStop("Stopp die Erinnerungen bitte")).toBe(true);
    expect(askedStop("やめて")).toBe(true);
    expect(askedStop("やめて", true)).toBe(false);   // voice mode: «stop talking», not «stop my reminders»
    expect(askedStop("Wie spät ist es in Tokio?")).toBe(false);
  });
  it("a price line in the member's own words", () => {
    expect(priceLine("ビットコインが1000万円を下回ったら教えて")).toEqual({ kind: "below", value: 10_000_000 });
    expect(priceLine("Avísame si el dólar sube por encima de 20")).toEqual({ kind: "above", value: 20 });
    expect(priceLine("Préviens-moi quand l'action passe sous 150")).toEqual({ kind: "below", value: 150 });
  });
});

describe("memory and privacy in other languages", () => {
  it("health and faith are never stored; «forget» deletes", () => {
    expect(blocked("Ich war letzte Woche im Krankenhaus")).toContain("health");
    expect(blocked("Voy a la iglesia cada domingo")).toContain("religion-politics");
    expect(blocked("J'aime le café noir")).toEqual([]);
    const ops = decideOps([{ op: "delete", id: "m1" }], "Olvida lo que te dije de mi trabajo", [{ id: "m1", text: "works at a bank", created_at: "" }]);
    expect(ops).toEqual([{ op: "delete", id: "m1" }]);
  });
  it("the improvement copy hides a password and a name said in another language", () => {
    expect(scrub("Mi contraseña es hunter22")).not.toContain("hunter22");
    expect(scrub("Je m'appelle Camille Durand")).not.toContain("Camille");
    expect(scrub("J'adore Pinterest et Otpor")).toBe("J'adore Pinterest et Otpor");   // «pin», «otp» only as whole words
    expect(blocked("Sie mag Pinterest")).toEqual([]);
  });
  it("memories match in scripts without spaces", () => {
    expect(words("東京の天気")).toContain("東京");
  });
});

describe("short replies, complaints and who someone is", () => {
  it("yes and no", () => {
    expect(yesNo("はい")).toBe(true);
    expect(yesNo("Ja, gerne")).toBe(true);
    expect(yesNo("Nein danke")).toBe(false);
    expect(yesNo("Ma che dici")).toBeNull();
  });
  it("«that's not it / still not working» reads the chat properly and counts as a miss", () => {
    expect(needsContext("Das funktioniert immer noch nicht", true)).toBe(true);
    expect(signalOf(true, "No entiendo, explícalo más fácil")).toBe("plain");
    expect(needsContext("Hoy hace buen tiempo en Madrid", true)).toBe(false);
  });
  it("who they are, which model, which Google service, which word to use", () => {
    expect(guessFaceAny("Tengo un examen en la universidad mañana")).toBe("student");
    expect(needsStrong("Analyse ce contrat pour moi")).toBe(true);
    expect(wantsGoogle("明日の予定を教えて", ["calendar", "gmail", "drive"])).toEqual(["calendar"]);
    expect(mentionsGlossary("Sag nicht «Kunde», sag stattdessen «Gast»")).toBe(true);
    expect(wantsConnect("Conecta mi Claude")).toBe(true);
    expect(wantsConnect("Desconecta Claude")).toBe(false);
  });
});

describe("reading AI answers written in other languages", () => {
  it("a refusal, the details part and the conclusion line", () => {
    expect(isRefusal("申し訳ありませんが、その内容にはお答えできません。")).toBe(true);
    expect(splitTech(`Die Antwort ist einfach.\n${"Mehr Text. ".repeat(20)}\n\n## Details\n${"code ".repeat(20)}`)?.tech).toMatch(/^## Details/);
    const long = `答えはシンプルです。${"説明です。".repeat(30)}\n\n**詳細**\n${"パス /etc/app/config を確認。".repeat(5)}`;
    expect(splitTech(long)?.tech).toMatch(/詳細/);
    expect(previewLine("Einleitung\nFazit: Es lohnt sich nicht.")).toBe("Fazit: Es lohnt sich nicht.");
  });
});
