// Inspel via mejl: formuläret bygger ett mejl med ett fast block som går att läsa maskinellt,
// och samma modul läser blocken ur mejlen igen och för in dem i loggen.
// Allt som läses ur ett mejl behandlas som text, aldrig som instruktioner.

import { SKALA, FONSTER, SKIFTEN, nastaNummer, skifteNamn } from "./regler.js";

export const MOTTAGARE = "dan.engstrom@iqs.se";
export const AMNE = "Inspel till ShiftSweden";
export const START = "--- INSPEL v1 ---";
export const SLUT = "--- SLUT ---";
export const MAX_LANGD = 1800; // ungefärlig gräns för mejl som öppnas från en webbsida

// Nycklarna i blocket, i den ordning de skrivs. Fältnamnen i loggen står inom parentes i kommentaren.
export const NYCKLAR = [
  ["datum", "Datum"],
  ["avsandare", "Avsändare"],
  ["organisation", "Organisation"],
  ["punkt", "Gäller befintlig punkt"],
  ["titel", "Hävstångspunkt"],          // Hävstångspunkt
  ["laset", "Låset"],                   // Låset (en mening)
  ["vem", "Vem kan agera"],             // Vem kan agera
  ["fonster", "Fönster"],               // Fönster: vad öppnar sig?
  ["fonsterNu", "Fönster nu"],          // Fönster nu?
  ["havstang", "Hävstång"],             // Hävstång
  ["rackvidd", "Räckvidd"],             // Räckvidd
  ["skifte", "Skifte"],                 // Skifte
  ["lank", "Länk"],                     // läggs i Källa
];
const TEXTFALT = ["titel", "laset", "vem", "fonster"];
const VALFALT = { havstang: SKALA, rackvidd: SKALA, fonsterNu: FONSTER, skifte: SKIFTEN };

function ren(s) {
  return String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n?/g, "\n").trim();
}

// ---------- Bygga mejlet ----------

export function byggMejl(d) {
  const rader = [];
  for (const [id, nyckel] of NYCKLAR) {
    if (id === "lank") {
      for (const l of (d.lankar || []).map(ren).filter(Boolean)) rader.push(`${nyckel}: ${l}`);
      continue;
    }
    const v = ren(d[id]);
    if (!v) continue;
    // Följande rader dras in två steg, så att de aldrig kan tas för en ny nyckel.
    const [forsta, ...resten] = v.split("\n");
    rader.push(`${nyckel}: ${forsta}`, ...resten.map((r) => "  " + r));
  }
  const text = [
    "Hej Dan,",
    "",
    "Här är ett inspel till Hävstångskartan.",
    "",
    START,
    ...rader,
    SLUT,
    "",
    "Skapat på havstang.mickla.se.",
  ].join("\n");
  return { till: MOTTAGARE, amne: AMNE, text };
}

export function mailtoLank(mejl) {
  return `mailto:${mejl.till}?subject=${encodeURIComponent(mejl.amne)}&body=${encodeURIComponent(mejl.text.replace(/\n/g, "\r\n"))}`;
}

export function harInnehall(d) {
  return ["titel", "laset", "vem", "fonster", "havstang", "rackvidd", "fonsterNu", "skifte"].some((id) => ren(d[id])) || (d.lankar || []).some((l) => ren(l));
}

// ---------- Läsa mejlen ----------

export function lasMejl(text) {
  // Citattecken från vidarebefordrade svar tas bort, och HTML-mellanslag blir vanliga.
  const rader = String(text ?? "").replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n").map((r) => r.replace(/^(\s*>)+\s?/, ""));
  const ut = [];
  let i = 0;
  while (i < rader.length) {
    if (rader[i].trim() !== START) { i++; continue; }
    i++;
    const d = { lankar: [] };
    let aktuell = null;
    for (; i < rader.length && rader[i].trim() !== SLUT && rader[i].trim() !== START; i++) {
      const rad = rader[i];
      const indragen = /^\s/.test(rad);
      const traff = !indragen && NYCKLAR.find(([, n]) => rad.toLowerCase().startsWith(n.toLowerCase() + ":"));
      if (traff) {
        const [id, n] = traff;
        const v = rad.slice(n.length + 1).trim();
        if (id === "lank") { if (v) d.lankar.push(v); aktuell = null; }
        else { d[id] = v; aktuell = id; }
      } else if (aktuell && rad.trim()) {
        d[aktuell] = (d[aktuell] ? d[aktuell] + "\n" : "") + rad.trim();
      }
    }
    if (d.skifte) d.skifte = skifteNamn(d.skifte);
    // Valbara fält måste ha ett giltigt värde; annat ignoreras.
    for (const [id, lista] of Object.entries(VALFALT)) {
      if (d[id] && !lista.includes(d[id])) {
        const hit = lista.find((x) => x.toLowerCase() === d[id].toLowerCase());
        d[id] = hit || "";
      }
    }
    for (const id of TEXTFALT) if (d[id]) d[id] = ren(d[id]);
    if (harInnehall(d) || d.punkt) ut.push(d);
  }
  return ut;
}

// ---------- Föra in i loggen ----------

export function hittaPunkt(punkter, angiven) {
  const m = /(\d+)/.exec(String(angiven || ""));
  if (!m) return null;
  const tal = parseInt(m[1], 10);
  return punkter.find((p) => { const n = /(\d+)\s*$/.exec(String(p.nr || "")); return n && parseInt(n[1], 10) === tal; }) || null;
}

export function kallrad(d, datum) {
  const vem = [ren(d.avsandare), ren(d.organisation)].filter(Boolean).join(", ");
  const dag = ren(d.datum) || datum;
  return [`Inspel från ${vem || "okänd avsändare"}, ${dag}`, ...(d.lankar || []).map(ren).filter(Boolean)].join("\n");
}

// Lägger in inspelen i punktlistan. Returnerar noteringar till mötesfliken för det som inte fördes in automatiskt.
// Regler: utan befintlig punkt blir inspelet en ny rad. Med befintlig punkt fylls tomma fält, texter som redan finns
// får ett tillägg, och bedömningar som skiljer sig ändras inte utan noteras som förslag till gruppen.
export function applicera(punkter, inspel, { datum }) {
  const noteringar = [];
  const resultat = [];
  for (const d of inspel) {
    const vem = [ren(d.avsandare), ren(d.organisation)].filter(Boolean).join(", ") || "okänd avsändare";
    const befintlig = d.punkt ? hittaPunkt(punkter, d.punkt) : null;
    if (befintlig) {
      for (const id of TEXTFALT) {
        const v = ren(d[id]);
        if (!v) continue;
        const nu = ren(befintlig[id]);
        if (!nu) befintlig[id] = v;
        else if (!nu.includes(v)) {
          if (id === "titel") noteringar.push({ nr: befintlig.nr, titel: befintlig.titel, falt: "Hävstångspunkt", fore: nu, efter: `Förslag från ${vem}: ${v}` });
          else befintlig[id] = `${nu}\n\nTillägg från ${vem}, ${ren(d.datum) || datum}: ${v}`;
        }
      }
      for (const id of Object.keys(VALFALT)) {
        const v = ren(d[id]);
        if (!v) continue;
        const nu = ren(befintlig[id]);
        if (!nu) befintlig[id] = v;
        else if (nu !== v) noteringar.push({ nr: befintlig.nr, titel: befintlig.titel, falt: { havstang: "Hävstång", rackvidd: "Räckvidd", fonsterNu: "Fönster nu?", skifte: "Skifte" }[id], fore: nu, efter: `Förslag från ${vem}: ${v} (inte infört, gruppen avgör)` });
      }
      befintlig.kalla = [ren(befintlig.kalla), kallrad(d, datum)].filter(Boolean).join("\n");
      resultat.push({ nr: befintlig.nr, typ: "tillägg" });
    } else {
      const ny = {
        nr: nastaNummer(punkter), titel: ren(d.titel), laset: ren(d.laset), vem: ren(d.vem), skifte: ren(d.skifte),
        havstang: ren(d.havstang), rackvidd: ren(d.rackvidd), fonster: ren(d.fonster), fonsterNu: ren(d.fonsterNu),
        forslag: "", val: "", nasta: "", lardom: "", kalla: kallrad(d, datum), uppdaterad: "", rad: null, original: null,
      };
      punkter.push(ny);
      if (d.punkt) noteringar.push({ nr: ny.nr, titel: ny.titel || "(utan rubrik)", falt: "Gäller befintlig punkt", fore: "", efter: `Inspelet angav ${d.punkt}, som inte finns i loggen. Lagt in som ny punkt.` });
      resultat.push({ nr: ny.nr, typ: "ny" });
    }
  }
  return { noteringar, resultat };
}
