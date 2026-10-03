import { Edit } from "./schema";
export function readScreenMark(text: string) {
  let edit: unknown;
  let invalid = false;
  const clean = text.replace(/```unchore-screen\s*\n([\s\S]*?)```/g, (_all, raw: string) => {
    try {
      const value = Edit.parse(JSON.parse(raw));
      if (edit || value.action === "read") invalid = true; else edit = value;
    } catch { invalid = true; }
    return "";
  }).replace(/```unchore-screen[\s\S]*$/, "").trim();
  return { text: clean, edit: invalid ? undefined : edit, invalid };
}
