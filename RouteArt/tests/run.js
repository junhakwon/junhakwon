// End-to-end tests for Route Art. They drive the real page in headless Chromium,
// with every network service (OpenStreetMap, address search, elevation) replaced
// by a fake city: a street grid with a river, a mountain with trails, and
// optionally a lake around the start so the city-wide search has to kick in.
//
//   cd RouteArt && npm install && npx playwright install chromium && npm test
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const PAGE = "file://" + path.resolve(__dirname, "..", "index.html");
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

async function scenario(browser, name, { mountains, lake, maxKm = 20 }) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
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
    if (u.startsWith("file:")) return r.continue();
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
    gpx: dlBtn.href.startsWith("blob:"),
  }));
  await page.close();
  return { name, errors, ...out };
}

(async () => {
  const browser = await chromium.launch();
  const checks = [];
  const ok = (cond, msg) => checks.push([!!cond, msg]);
  const a = await scenario(browser, "neighborhood, trails allowed", { mountains: true });
  ok(a.status.startsWith("Done"), `${a.name}: finished (${a.status})`);
  ok(a.match >= 70, `${a.name}: shape match ${a.match}% >= 70%`);
  ok(a.km > 2 && a.km <= 20, `${a.name}: distance ${a.km} km within 20 km`);
  ok(a.note.includes("neighborhood"), `${a.name}: stayed in the neighborhood`);
  ok(a.gpx, `${a.name}: GPX ready`);
  const b = await scenario(browser, "neighborhood, streets only", { mountains: false });
  ok(b.status.startsWith("Done"), `${b.name}: finished`);
  ok(b.trailKm === 0, `${b.name}: no trail used (${b.trailKm} km)`);
  const c = await scenario(browser, "lake around start, city fallback", { mountains: true, lake: true });
  ok(c.status.startsWith("Done"), `${c.name}: finished`);
  ok(c.note.includes("서울특별시"), `${c.name}: moved elsewhere in the city`);
  ok(c.match >= 70, `${c.name}: shape match ${c.match}% >= 70%`);
  const d = await scenario(browser, "short limit", { mountains: true, maxKm: 6 });
  ok(d.status.startsWith("Done") && d.km <= 6, `${d.name}: respects a 6 km limit (${d.km} km)`);
  for (const s of [a, b, c, d]) ok(!s.errors.length, `${s.name}: no script errors ${s.errors.join("; ")}`);
  await browser.close();
  for (const [pass, msg] of checks) console.log(pass ? "PASS" : "FAIL", msg);
  for (const s of [a, b, c, d]) console.log(`  ${s.name}: ${s.options.join(" | ")}`);
  process.exit(checks.every(c => c[0]) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
