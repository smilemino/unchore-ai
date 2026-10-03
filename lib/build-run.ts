// «Build me an app», step 2 (benchmark 2026-10-01 — the coding AI opens its own result in a browser before handing it over):
// inside the throwaway Vercel Sandbox, open the built app in a test browser (happy-dom), let it load, press each button once,
// and list script errors. Plain strings here are the sandbox's own files; nothing runs on our servers.

/** Pinned test browser (installed once per sandbox; 20.14.5 tried on 2026-10-01). */
export const HAPPY_DOM = "happy-dom@20.14.5";

/** Errors a real phone browser wouldn't have — things the test browser doesn't do (sound, canvas drawing, speech…). */
export const SOFT_ERROR = /AudioContext|getContext|WebGL|canvas|speechSynthesis|SpeechRecognition|Notification|serviceWorker|navigator\.(vibrate|share|clipboard|geolocation|mediaDevices)|IntersectionObserver|ResizeObserver|requestAnimationFrame|matchMedia|scrollTo|fetch|network|Failed to load|NetworkError|CORS/i;

/** A tiny file server for the app folder, in its own process (happy-dom loads classic scripts with a blocking request). */
const SERVER = [
  'const http=require("http"),fs=require("fs"),path=require("path");const root=process.argv[1];',
  'const types={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml"};',
  'const s=http.createServer((q,r)=>{let p;try{p=path.join(root,decodeURIComponent(new URL(q.url,"http://x").pathname));}catch(e){r.writeHead(400);return r.end();}',
  'const f=fs.existsSync(p)&&fs.statSync(p).isDirectory()?path.join(p,"index.html"):p;if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);return r.end();}',
  'r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r);});',
  's.listen(0,"127.0.0.1",()=>console.log(s.address().port));setTimeout(()=>process.exit(0),60000);',
].join("\n");

/** run.mjs for the sandbox: prints one JSON line {errs, clicked}. */
export const RUN_CHECK = [
  'import { spawn } from "node:child_process";',
  'const root = process.argv[2] || "/vercel/sandbox/app";',
  `const child = spawn(process.execPath, ["-e", ${JSON.stringify(SERVER)}, root], { stdio: ["ignore", "pipe", "ignore"] });`,
  'const errs = []; let clicked = 0;',
  'const out = () => { try { child.kill(); } catch (e) { /* gone */ } console.log(JSON.stringify({ errs: errs.slice(0, 15), clicked })); process.exit(0); };',
  'setTimeout(() => { errs.push("the page did not finish loading within 20 s"); out(); }, 20000);',
  'const note = (e) => { const m = String((e && e.message) || e).split("\\n")[0].slice(0, 200); if (m && !errs.includes(m)) errs.push(m); };',
  'const port = await new Promise((ok) => child.stdout.once("data", (d) => ok(Number(String(d).trim()))));',
  'const { Browser } = await import("happy-dom");',
  'const browser = new Browser({ settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableCSSFileLoading: true, navigation: { disableChildFrameNavigation: true, disableChildPageNavigation: true }, timer: { maxTimeout: 3000, maxIntervalTime: 3000, maxIntervalIterations: 20 } } });',
  'const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));',
  'const logs = (page) => { for (const l of page.virtualConsolePrinter.read()) if (l.level >= 3 || /error/i.test(String(l.type))) note(l.message.map(String).join(" ")); };',
  'try {',
  '  const page = browser.newPage();',
  '  const w = page.mainFrame.window;',
  '  w.addEventListener("error", (e) => note(e.error || e.message));',
  '  w.addEventListener("unhandledrejection", (e) => note(e.reason));',
  '  await Promise.race([page.goto("http://127.0.0.1:" + port + "/"), wait(8000)]);',
  '  await Promise.race([page.waitUntilComplete(), wait(5000)]);',
  '  logs(page);',
  '  const doc = page.mainFrame.document;',
  '  if (!doc.body || (!doc.body.textContent.trim() && !doc.querySelector("canvas,svg,img"))) errs.push("the page shows nothing");',
  '  const btns = [...doc.querySelectorAll("button, [onclick], input[type=button], input[type=submit], [role=button]")].slice(0, 30);',
  '  for (const b of btns) { try { b.click(); clicked++; } catch (e) { note(e); } await wait(30); }',
  '  await Promise.race([page.waitUntilComplete(), wait(2000)]);',
  '  logs(page);',
  '} catch (e) { note(e); }',
  'out();',
].join("\n");

/** The test browser's errors that count (the soft ones left out). */
export const hardErrors = (errs: string[] | undefined): string[] => (errs ?? []).filter((e) => !SOFT_ERROR.test(e));
