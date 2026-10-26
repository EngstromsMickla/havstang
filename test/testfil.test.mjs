// Testfilen på sajten (Testa själv) och översättningen av gamla skiftesnamn.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { lasArbetsbok } from "../publik/xlsx.js";
import { SKIFTEN, skifteNamn } from "../publik/regler.js";
import { lasMejl } from "../publik/inspel.js";

const env = { JSZip, DOMParser, XMLSerializer };
const TESTFIL = new URL("../publik/exempel/Testa_sjalv_havstangskartan_2026-10-26.xlsx", import.meta.url);
const GAMMAL = new URL("./fixtures/Exempel_logg_havstangspunkter.xlsx", import.meta.url);

test("Gamla skiftesnamn översätts när en äldre fil läses in", async () => {
  const bok = await lasArbetsbok(fs.readFileSync(GAMMAL), env);
  assert.ok(bok.punkter.every((p) => !p.skifte || SKIFTEN.includes(p.skifte)));
  assert.deepEqual(bok.listor.skifte, SKIFTEN);
  assert.equal(bok.punkter.find((p) => p.nr === "HP-002").original.skifte, "2 Ny frihetsreform för resande");
  assert.equal(skifteNamn("3 Samspel"), "3 Byggd miljö möter mobilitet");
  assert.equal(lasMejl("--- INSPEL v1 ---\nSkifte: 1 Cirkulärt\n--- SLUT ---")[0].skifte, "1 Cirkulärt byggande");
});

test("Testfilen har offentliga inspel, nya skiftesnamn och inga interna uppgifter", async () => {
  const data = fs.readFileSync(TESTFIL);
  const bok = await lasArbetsbok(data, env);
  assert.equal(bok.punkter.length, 45);
  assert.ok(bok.punkter.every((p) => SKIFTEN.includes(p.skifte)));
  assert.ok(bok.punkter.every((p) => !p.val && !p.nasta && !p.lardom), "Gruppens val, Nästa steg och Lärdom ska vara tomma");
  assert.deepEqual(bok.alla, ["Logg", "Översikt", "Så använder vi loggen"]);
  const zip = await JSZip.loadAsync(data);
  for (const f of Object.keys(zip.files)) {
    if (zip.files[f].dir) continue;
    const t = await zip.file(f).async("string");
    assert.doesNotMatch(t, /genom samtal|absPath|Dan Engström|_v3\.xlsx/i, f);
  }
});
