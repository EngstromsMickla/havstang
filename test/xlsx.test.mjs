// Läser den påhittade exempelfilen, gör ändringar som på ett möte och kontrollerar den nya filen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { lasArbetsbok, skrivArbetsbok, andringar, nyttFilnamn } from "../publik/xlsx.js";
import { nastaNummer } from "../publik/regler.js";

const env = { JSZip, DOMParser, XMLSerializer };
const EXEMPEL = new URL("../publik/exempel/Exempel_logg_havstangspunkter.xlsx", import.meta.url);
const las = () => lasArbetsbok(fs.readFileSync(EXEMPEL), env);

test("Exempelfilen läses med alla kolumner och rullgardiner", async () => {
  const bok = await las();
  assert.equal(bok.bladNamn, "Logg");
  assert.equal(bok.punkter.length, 12);
  assert.equal(bok.kolumner.nr, "A");
  assert.equal(bok.kolumner.havstang, "F");
  assert.equal(bok.kolumner.uppdaterad, "O");
  assert.deepEqual(bok.listor.val, ["Ta upp nu", "Bevaka", "Parkera", "Klar"]);
  assert.equal(bok.punkter[0].nr, "HP-001");
});

test("Mötets ändringar hamnar i rätt celler och resten lämnas orört", async () => {
  const bok = await las();
  const [a, , , d] = bok.punkter;
  a.val = "Ta upp nu";
  a.nasta = "Anna ringer kommunen, v. 44 <&>";
  d.havstang = "Hög"; d.fonsterNu = "Öppet nu";
  bok.punkter.push({ nr: nastaNummer(bok.punkter), titel: "Ny punkt", laset: "Rad ett\nRad två", vem: "", skifte: "3 Samspel", havstang: "Medel", rackvidd: "Hög", fonster: "", fonsterNu: "Snart", val: "Bevaka", nasta: "", lardom: "", kalla: "", uppdaterad: "", forslag: "", rad: null, original: null });
  assert.equal(andringar(bok.punkter).length, 5);

  const ut = await skrivArbetsbok(bok, bok.punkter, env, { datum: "2026-10-15" });
  const ny = await lasArbetsbok(ut, env);
  assert.equal(ny.punkter.length, 13);
  assert.equal(ny.punkter[0].val, "Ta upp nu");
  assert.equal(ny.punkter[0].nasta, "Anna ringer kommunen, v. 44 <&>");
  assert.equal(ny.punkter[0].uppdaterad, "2026-10-15");
  assert.equal(ny.punkter[0].forslag, "Ta upp nu");
  assert.equal(ny.punkter[3].forslag, "Ta upp nu");
  assert.equal(ny.punkter[1].uppdaterad, "2026-10-02");
  const n = ny.punkter[12];
  assert.equal(n.nr, "HP-013");
  assert.equal(n.rad, 17);
  assert.equal(n.laset, "Rad ett\nRad två");
  assert.equal(n.forslag, "Parkera");

  const zip = await JSZip.loadAsync(ut);
  const wb = await zip.file("xl/workbook.xml").async("string");
  assert.match(wb, /fullCalcOnLoad="1"/);
  assert.match(wb, /name="Mötet 2026-10-15"/);
  const ct = await zip.file("[Content_Types].xml").async("string");
  assert.match(ct, /sheet4\.xml/);
  // Översikt visar läget efter mötet: HP-004 har flyttat till Hög × Öppet nu, nya HP-013 ligger i Medel × Snart.
  const s2 = await zip.file("xl/worksheets/sheet2.xml").async("string");
  const d2 = new DOMParser().parseFromString(s2, "application/xml");
  const varde = (ref) => {
    const c = Array.from(d2.getElementsByTagName("c")).find((x) => x.getAttribute("r") === ref);
    const v = c && c.getElementsByTagName("v")[0];
    return v ? v.textContent : null;
  };
  assert.equal(varde("B5"), "HP-001 Lärande som stannar i projekten\nHP-003 Återbruk av stomme vid ombyggnad\nHP-004 Kvällstrafik till ytterområden\nHP-009 Pengar för åtgärder före ny infrastruktur");
  assert.equal(varde("D6"), "");
  assert.match(varde("C6"), /HP-013 Ny punkt$/);
  assert.match(varde("E5"), /HP-007 Lägre hastighet som standard i tätort \*/);
  assert.match(s2, /TEXTJOIN/);
  // Instruktionen, stilarna och de delade texterna är oförändrade.
  const orig = await JSZip.loadAsync(fs.readFileSync(EXEMPEL));
  for (const f of ["xl/worksheets/sheet3.xml", "xl/styles.xml", "xl/sharedStrings.xml"]) {
    assert.equal(await zip.file(f).async("string"), await orig.file(f).async("string"), f);
  }
  // Rullgardiner och färgregler finns kvar i loggen.
  const s1 = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(s1, /<dataValidations count="4">/);
  assert.match(s1, /<conditionalFormatting/);
});

test("Ett inspel med bara det man vet kommer med i filen", async () => {
  const bok = await las();
  const nr = nastaNummer(bok.punkter);
  bok.punkter.push({ nr, titel: "", laset: "Ingen äger frågan om ungas resor.", vem: "", skifte: "", havstang: "", rackvidd: "", fonster: "", fonsterNu: "", forslag: "", val: "", nasta: "", lardom: "", kalla: "Inspel på mötet 2026-10-15", uppdaterad: "", rad: null, original: null });
  const lista = andringar(bok.punkter);
  assert.equal(lista.length, 1, "ett nytt inspel ska vara en enda ändring");
  assert.equal(lista[0].falt, "Nytt inspel");
  assert.equal(lista[0].efter, "Låset: Ingen äger frågan om ungas resor.\nKälla: Inspel på mötet 2026-10-15");
  const ny = await lasArbetsbok(await skrivArbetsbok(bok, bok.punkter, env, { datum: "2026-10-15" }), env);
  const p = ny.punkter.find((x) => x.nr === nr);
  assert.ok(p, "inspelet saknas i den nya filen");
  assert.equal(p.titel, "");
  assert.equal(p.laset, "Ingen äger frågan om ungas resor.");
  assert.equal(p.kalla, "Inspel på mötet 2026-10-15");
  assert.equal(p.uppdaterad, "2026-10-15");
  assert.equal(p.forslag, "");
});

test("Två nedladdningar i rad ger samma resultat", async () => {
  const bok = await las();
  bok.punkter[0].val = "Klar";
  const a = await lasArbetsbok(await skrivArbetsbok(bok, bok.punkter, env, { datum: "2026-10-15" }), env);
  const b = await lasArbetsbok(await skrivArbetsbok(bok, bok.punkter, env, { datum: "2026-10-15" }), env);
  assert.deepEqual(a.punkter.map((p) => p.val), b.punkter.map((p) => p.val));
  assert.equal(a.alla.length, 4);
});

test("Filnamnet får mötesdatum", () => {
  assert.equal(nyttFilnamn("Logg_v5.xlsx", "2026-10-15"), "Logg_v5_mote_2026-10-15.xlsx");
  assert.equal(nyttFilnamn("Logg_v5_mote_2026-10-01.xlsx", "2026-10-15"), "Logg_v5_mote_2026-10-15.xlsx");
});

test("Fel fil ger begripligt besked", async () => {
  await assert.rejects(() => lasArbetsbok(Buffer.from("inte en zip"), env), /Excel-fil/);
});
