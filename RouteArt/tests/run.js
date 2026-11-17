// End-to-end tests for Route Art. They drive the real page in headless Chromium,
// with every network service (OpenStreetMap, address search, elevation) replaced
// by a fake city: a street grid with a river, a mountain with trails, and
// optionally a lake around the start so the city-wide search has to kick in.
//
//   cd RouteArt && npm install && npx playwright install chromium && npm test
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
let PAGE; // set once the local server is up
const LEAFLET = path.dirname(require.resolve("leaflet/dist/leaflet.js"));
const LAT0 = 37.5665, LON0 = 126.978; // Seoul City Hall, a public landmark
const ky = 111320, kx = 111320 * Math.cos(LAT0 * Math.PI / 180);
const STEP = 90; // metres between fake intersections

function fakeCity(bb, opts) { // bb = [south, west, north, east]
  const nodes = new Map(), ways = []; let id = 1;
  const xy = (la, lo) => [(lo - LON0) * kx, (la - LAT0) * ky];
  const node = (i, j) => { const k = i + "," + j; if (!nodes.has(k)) nodes.set(k, { type: "node", id: id++, lat: LAT0 + j * STEP / ky, lon: LON0 + i * STEP / kx }); return nodes.get(k).id; };
  const river = j => !opts.lake && j * STEP > 900 && j * STEP < 1100;            // bridges every ~1 km
  const lake = (i, j) => opts.lake && Math.hypot(i * STEP, j * STEP) > 300 && Math.hypot(i * STEP, j * STEP) < 3600;
  const mountain = (i, j) => i * STEP > 1500 && j * STEP < -800;                   // trails only
  const tags = (i, j) => mountain(i, j) ? { highway: "path", sac_scale: "hiking" } : { highway: "residential" };
  const [x0, y0] = xy(bb[0], bb[1]), [x1, y1] = xy(bb[2], bb[3]);
  const I0 = Math.ceil(x0 / STEP), I1 = Math.floor(x1 / STEP), J0 = Math.ceil(y0 / STEP), J1 = Math.floor(y1 / STEP);
  for (let j = J0; j <= J1; j++) for (let i = I0; i < I1; i++) {
    if (river(j) || lake(i, j) || lake(i + 1, j)) continue;
    ways.push({ type: "way", id: id++, nodes: [node(i, j), node(i + 1, j)], tags: tags(i, j) });
  }
  for (let i = I0; i <= I1; i++) for (let j = J0; j < J1; j++) {
    if (((river(j) || river(j + 1)) && i % 12 !== 0) || lake(i, j) || lake(i, j + 1)) continue;
    ways.push({ type: "way", id: id++, nodes: [node(i, j), node(i, j + 1)], tags: tags(i, j) });
  }
  return { elements: [...ways, ...nodes.values()] };
}

const HEART = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="white"/>
<path d="M150 260 C 40 180 10 120 40 75 C 70 30 130 40 150 90 C 170 40 230 30 260 75 C 290 120 260 180 150 260 Z" fill="black"/></svg>`;

async function scenario(browser, name, { mountains, lake, maxKm = 20, after }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", r => {
    const u = r.request().url();
    const json = body => r.fulfill({ body: JSON.stringify(body), contentType: "application/json" });
    if (u.includes("leaflet.min.js")) return r.fulfill({ body: fs.readFileSync(path.join(LEAFLET, "leaflet.js")), contentType: "text/javascript" });
    if (u.includes("leaflet.min.css")) return r.fulfill({ body: fs.readFileSync(path.join(LEAFLET, "leaflet.css")), contentType: "text/css" });
    if (u.includes("/interpreter")) {
      const q = decodeURIComponent(r.request().postData().slice(5));
      return json(fakeCity(q.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/).slice(1).map(Number), { lake }));
    }
    if (u.includes("nominatim") && u.includes("/search")) return json([{ lat: String(LAT0), lon: String(LON0) }]);
    if (u.includes("nominatim") && u.includes("/reverse")) return json({ address: { city: "서울특별시" }, boundingbox: ["37.41", "37.70", "126.76", "127.18"] });
    if (u.includes("open-meteo")) { const n = new URL(u).searchParams.get("latitude").split(",").length; return json({ elevation: Array.from({ length: n }, (_, i) => 30 + 10 * Math.sin(i / 5)) }); }
    if (u.startsWith(PAGE)) return r.continue();
    return r.fulfill({ status: 404, body: "" }); // fonts, map tiles
  });
  await page.goto(PAGE);
  if (!(await page.isDisabled("#goBtn"))) throw new Error("button should start disabled");
  await page.fill("#addr", "서울시청");
  await page.click("#findBtn");
  await page.waitForFunction(() => document.getElementById("startStatus").textContent.startsWith("Start"));
  await page.setInputFiles("#file", { name: "heart.svg", mimeType: "image/svg+xml", buffer: Buffer.from(HEART) });
  await page.waitForTimeout(300);
  if (!(await page.isDisabled("#goBtn"))) throw new Error("button must wait for the mountain question");
  await page.fill("#maxKm", String(maxKm));
  await page.check(`input[name=mtn][value=${mountains ? "yes" : "no"}]`);
  await page.click("#goBtn");
  await page.waitForFunction(() => !document.getElementById("goStatus").dataset.busy && /Done|Couldn|busy/.test(document.getElementById("goStatus").textContent), null, { timeout: 120000 });
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => ({
    status: goStatus.textContent, note: areaNote.textContent,
    options: [...document.querySelectorAll(".cand")].map(b => b.textContent),
    km: parseFloat(sDist.textContent), trailKm: parseFloat(sTrail.textContent), match: parseInt(sMatch.textContent),
  }));
  if (after) out.after = await after(page, context);
  await context.close();
  return { name, errors, ...out };
}

async function followAndSave(page, context) {
  const res = {}, shots = process.env.SHOTS; // optional folder for screenshots
  if (shots) await page.screenshot({ path: path.join(shots, "results.png"), fullPage: true });
  await context.grantPermissions(["geolocation"], { origin: new URL(PAGE).origin });
  const pt = await page.evaluate(() => { const ll = S.cands[S.sel].ll; return ll[Math.floor(ll.length * 0.3)]; });
  await context.setGeolocation({ latitude: pt[0], longitude: pt[1], accuracy: 8 });
  await page.click("#followBtn");
  await page.waitForFunction(() => document.getElementById("fState").textContent === "On route", null, { timeout: 10000 });
  res.done = parseFloat(await page.textContent("#fDone"));
  if (shots) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(shots, "follow.png") }); }
  res.left = parseFloat(await page.textContent("#fLeft"));
  await context.setGeolocation({ latitude: pt[0], longitude: pt[1] + 300 / 88000, accuracy: 8 }); // ~300 m east
  await page.waitForFunction(() => document.getElementById("fState").textContent.startsWith("Off route"), null, { timeout: 10000 });
  res.offRoute = true;
  const dl = page.waitForEvent("download");
  await page.click("#fShare"); // headless Chromium has no share sheet, so this falls back to a download
  const file = await dl;
  res.gpx = fs.readFileSync(await file.path(), "utf8");
  res.gpxName = file.suggestedFilename();
  await page.click("#fExit");
  res.savedBefore = await page.locator("#savedList li").count();
  await page.reload();
  res.savedAfterReload = await page.locator("#savedList li").count();
  await page.click("#savedList li .danger");
  res.armed = await page.textContent("#savedList li .danger");
  await page.click("#savedList li .danger");
  res.savedAfterDelete = await page.locator("#savedList li").count();
  return res;
}

// A phone screenshot of a line-art character: white background, a thin black outline,
// status-bar text at the top and a solid black bar along the bottom edge.
const SCREENSHOT = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="650"><rect width="300" height="650" fill="white"/>
<rect x="20" y="12" width="40" height="8" fill="black"/><rect x="230" y="12" width="50" height="8" fill="black"/>
<g stroke="black" stroke-width="5" fill="white" stroke-linejoin="round">
<path d="M70 230 L80 150 L130 195 Z"/><path d="M230 230 L220 150 L170 195 Z"/>
<rect x="95" y="300" width="110" height="170" rx="20"/><ellipse cx="150" cy="260" rx="100" ry="80"/></g>
<circle cx="115" cy="255" r="8" fill="black"/><circle cx="185" cy="255" r="8" fill="black"/>
<rect x="0" y="590" width="300" height="60" fill="black"/></svg>`;

async function traceCheck(browser) {
  const page = await browser.newPage();
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.includes("leaflet.min.js")) return r.fulfill({ body: fs.readFileSync(path.join(LEAFLET, "leaflet.js")), contentType: "text/javascript" });
    return u.startsWith(PAGE) ? r.continue() : r.fulfill({ status: 404, body: "" });
  });
  await page.goto(PAGE);
  await page.setInputFiles("#file", { name: "screenshot.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SCREENSHOT) });
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => {
    let a = [1e9, 1e9, -1e9, -1e9];
    for (const [x, y] of S.contour) { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; }
    return { aspect: (a[2] - a[0]) / (a[3] - a[1]) };
  });
  await page.close();
  return box;
}

async function installCheck(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  const page = await context.newPage();
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.includes("leaflet.min.js")) return r.fulfill({ body: fs.readFileSync(path.join(LEAFLET, "leaflet.js")), contentType: "text/javascript" });
    return u.startsWith(PAGE) ? r.continue() : r.fulfill({ status: 404, body: "" });
  });
  await page.goto(PAGE);
  const res = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 8000))]);
    const man = await (await fetch(document.querySelector("link[rel=manifest]").href)).json();
    const icons = await Promise.all(["icon-180.png", ...man.icons.map(i => i.src)].map(async s => (await fetch(s)).ok));
    return { sw: reg, display: man.display, icons: icons.every(Boolean), touchIcon: !!document.querySelector("link[rel=apple-touch-icon]"),
      tip: !document.getElementById("installTip").hidden };
  });
  await context.close();
  return res;
}

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  PAGE = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const checks = [];
  const ok = (cond, msg) => checks.push([!!cond, msg]);
  const a = await scenario(browser, "neighborhood, trails allowed", { mountains: true, after: followAndSave });
  ok(a.status.startsWith("Done"), `${a.name}: finished (${a.status})`);
  ok(a.match >= 70, `${a.name}: shape match ${a.match}% >= 70%`);
  ok(a.km > 2 && a.km <= 20, `${a.name}: distance ${a.km} km within 20 km`);
  ok(a.note.includes("neighborhood"), `${a.name}: stayed in the neighborhood`);
  const b = await scenario(browser, "neighborhood, streets only", { mountains: false });
  ok(b.status.startsWith("Done"), `${b.name}: finished`);
  ok(b.trailKm === 0, `${b.name}: no trail used (${b.trailKm} km)`);
  const c = await scenario(browser, "lake around start, city fallback", { mountains: true, lake: true });
  ok(c.status.startsWith("Done"), `${c.name}: finished`);
  ok(c.note.includes("서울특별시"), `${c.name}: moved elsewhere in the city`);
  ok(c.match >= 70, `${c.name}: shape match ${c.match}% >= 70%`);
  const d = await scenario(browser, "short limit", { mountains: true, maxKm: 6 });
  ok(d.status.startsWith("Done") && d.km <= 6, `${d.name}: respects a 6 km limit (${d.km} km)`);
  const f = a.after;
  ok(f.done > 0 && f.left > 0, `follow: progress shown (${f.done} km done, ${f.left} km to go)`);
  ok(f.offRoute, "follow: warns when 300 m off the route");
  ok(/<trkpt lat=/.test(f.gpx) && f.gpx.includes("<gpx"), `share: GPX file produced (${f.gpxName})`);
  ok(f.savedBefore === 1 && f.savedAfterReload === 1, "my routes: route saved and still there after reopening");
  ok(f.armed.includes("again") && f.savedAfterDelete === 0, "my routes: delete asks for a second tap, then removes it");
  const tr = await traceCheck(browser);
  ok(tr.aspect > 0.45 && tr.aspect < 1.2, `trace: screenshot picks the character, not the bottom bar (aspect ${tr.aspect.toFixed(2)})`);
  const i = await installCheck(browser);
  ok(i.sw, "install: offline service worker active");
  ok(i.display === "standalone" && i.icons && i.touchIcon, "install: manifest and home-screen icons in place");
  ok(i.tip, "install: iPhone Safari shows the Add to Home Screen tip");
  for (const s of [a, b, c, d]) ok(!s.errors.length, `${s.name}: no script errors ${s.errors.join("; ")}`);
  await browser.close(); server.close();
  for (const [pass, msg] of checks) console.log(pass ? "PASS" : "FAIL", msg);
  for (const s of [a, b, c, d]) console.log(`  ${s.name}: ${s.options.join(" | ")}`);
  process.exit(checks.every(c => c[0]) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
