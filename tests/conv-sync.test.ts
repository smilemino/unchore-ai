// Same chat in another tab or on another device (lib/conv-sync.ts — AI Soul Chat.tsx): the answer-so-far is saved at a steady
// pace, and a reload from the server never wipes a line only this screen has.
import { describe, expect, it } from "vitest";
import { draftSaver, mergeServer } from "@/lib/conv-sync";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("draftSaver", () => {
  it("writes at most once per gap and never two writes at a time", async () => {
    let clock = 0;
    const saved: string[] = [];
    let release: () => void = () => {};
    const save = draftSaver((t) => { saved.push(t); return new Promise<void>((r) => { release = r; }); }, 1500, () => clock);
    clock = 2000; save("a");
    clock = 2100; save("ab");          // too soon
    clock = 3600; save("abc");         // the first write hasn't finished yet
    await tick();
    expect(saved).toEqual(["a"]);
    release(); await tick();
    clock = 3700; save("abcd");
    await tick();
    expect(saved).toEqual(["a", "abcd"]);
  });

  it("a failed write doesn't stop the next one", async () => {
    let clock = 5000, n = 0;
    const save = draftSaver(() => { n++; return Promise.reject(new Error("db down")); }, 1000, () => clock);
    save("x");
    await tick();
    clock = 6100; save("xy");
    await tick();
    expect(n).toBe(2);
  });

  it("a save that throws at once doesn't break the answer stream", async () => {
    const save = draftSaver(() => { throw new Error("no key"); }, 1000, () => 9000);
    expect(() => save("x")).not.toThrow();
    await tick();
  });
});


describe("mergeServer", () => {
  type Row = { id?: string; role: "user"; content: string; superseded?: boolean; notes?: string[]; proposal?: { status?: string } | null };
  const m = (id: string | undefined, content: string, extra: Partial<Row> = {}): Row => ({ id, role: "user", content, ...extra });

  it("takes a question and answer added on the other device", () => {
    const local = [m("1", "hi"), m("2", "hello")];
    const server = [...local, m("3", "and now?"), m("4", "this")];
    expect(mergeServer(server, local)?.map((x) => x.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("returns null when nothing changed, so the screen doesn't redraw", () => {
    expect(mergeServer([m("1", "hi")], [m("1", "hi")])).toBeNull();
  });

  it("sees an edit (set aside) and an answered choice", () => {
    expect(mergeServer([m("1", "hi", { superseded: true })], [m("1", "hi")])).not.toBeNull();
    expect(mergeServer([m("1", "hi", { proposal: { status: "accepted" } })], [m("1", "hi", { proposal: { status: "open" } })])).not.toBeNull();
  });

  it("keeps a screen-only line (failed send) instead of wiping it", () => {
    expect(mergeServer([m("1", "hi"), m("2", "new")], [m("1", "hi"), m(undefined, "Couldn't send this.")])).toBeNull();
  });

  it("keeps the notes shown under an answer", () => {
    const out = mergeServer([m("1", "hi"), m("2", "new")], [m("1", "hi", { notes: ["🧠 Memory updated"] })]);
    expect(out?.[0]?.notes).toEqual(["🧠 Memory updated"]);
  });
});
