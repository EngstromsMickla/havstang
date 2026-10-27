// Kontroller före publicering: inga externa resurser, ingen innerHTML, inga tankstreck i texterna.
import fs from "node:fs";
import path from "node:path";

const rot = new URL("../publik/", import.meta.url).pathname;
const fel = [];
const tillatnaAdresser = [/^http:\/\/schemas\.openxmlformats\.org\//, /^http:\/\/www\.w3\.org\//];

function gaIgenom(dir) {
  for (const namn of fs.readdirSync(dir)) {
    const fil = path.join(dir, namn);
    if (fs.statSync(fil).isDirectory()) { gaIgenom(fil); continue; }
    if (fil.includes(`${path.sep}vendor${path.sep}`)) continue;
    if (!/\.(html|js|css)$/.test(fil)) continue;
    const text = fs.readFileSync(fil, "utf8");
    const kort = path.relative(rot, fil);
    for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
      if (!tillatnaAdresser.some((r) => r.test(m[0]))) fel.push(`${kort}: extern adress ${m[0]}`);
    }
    if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(text)) fel.push(`${kort}: HTML läggs in som kod`);
    if (/\beval\(|new Function\(/.test(text)) fel.push(`${kort}: eval eller new Function`);
    if (/[–—]/.test(text)) fel.push(`${kort}: tankstreck i texten`);
  }
}
gaIgenom(rot);
const html = fs.readFileSync(path.join(rot, "index.html"), "utf8");
if (!/Content-Security-Policy[^>]*default-src 'none'/.test(html)) fel.push("index.html: Content Security Policy saknas");
for (const f of ["img/mickla.png", "vendor/jszip.min.js", "exempel/Testa_sjalv_havstangskartan_2026-10-27.xlsx", "CNAME"]) {
  if (!fs.existsSync(path.join(rot, f))) fel.push(`saknas: publik/${f}`);
}
const xlsx = fs.readdirSync(path.join(rot, "exempel"));
for (const f of xlsx) if (!/^Testa_sjalv_/.test(f)) fel.push(`publik/exempel/${f}: bara testfilen med offentliga inspel får ligga här`);

if (fel.length) { console.error("Kontrollen hittade problem:\n" + fel.map((f) => " - " + f).join("\n")); process.exit(1); }
console.log("Kontrollen gick igenom.");
