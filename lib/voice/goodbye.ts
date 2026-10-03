// Voice mode keeps listening while the goodbye is read (ported from AI Soul 9/30 624168d). If the user talks over the goodbye,
// closing is called off and what they said goes on as the next message; a mishear (our own voice coming back) closes as planned.

/** The reading stopped because someone talked over it: what to do next. */
export function afterTalkOver(goodbye: boolean, real: boolean, user: string): "send" | "close" | "listen" {
  if (real && user.trim()) return "send";
  return goodbye ? "close" : "listen";
}
