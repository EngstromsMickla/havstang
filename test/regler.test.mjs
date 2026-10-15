import { test } from "node:test";
import assert from "node:assert/strict";
import { forslag, nastaNummer, motesordning } from "../publik/regler.js";

const p = (havstang, rackvidd, fonsterNu, titel = "Punkt") => ({ titel, havstang, rackvidd, fonsterNu });

test("Förslag följer formeln i Excel-mallen", () => {
  assert.equal(forslag(p("Hög", "Hög", "Öppet nu")), "Ta upp nu");
  assert.equal(forslag(p("Medel", "Medel", "Öppet nu")), "Ta upp nu");
  assert.equal(forslag(p("Hög", "Låg", "Öppet nu")), "Bevaka fönster");
  assert.equal(forslag(p("Medel", "Låg", "Öppet nu")), "Parkera");
  assert.equal(forslag(p("Låg", "Hög", "Öppet nu")), "Parkera");
  assert.equal(forslag(p("Hög", "Hög", "Snart")), "Bevaka fönster");
  assert.equal(forslag(p("Medel", "Hög", "Snart")), "Parkera");
  assert.equal(forslag(p("Hög", "Hög", "Öppet nu", "")), "");
});

test("Nästa nummer fortsätter serien", () => {
  assert.equal(nastaNummer([{ nr: "HP-001" }, { nr: "HP-025" }, { nr: "HP-007" }]), "HP-026");
  assert.equal(nastaNummer([]), "HP-001");
});

test("Mötesordningen sätter Ta upp nu först", () => {
  const lista = [p("Hög", "Hög", "Snart"), p("Medel", "Hög", "Öppet nu"), p("Hög", "Hög", "Öppet nu")].map((x, i) => ({ ...x, nr: "HP-00" + (i + 1) }));
  assert.deepEqual(lista.sort(motesordning).map((x) => x.nr), ["HP-003", "HP-002", "HP-001"]);
});
