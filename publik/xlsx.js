// Läser och skriver loggen som Excel-fil, helt i webbläsaren.
//
// Principen: filen öppnas som zip-arkiv och bara de celler som ändrats skrivs om.
// Allt annat i filen (flikar, formler, rullgardiner, färgregler, kolumnbredder) lämnas orört.
// Inget skickas någonstans; filen läses från disken och den nya filen laddas ner till disken.
//
// Modulen tar emot JSZip, DOMParser och XMLSerializer utifrån, så att samma kod kan testas i Node.

import { FALT, REDIGERBARA, forslag, idag } from "./regler.js";

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_XML = "http://www.w3.org/XML/1998/namespace";
const TYP_BLAD = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const CT_BLAD = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const XML_HUVUD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export class Filfel extends Error {}

// ---------- Hjälpfunktioner ----------

export function kolumnTillTal(bokstav) {
  let n = 0;
  for (const t of bokstav.toUpperCase()) n = n * 26 + (t.charCodeAt(0) - 64);
  return n;
}
export function talTillKolumn(n) {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function delaRef(ref) {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref || "");
  return m ? { kol: m[1].toUpperCase(), rad: parseInt(m[2], 10) } : null;
}
function barn(el, namn) {
  const ut = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === namn) ut.push(n);
  return ut;
}
function forsta(el, namn) { return barn(el, namn)[0] || null; }
function allaText(el, namn) {
  // All text i <t>-element under el (klarar formaterad text med flera <r>).
  let s = "";
  const lista = el.getElementsByTagNameNS ? el.getElementsByTagNameNS(NS_MAIN, namn) : el.getElementsByTagName(namn);
  for (let i = 0; i < lista.length; i++) s += lista[i].textContent;
  return s;
}
function rensa(text) {
  // Tecken som inte är tillåtna i XML tas bort; radbrytningar behålls.
  return String(text ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/\r\n?/g, "\n");
}
function esc(text) {
  return rensa(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function normalisera(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function serieTillDatum(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 20000 || n > 80000) return String(v);
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}
function sokvag(bas, mal) {
  if (mal.startsWith("/")) return mal.slice(1);
  const delar = bas.split("/").slice(0, -1);
  for (const d of mal.split("/")) { if (d === "..") delar.pop(); else if (d !== ".") delar.push(d); }
  return delar.join("/");
}

async function lasXml(zip, vag, env) {
  const fil = zip.file(vag);
  if (!fil) return null;
  const text = await fil.async("string");
  const doc = new env.DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Filfel(`Delen ${vag} i filen gick inte att läsa.`);
  return doc;
}
function tillText(doc, env) {
  const s = new env.XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, "");
  return XML_HUVUD + s;
}

// ---------- Läsning ----------

export async function lasArbetsbok(data, env) {
  let zip;
  try { zip = await env.JSZip.loadAsync(data); }
  catch { throw new Filfel("Filen gick inte att öppna. Välj en Excel-fil (.xlsx), inte en äldre .xls eller en CSV-fil."); }

  const bok = await lasXml(zip, "xl/workbook.xml", env);
  if (!bok) throw new Filfel("Filen ser inte ut som en Excel-arbetsbok (.xlsx).");
  const relDoc = await lasXml(zip, "xl/_rels/workbook.xml.rels", env);
  const rels = {};
  if (relDoc) for (const r of Array.from(relDoc.getElementsByTagName("Relationship"))) rels[r.getAttribute("Id")] = r.getAttribute("Target");

  const blad = Array.from(bok.getElementsByTagNameNS(NS_MAIN, "sheet")).map((s) => ({
    namn: s.getAttribute("name"),
    vag: sokvag("xl/workbook.xml", rels[s.getAttributeNS(NS_REL, "id") || s.getAttribute("r:id")] || ""),
  }));
  const logg = blad.find((b) => normalisera(b.namn) === "logg") || blad[0];
  if (!logg || !zip.file(logg.vag)) throw new Filfel("Hittar ingen flik med loggen i filen.");

  const ss = [];
  const ssDoc = await lasXml(zip, "xl/sharedStrings.xml", env);
  if (ssDoc) for (const si of Array.from(ssDoc.getElementsByTagNameNS(NS_MAIN, "si"))) ss.push(allaText(si, "t"));

  const doc = await lasXml(zip, logg.vag, env);
  const rader = radkarta(doc);

  // Rubrikraden: den första raden bland de 30 första som har både Nr och Hävstångspunkt.
  let rubrikRad = null;
  const kolumner = {};
  for (const nr of Object.keys(rader).map(Number).sort((a, b) => a - b).slice(0, 30)) {
    const varden = {};
    for (const c of barn(rader[nr], "c")) { const r = delaRef(c.getAttribute("r")); if (r) varden[r.kol] = cellVarde(c, ss); }
    const hittade = matchaRubriker(varden);
    if (hittade.nr && hittade.titel) { rubrikRad = nr; Object.assign(kolumner, hittade); break; }
  }
  if (!rubrikRad) throw new Filfel("Hittar inte rubrikraden med Nr och Hävstångspunkt i fliken " + logg.namn + ".");
  const saknas = FALT.filter((f) => !kolumner[f.id]).map((f) => f.rubrik);
  if (saknas.length) throw new Filfel("Följande kolumner saknas i loggen: " + saknas.join(", ") + ". Använd mallen Logg_havstangspunkter_och_mojlighetsfonster.");

  const punkter = [];
  for (const nr of Object.keys(rader).map(Number).filter((n) => n > rubrikRad).sort((a, b) => a - b)) {
    const varden = {};
    for (const c of barn(rader[nr], "c")) { const r = delaRef(c.getAttribute("r")); if (r) varden[r.kol] = cellVarde(c, ss); }
    const p = { rad: nr };
    for (const f of FALT) {
      let v = varden[kolumner[f.id]] ?? "";
      if (f.id === "uppdaterad" && /^\d+(\.\d+)?$/.test(v)) v = serieTillDatum(v);
      p[f.id] = String(v).trim();
    }
    if (!p.titel && !p.nr) continue;
    p.original = Object.fromEntries(FALT.map((f) => [f.id, p[f.id]]));
    punkter.push(p);
  }

  // Stilindex från rubrikraden och första dataraden, som mötesfliken lånar.
  const stilar = {};
  for (const r of [rubrikRad, rubrikRad + 1]) {
    if (rader[r]) for (const c of barn(rader[r], "c")) if (c.getAttribute("s")) stilar[c.getAttribute("r")] = c.getAttribute("s");
  }

  return {
    zip, stilar, bladVag: logg.vag, bladNamn: logg.namn, rubrikRad, kolumner, punkter,
    listor: lasListor(doc, kolumner),
    alla: blad.map((b) => b.namn),
  };
}

function radkarta(doc) {
  const sd = doc.getElementsByTagNameNS(NS_MAIN, "sheetData")[0];
  const rader = {};
  if (sd) for (const r of barn(sd, "row")) rader[parseInt(r.getAttribute("r"), 10)] = r;
  return rader;
}

function cellVarde(c, ss) {
  const t = c.getAttribute("t");
  if (t === "s") { const v = forsta(c, "v"); return v ? (ss[parseInt(v.textContent, 10)] ?? "") : ""; }
  if (t === "inlineStr") { const is = forsta(c, "is"); return is ? allaText(is, "t") : ""; }
  const v = forsta(c, "v");
  return v ? v.textContent : "";
}

function matchaRubriker(varden) {
  const ut = {};
  for (const [kol, text] of Object.entries(varden)) {
    const n = normalisera(text);
    if (!n) continue;
    for (const f of FALT) {
      if (ut[f.id]) continue;
      if (f.inte && f.inte.some((x) => n.startsWith(x))) continue;
      const ok = f.exakt ? f.match.includes(n) : f.match.some((m) => n.startsWith(m));
      if (ok) { ut[f.id] = kol; break; }
    }
  }
  return ut;
}

function lasListor(doc, kolumner) {
  const listor = {};
  const tillFalt = Object.fromEntries(Object.entries(kolumner).map(([id, kol]) => [kol, id]));
  for (const dv of Array.from(doc.getElementsByTagNameNS(NS_MAIN, "dataValidation"))) {
    if (dv.getAttribute("type") !== "list") continue;
    const f1 = forsta(dv, "formula1");
    const m = f1 && /^"(.*)"$/.exec(f1.textContent.trim());
    if (!m) continue;
    const varden = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const omrade of (dv.getAttribute("sqref") || "").split(/\s+/)) {
      const [a, b] = omrade.split(":").map(delaRef);
      if (!a) continue;
      const slut = b ? kolumnTillTal(b.kol) : kolumnTillTal(a.kol);
      for (let k = kolumnTillTal(a.kol); k <= slut; k++) {
        const id = tillFalt[talTillKolumn(k)];
        if (id) listor[id] = varden;
      }
    }
  }
  return listor;
}

// ---------- Ändringar ----------

export function andringar(punkter) {
  const ut = [];
  for (const p of punkter) {
    if (!p.original) { ut.push({ nr: p.nr, titel: p.titel, falt: "Ny punkt", fore: "", efter: p.titel }); continue; }
    for (const id of REDIGERBARA) {
      const fore = p.original[id] ?? "";
      const efter = p[id] ?? "";
      if (rensa(fore).trim() !== rensa(efter).trim()) {
        ut.push({ nr: p.nr, titel: p.titel, falt: FALT.find((f) => f.id === id).rubrik, fore, efter });
      }
    }
  }
  return ut;
}

export function arAndrad(p) {
  if (!p.original) return true;
  return REDIGERBARA.some((id) => rensa(p.original[id] ?? "").trim() !== rensa(p[id] ?? "").trim());
}

// ---------- Skrivning ----------

export async function skrivArbetsbok(arbetsbok, punkter, env, { datum = idag(), motesflik = true } = {}) {
  const { zip: orginalZip, bladVag, rubrikRad, kolumner } = arbetsbok;
  // Arbeta på en kopia av arkivet, så att flera nedladdningar alltid utgår från originalet.
  const zip = await env.JSZip.loadAsync(await orginalZip.generateAsync({ type: "uint8array" }));
  const doc = await lasXml(zip, bladVag, env);
  const sd = doc.getElementsByTagNameNS(NS_MAIN, "sheetData")[0];
  let rader = radkarta(doc);

  const mall = rader[rubrikRad + 1] || null;
  const andrade = punkter.filter(arAndrad);
  if (!andrade.length && !motesflik) return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  // Lediga rader för nya punkter: rader efter rubriken där både Nr och Hävstångspunkt är tomma.
  const upptagna = new Set(punkter.filter((p) => p.rad).map((p) => p.rad));
  const lediga = Object.keys(rader).map(Number).filter((n) => n > rubrikRad && !upptagna.has(n)).sort((a, b) => a - b)
    .filter((n) => {
      for (const c of barn(rader[n], "c")) {
        const r = delaRef(c.getAttribute("r"));
        if (r && (r.kol === kolumner.nr || r.kol === kolumner.titel) && (forsta(c, "v") || forsta(c, "is"))) return false;
      }
      return true;
    });

  for (const p of andrade) {
    let radNr = p.rad;
    if (!radNr) {
      radNr = lediga.shift();
      if (!radNr) {
        radNr = Math.max(rubrikRad, ...Object.keys(rader).map(Number)) + 1;
        const ny = doc.createElementNS(NS_MAIN, "row");
        ny.setAttribute("r", String(radNr));
        sd.appendChild(ny);
        rader = radkarta(doc);
      }
      p.rad = radNr;
    }
    const rad = rader[radNr];
    // Nya och tidigare tomma rader får samma radhöjd som första dataraden, så att texten syns.
    if (mall && mall !== rad && !rad.getAttribute("ht") && mall.getAttribute("ht")) {
      rad.setAttribute("ht", mall.getAttribute("ht"));
      if (mall.getAttribute("customHeight")) rad.setAttribute("customHeight", mall.getAttribute("customHeight"));
    }
    const skriv = p.original ? REDIGERBARA.filter((id) => (p.original[id] ?? "") !== (p[id] ?? "")) : ["nr", ...REDIGERBARA];
    for (const id of skriv) satText(doc, rad, kolumner[id], radNr, p[id] ?? "", mall);
    satText(doc, rad, kolumner.uppdaterad, radNr, datum, mall);
    satForslag(doc, rad, kolumner, radNr, forslag(p), mall);
  }

  // Förslag kan ha ändrats även i rader som inte ändrats för hand (om regeln skiljer sig); räkna om alla cachade värden.
  for (const p of punkter) if (p.rad && rader[p.rad]) satForslagVarde(rader[p.rad], kolumner.forslag, p.rad, forslag(p));

  uppdateraDimension(doc, sd);
  zip.file(bladVag, tillText(doc, env));

  // Excel räknar om alla formler när filen öppnas, så att fliken Översikt stämmer.
  const bok = await lasXml(zip, "xl/workbook.xml", env);
  let calc = bok.getElementsByTagNameNS(NS_MAIN, "calcPr")[0];
  if (!calc) {
    calc = bok.createElementNS(NS_MAIN, "calcPr");
    const efter = bok.getElementsByTagNameNS(NS_MAIN, "definedNames")[0] || bok.getElementsByTagNameNS(NS_MAIN, "sheets")[0];
    efter.parentNode.insertBefore(calc, efter.nextSibling);
  }
  calc.setAttribute("fullCalcOnLoad", "1");

  if (motesflik) await laggTillMotesflik(zip, bok, arbetsbok, andringar(punkter), datum, env);
  zip.file("xl/workbook.xml", tillText(bok, env));

  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function hittaCell(doc, rad, kol, radNr, mall) {
  const ref = kol + radNr;
  const mal = kolumnTillTal(kol);
  let fore = null;
  for (const c of barn(rad, "c")) {
    const r = delaRef(c.getAttribute("r"));
    if (!r) continue;
    if (r.kol === kol) return c;
    if (kolumnTillTal(r.kol) > mal) { fore = c; break; }
  }
  const c = doc.createElementNS(NS_MAIN, "c");
  c.setAttribute("r", ref);
  if (mall) {
    const forebild = barn(mall, "c").find((x) => delaRef(x.getAttribute("r"))?.kol === kol);
    if (forebild && forebild.getAttribute("s")) c.setAttribute("s", forebild.getAttribute("s"));
  }
  rad.insertBefore(c, fore);
  return c;
}

function tomCell(c) {
  while (c.firstChild) c.removeChild(c.firstChild);
  c.removeAttribute("t");
}

function satText(doc, rad, kol, radNr, text, mall) {
  if (!kol) return;
  const c = hittaCell(doc, rad, kol, radNr, mall);
  tomCell(c);
  const v = rensa(text);
  if (!v.trim()) return;
  c.setAttribute("t", "inlineStr");
  const is = doc.createElementNS(NS_MAIN, "is");
  const t = doc.createElementNS(NS_MAIN, "t");
  t.setAttributeNS(NS_XML, "xml:space", "preserve");
  t.textContent = v;
  is.appendChild(t);
  c.appendChild(is);
}

function formelText(k, r) {
  return `IF(${k.titel}${r}="","",IF(AND(${k.fonsterNu}${r}="Öppet nu",${k.havstang}${r}<>"Låg",${k.rackvidd}${r}<>"Låg"),"Ta upp nu",IF(${k.havstang}${r}="Hög","Bevaka fönster","Parkera")))`;
}

function satForslag(doc, rad, kolumner, radNr, varde, mall) {
  const c = hittaCell(doc, rad, kolumner.forslag, radNr, mall);
  if (!forsta(c, "f")) {
    tomCell(c);
    const f = doc.createElementNS(NS_MAIN, "f");
    f.textContent = formelText(kolumner, radNr);
    c.appendChild(f);
  }
  satForslagVarde(rad, kolumner.forslag, radNr, varde);
}

function satForslagVarde(rad, kol, radNr, varde) {
  const c = barn(rad, "c").find((x) => x.getAttribute("r") === kol + radNr);
  if (!c || !forsta(c, "f")) return;
  const doc = c.ownerDocument;
  let v = forsta(c, "v");
  if (!v) { v = doc.createElementNS(NS_MAIN, "v"); c.appendChild(v); }
  v.textContent = varde;
  c.setAttribute("t", "str");
}

function uppdateraDimension(doc, sd) {
  const dim = doc.getElementsByTagNameNS(NS_MAIN, "dimension")[0];
  if (!dim) return;
  const [a, b] = (dim.getAttribute("ref") || "A1").split(":");
  const max = Math.max(...barn(sd, "row").map((r) => parseInt(r.getAttribute("r"), 10)));
  const slut = delaRef(b || a);
  if (slut && max > slut.rad) dim.setAttribute("ref", `${a}:${slut.kol}${max}`);
}

async function laggTillMotesflik(zip, bok, arbetsbok, lista, datum, env) {
  const sheets = bok.getElementsByTagNameNS(NS_MAIN, "sheets")[0];
  const befintliga = Array.from(barn(sheets, "sheet"));
  const namnSet = new Set(befintliga.map((s) => s.getAttribute("name")));
  let namn = `Mötet ${datum}`;
  for (let i = 2; namnSet.has(namn); i++) namn = `Mötet ${datum} (${i})`;

  const relDoc = await lasXml(zip, "xl/_rels/workbook.xml.rels", env);
  const relRot = relDoc.documentElement;
  const idn = new Set(Array.from(relDoc.getElementsByTagName("Relationship")).map((r) => r.getAttribute("Id")));
  let rid = 1; while (idn.has("rId" + rid)) rid++;
  let nr = 1; while (zip.file(`xl/worksheets/sheet${nr}.xml`)) nr++;
  const vag = `xl/worksheets/sheet${nr}.xml`;

  // Stilar lånas från loggens rubrikrad och första datarad, så att fliken ser ut som resten av filen.
  const stilRubrik = stilFor(arbetsbok, arbetsbok.rubrikRad, arbetsbok.kolumner.titel);
  const stilText = stilFor(arbetsbok, arbetsbok.rubrikRad + 1, arbetsbok.kolumner.laset);
  const cell = (ref, text, s) => `<c r="${ref}"${s ? ` s="${s}"` : ""} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  const rader = [];
  rader.push(`<row r="1">${cell("A1", `Mötet ${datum}: det som ändrades i loggen`, stilRubrik)}</row>`);
  rader.push(`<row r="2">${cell("A2", lista.length ? `${lista.length} ändringar. Loggen på fliken ${arbetsbok.bladNamn} är uppdaterad; här syns vad som var före och efter.` : "Inga ändringar gjordes på mötet.", "")}</row>`);
  const rub = ["Nr", "Hävstångspunkt", "Fält", "Före", "Efter"];
  rader.push(`<row r="4">${rub.map((t, i) => cell(talTillKolumn(i + 1) + "4", t, stilRubrik)).join("")}</row>`);
  lista.forEach((a, i) => {
    const r = i + 5;
    rader.push(`<row r="${r}">${[a.nr, a.titel, a.falt, a.fore, a.efter].map((t, j) => cell(talTillKolumn(j + 1) + r, t, stilText)).join("")}</row>`);
  });
  const sista = Math.max(4, lista.length + 4);
  const xml = XML_HUVUD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><dimension ref="A1:E${sista}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="14"/><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/><col min="4" max="5" width="56" customWidth="1"/></cols>` +
    `<sheetData>${rader.join("")}</sheetData>` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
  zip.file(vag, xml);

  const rel = relDoc.createElementNS(NS_PKG_REL, "Relationship");
  rel.setAttribute("Id", "rId" + rid);
  rel.setAttribute("Type", TYP_BLAD);
  rel.setAttribute("Target", `worksheets/sheet${nr}.xml`);
  relRot.appendChild(rel);
  zip.file("xl/_rels/workbook.xml.rels", tillText(relDoc, env));

  const maxId = Math.max(0, ...befintliga.map((s) => parseInt(s.getAttribute("sheetId"), 10) || 0));
  const sheet = bok.createElementNS(NS_MAIN, "sheet");
  sheet.setAttribute("name", namn);
  sheet.setAttribute("sheetId", String(maxId + 1));
  sheet.setAttributeNS(NS_REL, "r:id", "rId" + rid);
  sheets.appendChild(sheet);

  const ct = await lasXml(zip, "[Content_Types].xml", env);
  const ov = ct.createElementNS(ct.documentElement.namespaceURI, "Override");
  ov.setAttribute("PartName", "/" + vag);
  ov.setAttribute("ContentType", CT_BLAD);
  ct.documentElement.appendChild(ov);
  zip.file("[Content_Types].xml", tillText(ct, env));

  // Fliknamnen i docProps/app.xml uppdateras om de finns (Excel klarar sig utan, men det blir prydligast så).
  const app = await lasXml(zip, "docProps/app.xml", env);
  if (app) {
    try {
      const vt = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes";
      const titlar = app.getElementsByTagNameNS(app.documentElement.namespaceURI, "TitlesOfParts")[0];
      const vec = titlar && titlar.getElementsByTagNameNS(vt, "vector")[0];
      const i4 = app.getElementsByTagNameNS(vt, "i4")[0];
      if (vec && i4 && befintliga.length === parseInt(i4.textContent, 10)) {
        const s = app.createElementNS(vt, "vt:lpstr");
        s.textContent = namn;
        vec.appendChild(s);
        vec.setAttribute("size", String(parseInt(vec.getAttribute("size"), 10) + 1));
        i4.textContent = String(parseInt(i4.textContent, 10) + 1);
        zip.file("docProps/app.xml", tillText(app, env));
      }
    } catch { /* fliknamnen är inte nödvändiga */ }
  }
}

function stilFor(arbetsbok, radNr, kol) {
  return arbetsbok.stilar?.[kol + radNr] || "";
}

export function nyttFilnamn(original, datum = idag()) {
  const bas = String(original || "Logg.xlsx").replace(/\.xlsx$/i, "").replace(/_mote_\d{4}-\d{2}-\d{2}(_\d+)?$/, "");
  return `${bas}_mote_${datum}.xlsx`;
}
