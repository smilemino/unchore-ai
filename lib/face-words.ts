// Who is this, from words in other languages (lib/words) — the Korean/English words stay in lib/face.ts. Server only:
// lib/face.ts is also drawn by the chat screen, and the word lists of 56 languages don't belong in the phone's download.
import type { Face } from "./face";
import { callName } from "./face";
import { wordsRe, wordsSrc } from "./words";
import W_NAME from "./words/name_words.json";
import W_BUILDER from "./words/face_builder.json";
import W_STUDENT from "./words/face_student.json";
import W_SHOP from "./words/face_shop.json";
import W_SENIOR from "./words/face_senior.json";
import W_WORKER from "./words/face_worker.json";

const ANY: [Face, RegExp][] = [["builder", wordsRe(W_BUILDER)], ["student", wordsRe(W_STUDENT)], ["shop", wordsRe(W_SHOP)], ["senior", wordsRe(W_SENIOR)], ["worker", wordsRe(W_WORKER)]];
export function guessFaceAny(text: string): Face | null {
  for (const [face, re] of ANY) if (re.test(text)) return face;
  return null;
}

/** «What should I call you?» answered in any language: the words around the name («llámame …», «…と呼んでください») go. */
const NAME_AROUND = new RegExp(wordsSrc(W_NAME, true, true), "giu");   // whole words — «soy» must not eat the start of «Soyeon»
export function callNameAny(text: string, lang: string): string | null { return callName(text, lang, NAME_AROUND); }
