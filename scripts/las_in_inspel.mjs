// För in inspel från mejl i loggen.
//
//   node scripts/las_in_inspel.mjs <logg.xlsx> <mejl1.txt> [mejl2.txt ...] [--datum ÅÅÅÅ-MM-DD] [--ut ny.xlsx]
//
// Mejlen ska vara ren text (inklistrad text, eller .eml som först gjorts om till text).
// Varje "--- INSPEL v1 ---"-block blir ett inspel. Den nya filen får fliken "Inspel <datum>" med vad som ändrades
// och de förslag som inte fördes in automatiskt. Originalfilen ändras inte.
// Körs lokalt av Dan eller Claude; inga loggar eller mejl läggs någonsin i repot.

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { lasArbetsbok, skrivArbetsbok, andringar } from "../publik/xlsx.js";
import { lasMejl, applicera } from "../publik/inspel.js";
import { idag } from "../publik/regler.js";

const env = { JSZip, DOMParser, XMLSerializer };
const args = process.argv.slice(2);
const flagga = (namn) => { const i = args.indexOf(namn); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const datum = flagga("--datum") || idag();
let ut = flagga("--ut");
const [logg, ...mejlfiler] = args;
if (!logg || !mejlfiler.length) {
  console.error("Användning: node scripts/las_in_inspel.mjs <logg.xlsx> <mejl.txt> [fler] [--datum ÅÅÅÅ-MM-DD] [--ut ny.xlsx]");
  process.exit(1);
}

const bok = await lasArbetsbok(fs.readFileSync(logg), env);
const inspel = [];
for (const f of mejlfiler) {
  const hittade = lasMejl(fs.readFileSync(f, "utf8"));
  if (!hittade.length) console.warn(`Inget inspel hittades i ${path.basename(f)}.`);
  for (const d of hittade) inspel.push({ ...d, fil: path.basename(f) });
}
const { noteringar, resultat } = applicera(bok.punkter, inspel, { datum });
ut = ut || logg.replace(/\.xlsx$/i, "").replace(/_(mote|inspel)_\d{4}-\d{2}-\d{2}$/, "") + `_inspel_${datum}.xlsx`;
fs.writeFileSync(ut, await skrivArbetsbok(bok, bok.punkter, env, { datum, fliknamn: "Inspel", noteringar }));

console.log(`${inspel.length} inspel från ${mejlfiler.length} mejl.`);
for (const r of resultat) console.log(`  ${r.nr}: ${r.typ === "ny" ? "ny punkt" : "tillägg i befintlig punkt"}`);
if (noteringar.length) {
  console.log("Förslag som gruppen behöver ta ställning till (står på fliken Inspel):");
  for (const n of noteringar) console.log(`  ${n.nr} ${n.falt}: ${n.fore} → ${n.efter}`);
}
console.log(`${andringar(bok.punkter).length} ändringar. Ny fil: ${ut}`);
