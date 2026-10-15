// Reglerna i loggen, samma som formeln i kolumnen Förslag i Excel-mallen.
// Ändras regeln i mallen ska den ändras här också, och testet i test/regler.test.mjs.

export const SKALA = ["Hög", "Medel", "Låg"];
export const FONSTER = ["Öppet nu", "Snart", "Stängt", "Vet ej"];
export const SKIFTEN = ["1 Cirkulärt", "2 Mobilitet", "3 Samspel", "Tvärgående"];
export const VAL = ["Ta upp nu", "Bevaka", "Parkera", "Klar"];
export const FORSLAG = ["Ta upp nu", "Bevaka fönster", "Parkera"];

// Fälten i en hävstångspunkt och rubrikerna de har i mallen.
// "match" jämförs med början av rubriken, utan hänsyn till stora och små bokstäver.
export const FALT = [
  { id: "nr", rubrik: "Nr", match: ["nr"] },
  { id: "titel", rubrik: "Hävstångspunkt", match: ["hävstångspunkt"] },
  { id: "laset", rubrik: "Låset", match: ["låset"] },
  { id: "vem", rubrik: "Vem kan agera", match: ["vem kan agera"] },
  { id: "skifte", rubrik: "Skifte", match: ["skifte"] },
  { id: "havstang", rubrik: "Hävstång", match: ["hävstång"], exakt: true },
  { id: "rackvidd", rubrik: "Räckvidd", match: ["räckvidd"] },
  { id: "fonster", rubrik: "Fönster: vad öppnar sig?", match: ["fönster:", "fönster "], inte: ["fönster nu"] },
  { id: "fonsterNu", rubrik: "Fönster nu?", match: ["fönster nu"] },
  { id: "forslag", rubrik: "Förslag", match: ["förslag"] },
  { id: "val", rubrik: "Gruppens val", match: ["gruppens val"] },
  { id: "nasta", rubrik: "Nästa steg och ansvarig", match: ["nästa steg"] },
  { id: "lardom", rubrik: "Lärdom efter cykeln", match: ["lärdom"] },
  { id: "kalla", rubrik: "Källa", match: ["källa"] },
  { id: "uppdaterad", rubrik: "Uppdaterad", match: ["uppdaterad"] },
];

// Fält som gruppen kan ändra på mötet. Nr sätts av verktyget, Förslag räknas, Uppdaterad sätts vid ändring.
export const REDIGERBARA = ["titel", "laset", "vem", "skifte", "havstang", "rackvidd", "fonster", "fonsterNu", "val", "nasta", "lardom", "kalla"];

export function forslag(p) {
  if (!p || !String(p.titel || "").trim()) return "";
  if (p.fonsterNu === "Öppet nu" && p.havstang !== "Låg" && p.rackvidd !== "Låg") return "Ta upp nu";
  if (p.havstang === "Hög") return "Bevaka fönster";
  return "Parkera";
}

// Ordningen i mötesläget: förslag först, sedan hög hävstång, sedan räckvidd, sedan nummer.
export function motesordning(a, b) {
  const f = (p) => { const i = FORSLAG.indexOf(forslag(p)); return i < 0 ? 9 : i; };
  const s = (v) => { const i = SKALA.indexOf(v); return i < 0 ? 9 : i; };
  return f(a) - f(b) || s(a.havstang) - s(b.havstang) || s(a.rackvidd) - s(b.rackvidd) || String(a.nr).localeCompare(String(b.nr), "sv", { numeric: true });
}

export function nastaNummer(punkter) {
  let max = 0;
  let prefix = "HP-";
  let bredd = 3;
  for (const p of punkter) {
    const m = /^(.*?)(\d+)\s*$/.exec(String(p.nr || ""));
    if (m) {
      const n = parseInt(m[2], 10);
      if (n >= max) { max = n; prefix = m[1] || prefix; bredd = Math.max(bredd, m[2].length); }
    }
  }
  return prefix + String(max + 1).padStart(bredd, "0");
}

export function idag(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
