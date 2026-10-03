// How-to videos (AI Soul / shop «usage videos» tab, 2026-10-02): one list for every short video, so a new video shows
// on the help page (/app/help, newest first) and wherever a tip plays it. Files live in public/help/<id>/<lang>.{webm,mp4,jpg,vtt};
// a language without its own recording plays the English one.
import { k, type Lang } from "./i18n";

export type HowToVideo = {
  id: string;
  /** when it went up (YYYY-MM-DD) — newest first on the page */
  date: string;
  /** translation keys */
  title: string;
  what: string;
  /** the screen it teaches — the «Open that screen» button */
  screen: string;
  langs: Lang[];
};

export const HOW_TO_VIDEOS: HowToVideo[] = [
  { id: "personal-ui", date: "2026-10-02", title: k("Change my screen"), what: k("Ask me to change the layout or add a tool. This short video shows how."), screen: "/app", langs: ["en", "ko"] },
];

export function howToVideosNewestFirst(list: HowToVideo[] = HOW_TO_VIDEOS): HowToVideo[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date));
}

/** File paths of one video in the member's language (English when there is no recording in it). */
export function videoFiles(v: HowToVideo, lang: Lang) {
  const l = v.langs.includes(lang) ? lang : "en", base = `/help/${v.id}/${l}`;
  return { lang: l, webm: `${base}.webm`, mp4: `${base}.mp4`, poster: `${base}.jpg`, captions: `${base}.vtt` };
}

export const howToVideo = (id: string) => HOW_TO_VIDEOS.find((v) => v.id === id);
