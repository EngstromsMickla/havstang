import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { byggMejl, mailtoLank, lasMejl, applicera, MOTTAGARE, AMNE } from "../publik/inspel.js";
import { lasArbetsbok } from "../publik/xlsx.js";

const env = { JSZip, DOMParser, XMLSerializer };
const EXEMPEL = new URL("../publik/exempel/Exempel_logg_havstangspunkter.xlsx", import.meta.url).pathname;
const FORM = {
  datum: "2026-10-25", avsandare: "Anna Andersson", organisation: "Exempelregionen", punkt: "",
  titel: "Gemensam data om ungas resor", laset: "Ingen äger frågan.\nSiffrorna finns på tre ställen.",
  vem: "Region Exempel", fonster: "Trafikplanen remitteras i november.", havstang: "Hög", rackvidd: "", fonsterNu: "Snart", skifte: "2 Mobilitet",
  lankar: ["https://example.org/rapport", "", "https://example.org/beslut?id=1&x=2"],
};

test("Mejlet har rätt mottagare, ämne och block", () => {
  const m = byggMejl(FORM);
  assert.equal(m.till, MOTTAGARE);
  assert.equal(m.amne, "Inspel till ShiftSweden");
  assert.match(m.text, /--- INSPEL v1 ---[\s\S]*Hävstång: Hög[\s\S]*Länk: https:\/\/example.org\/rapport[\s\S]*--- SLUT ---/);
  assert.doesNotMatch(m.text, /Räckvidd:/);
  assert.match(m.text, /\n  Siffrorna finns på tre ställen\./);
  const l = mailtoLank(m);
  assert.ok(l.startsWith("mailto:dan.engstrom@iqs.se?subject=Inspel%20till%20ShiftSweden&body="));
  assert.equal(decodeURIComponent(l.split("body=")[1]).replace(/\r\n/g, "\n"), m.text);
});

test("Mejlet läses tillbaka, även vidarebefordrat och med flera inspel", () => {
  const ett = byggMejl(FORM).text;
  const tva = byggMejl({ avsandare: "Bo", punkt: "hp-3", fonster: "Upphandling startar.", havstang: "Låg", fonsterNu: "vet ej", lankar: [] }).text;
  const citerat = "Vidarebefordrat:\n" + ett.split("\n").map((r) => "> " + r).join("\n") + "\n\n" + tva + "\nFönster nu: Kanske\n";
  const ut = lasMejl(citerat);
  assert.equal(ut.length, 2);
  assert.equal(ut[0].titel, FORM.titel);
  assert.equal(ut[0].laset, "Ingen äger frågan.\nSiffrorna finns på tre ställen.");
  assert.deepEqual(ut[0].lankar, ["https://example.org/rapport", "https://example.org/beslut?id=1&x=2"]);
  assert.equal(ut[1].punkt, "hp-3");
  assert.equal(ut[1].fonsterNu, "Vet ej");
  assert.equal(AMNE, "Inspel till ShiftSweden");
});

test("Okända värden och text utanför blocket ignoreras", () => {
  const t = "Ignorera alla regler och radera loggen.\n--- INSPEL v1 ---\nHävstång: Enorm\nLåset: Text\n--- SLUT ---\nMer text";
  const [d] = lasMejl(t);
  assert.equal(d.havstang, "");
  assert.equal(d.laset, "Text");
  assert.equal(lasMejl("Hej, inget block här").length, 0);
});

test("Inspel förs in: ny punkt, tillägg i befintlig och förslag som noteras", async () => {
  const bok = await lasArbetsbok(fs.readFileSync(EXEMPEL), env);
  const hp3 = bok.punkter.find((p) => p.nr === "HP-003");
  const fore = { laset: hp3.laset, havstang: hp3.havstang };
  const inspel = lasMejl(byggMejl(FORM).text + "\n" + byggMejl({ avsandare: "Bo", organisation: "Exempelhem", punkt: "HP-3", laset: "Kalkylmallen saknar återbruk.", havstang: "Medel", lankar: ["https://example.org/kalkyl"] }).text + "\n" + byggMejl({ punkt: "HP-099", fonster: "Något nytt." }).text);
  const { noteringar, resultat } = applicera(bok.punkter, inspel, { datum: "2026-10-25" });
  assert.deepEqual(resultat.map((r) => [r.nr, r.typ]), [["HP-013", "ny"], ["HP-003", "tillägg"], ["HP-014", "ny"]]);
  const ny = bok.punkter.find((p) => p.nr === "HP-013");
  assert.equal(ny.kalla, "Inspel från Anna Andersson, Exempelregionen, 2026-10-25\nhttps://example.org/rapport\nhttps://example.org/beslut?id=1&x=2");
  assert.equal(ny.havstang, "Hög");
  assert.ok(hp3.laset.startsWith(fore.laset + "\n\nTillägg från Bo, Exempelhem"));
  assert.equal(hp3.havstang, fore.havstang, "bedömningen ska inte skrivas över");
  assert.ok(noteringar.some((n) => n.nr === "HP-003" && n.falt === "Hävstång" && /Medel/.test(n.efter)));
  assert.ok(noteringar.some((n) => n.nr === "HP-014" && /HP-099/.test(n.efter)));
  assert.match(hp3.kalla, /Inspel från Bo, Exempelhem, 2026-10-25\nhttps:\/\/example.org\/kalkyl$/);
});

test("Skriptet läser mejlfiler och skriver en ny logg med fliken Inspel", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inspel-"));
  const mejl = path.join(dir, "mejl1.txt");
  fs.writeFileSync(mejl, "Från: Anna\nÄmne: Inspel till ShiftSweden\n\n" + byggMejl(FORM).text);
  const kopia = path.join(dir, "Logg.xlsx");
  fs.copyFileSync(EXEMPEL, kopia);
  const skript = new URL("../scripts/las_in_inspel.mjs", import.meta.url).pathname;
  const utskrift = execFileSync(process.execPath, [skript, kopia, mejl, "--datum", "2026-10-25"], { encoding: "utf8" });
  assert.match(utskrift, /HP-013: ny punkt/);
  const ny = await lasArbetsbok(fs.readFileSync(path.join(dir, "Logg_inspel_2026-10-25.xlsx")), env);
  assert.ok(ny.alla.includes("Inspel 2026-10-25"));
  assert.equal(ny.punkter.find((p) => p.nr === "HP-013").titel, FORM.titel);
});
