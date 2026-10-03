import { videoFiles, type HowToVideo } from "@/lib/how-to-videos";
import type { Lang } from "@/lib/i18n";

/** One how-to video from lib/how-to-videos.ts — the same player on the help page and in tips. */
export function HowToPlayer({ v, lang, className }: { v: HowToVideo; lang: Lang; className?: string }) {
  const f = videoFiles(v, lang);
  return <video controls playsInline preload="none" className={className} poster={f.poster}>
    <source src={f.webm} type="video/webm" />
    <source src={f.mp4} type="video/mp4" />
    <track kind="captions" src={f.captions} srcLang={f.lang} />
  </video>;
}
