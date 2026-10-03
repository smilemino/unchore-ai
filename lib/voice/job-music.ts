// Voice mode keeps the piano going while a job left running (an app build, «🖥 <name>» on a computer) is still at work, so the
// member hears that it is still looking (ported from AI Soul 31c841c, 2026-09-30). When Unchore speaks or the member talks it
// is turned down, not off — and it can still be talked over. The music for an answer being made works as before.
export type MusicPlan = "off" | "full" | "low";

export interface MusicState {
  voice: boolean;    // voice mode is on
  busy: boolean;     // this turn's answer is being made
  jobs: number;      // jobs left running in this chat
  saying: boolean;   // Unchore is reading something aloud
  talking: boolean;  // the member's words are coming in (or «Hold to talk» is held)
  hidden: boolean;   // the page is out of sight (a web page there can't listen anyway)
  call: boolean;     // a phone call is ringing or on
}

export function musicPlan(s: MusicState): MusicPlan {
  if (!s.voice || s.call) return "off";
  if (s.jobs > 0 && !s.hidden) return s.saying || s.talking ? "low" : "full";
  if (!s.busy || s.saying) return "off";
  return s.talking ? "low" : "full";
}

/** A one-letter piece heard while the music plays is the music, not the member — don't send it */
export function musicCrumb(heard: string, playing: boolean): boolean {
  return playing && heard.replace(/\s/g, "").length < 2;
}
