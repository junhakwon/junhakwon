// Draws the app icons (a heart traced along a street grid) into PNGs.
//   node tools/make-icons.js
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  for (const size of [180, 192, 512]) {
    const data = await p.evaluate(size => {
      const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"), s = size / 100;
      g.fillStyle = "#2347ff"; g.fillRect(0, 0, size, size);
      // faint street grid
      g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = 1.2 * s;
      for (let v = 14; v <= 86; v += 8) { g.beginPath(); g.moveTo(v * s, 10 * s); g.lineTo(v * s, 90 * s); g.stroke(); g.beginPath(); g.moveTo(10 * s, v * s); g.lineTo(90 * s, v * s); g.stroke(); }
      // heart, snapped to the grid like a real route (stays inside the maskable safe zone)
      const pts = [[50,78],[50,74],[46,74],[46,70],[38,70],[38,62],[30,62],[30,54],[26,54],[26,38],[30,38],[30,30],[42,30],[42,34],[46,34],[46,38],[50,38],[50,34],[54,34],[54,30],[70,30],[70,38],[74,38],[74,54],[70,54],[70,62],[62,62],[62,70],[54,70],[54,74],[50,74]];
      g.strokeStyle = "#fff"; g.lineWidth = 6 * s; g.lineJoin = "round"; g.lineCap = "round";
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)); g.stroke();
      g.fillStyle = "#18211c"; g.strokeStyle = "#fff"; g.lineWidth = 2.5 * s;
      g.beginPath(); g.arc(50 * s, 78 * s, 5 * s, 0, 7); g.fill(); g.stroke();
      return c.toDataURL("image/png");
    }, size);
    fs.writeFileSync(path.join(__dirname, "..", `icon-${size}.png`), Buffer.from(data.split(",")[1], "base64"));
  }
  await b.close();
})();
