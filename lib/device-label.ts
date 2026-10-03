// Sign-in device name (ported from AI Soul lib/device-label.ts): the device and browser out of the long user-agent text.
// Brand names only («iPhone · Safari», «Windows · Chrome») — they read the same in every language; unknown → "" (the screen says «Unknown device»).
export function deviceLabel(ua: string | null | undefined): string {
  const s = ua ?? "";
  const device = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? (/Mobile/.test(s) ? "Android phone" : "Android tablet")
    : /CrOS/.test(s) ? "Chromebook" : /Macintosh|Mac OS X/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "";
  const browser = /Edg\//.test(s) ? "Edge" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /Whale/.test(s) ? "Whale" : /OPR\//.test(s) ? "Opera"
    : /(Chrome|CriOS)\//.test(s) ? "Chrome" : /(Firefox|FxiOS)\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "";
  return [device, browser].filter(Boolean).join(" · ");
}
