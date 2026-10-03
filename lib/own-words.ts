// The member's own words: text with quoted and fenced parts taken out (AI Soul lib/mission-intent.ts QUOTED_RE · 548a67c/9712028).
// A pasted spec line («"show the first screen in 3 minutes"») or another AI's answer in a code block is data, not the member's ask.
const QUOTED_RE = /```[\s\S]*?```|"[^"\n]{0,400}"|“[^”]{0,400}”|«[^»]{0,400}»|「[^」]{0,400}」|『[^』]{0,400}』|‘[^’\n]{0,400}’/g;
export const ownWords = (text: string): string => text.replace(QUOTED_RE, " ");
