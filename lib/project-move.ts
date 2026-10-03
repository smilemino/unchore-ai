import { wordsRe, wordsSrc } from "./words";
import W_PROJECT from "./words/project_word.json";
import W_MOVE from "./words/project_move.json";
import W_OUT from "./words/project_out.json";

// Moving a chat by saying so (AI Soul 0e84ead lib/project-route.ts ownerProjectCommand · 2026-10-02): «move this to the Garden
// project», «○○ 프로젝트로 옮겨 줘», «that's not the right project». Words only, no AI call: the message must say «project»,
// a move word and exactly one of the member's other project names — or, in a chat that has a project, say it's the wrong one.
export type ProjectMove = { kind: "move"; id: string; name: string } | { kind: "out" };
export type NamedProject = { id: string; name: string };

const PROJECT_KO_EN = /프로젝트|\bprojects?\b/i;
const PROJECT_ANY = wordsRe(W_PROJECT);
const PROJECT_STRIP = new RegExp(`프로젝트|\\bprojects?\\b|${wordsSrc(W_PROJECT)}`, "giu");
const MOVE_KO_EN = /옮겨|옮기|옮길|넣어|이동|(으로|로)\s*보내|\b(move|put|file)\s+(this|it|that|the chat|this chat|this conversation)\b/i;
const MOVE_ANY = wordsRe(W_MOVE);
const OUT_KO_EN = /프로젝트\s*(가|는|이|은)?\s*(아니|아냐|아님|잘못|틀렸)|프로젝트에서\s*빼|\b(wrong|not the right|not this|not that) project\b|\bnot (in|part of|for) (the|this|that) project\b|\bdoesn'?t belong (in|to)\b|\b(take|remove) (it|this|the chat|this chat) (out of|from) (the|this|that) project\b/i;
const OUT_ANY = wordsRe(W_OUT);

/** Only a short message is a command — a long one that happens to mention a project is a question for the AI. */
export const MAX_COMMAND = 160;
const squash = (s: string): string => s.normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();

/** A cheap first look before the member's projects are read. */
export const mentionsProject = (text: string): boolean => text.length <= MAX_COMMAND && (PROJECT_KO_EN.test(text) || PROJECT_ANY.test(text));

/** The member's projects named in the text (spaces and marks ignored); a name inside a longer named one counts once. */
export function namedProjects(text: string, projects: NamedProject[]): NamedProject[] {
  const t = squash(text.replace(PROJECT_STRIP, " "));
  const hits = projects.filter((p) => {
    const n = squash(p.name.replace(PROJECT_STRIP, " "));
    return n.length >= 2 && t.includes(n);
  });
  return hits.filter((p) => !hits.some((o) => o !== p && squash(o.name).length > squash(p.name).length && squash(o.name).includes(squash(p.name))));
}

export function projectCommand(text: string, projects: NamedProject[], currentId: string | null): ProjectMove | null {
  if (!mentionsProject(text)) return null;
  const others = namedProjects(text, projects).filter((p) => p.id !== currentId);
  if (others.length === 1 && (MOVE_KO_EN.test(text) || MOVE_ANY.test(text))) return { kind: "move", id: others[0]!.id, name: others[0]!.name };
  if (currentId && others.length === 0 && (OUT_KO_EN.test(text) || OUT_ANY.test(text))) return { kind: "out" };
  return null;
}

/** For the AI: what was already done, so the answer says it in one line (data, not instructions from the member). */
export function projectMoveNote(m: ProjectMove): string {
  return m.kind === "move"
    ? `\n\n## This chat's project\nAs they asked, this chat was just moved into their «${m.name}» project (done — not something for you to do). Say so in one short first line, then answer anything else they said.`
    : "\n\n## This chat's project\nAs they asked, this chat was just taken out of its project (done — not something for you to do). Say so in one short first line, and add that naming the right project moves it there.";
}
