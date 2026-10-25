// Hävstångskartan: vyerna. All text läggs in med textContent, aldrig som HTML.
// Loggen hålls bara i minnet. Inget sparas i webbläsaren och inget skickas någonstans.

import { SKALA, FONSTER, SKIFTEN, VAL, REDIGERBARA, forslag, motesordning, nastaNummer, idag } from "./regler.js";
import { lasArbetsbok, skrivArbetsbok, andringar, arAndrad, nyttFilnamn, Filfel } from "./xlsx.js";
import { byggMejl, mailtoLank, harInnehall as harInspel, MOTTAGARE, AMNE, MAX_LANGD } from "./inspel.js";

const VERSION = "prototyp v0.8";
const env = { JSZip: window.JSZip, DOMParser: window.DOMParser, XMLSerializer: window.XMLSerializer };
const MAX_STORLEK = 15 * 1024 * 1024;

const S = {
  bok: null,
  filnamn: "",
  punkter: [],
  nedladdad: null,
  skifte: "alla",
  mote: { urval: "ta", ko: [], i: 0 },
  lista: { sok: "", skifte: "alla", forslag: "alla", val: "alla", ordning: "nr" },
  fel: "",
  bytFil: false,
};

// ---------- Små byggklossar ----------

function h(tag, attr = {}, ...barn) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const b of barn.flat()) {
    if (b === null || b === undefined || b === false) continue;
    el.append(b instanceof Node ? b : document.createTextNode(String(b)));
  }
  return el;
}
const p = (text, cls) => h("p", { class: cls, text });
const rena = (lista) => lista.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false);
function lagg(el, ...barn) { el.append(...rena(barn)); }
function byt(el, ...barn) { el.replaceChildren(...rena(barn)); }

const FKLASS = { "Ta upp nu": "ta", "Bevaka fönster": "bevaka", "Parkera": "parkera" };
const VKLASS = { "Ta upp nu": "ta", "Bevaka": "bevaka", "Parkera": "parkera", "Klar": "klar" };
function forslagTag(pt) {
  const f = forslag(pt);
  return h("span", { class: "tag " + (FKLASS[f] || ""), text: f ? "Förslag: " + f : "Förslag saknas" });
}
function valTag(pt) {
  if (!pt.val) return null;
  return h("span", { class: "tag val " + (VKLASS[pt.val] || ""), text: "Gruppen: " + pt.val });
}
function listan(id, standard) { return (S.bok && S.bok.listor[id]) || standard; }

function autohojd(t) {
  const sat = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
  t.addEventListener("input", sat);
  requestAnimationFrame(sat);
}

// ---------- Status och ändringar ----------

function antalAndringar() { return S.bok ? andringar(S.punkter).length : 0; }

function uppdateraStatus() {
  const n = antalAndringar();
  const rakna = document.getElementById("rakna");
  rakna.hidden = n === 0;
  rakna.textContent = String(n);
  const status = document.getElementById("status");
  status.hidden = !S.bok;
  if (S.bok) {
    document.getElementById("statusfil").textContent = S.filnamn;
    const a = document.getElementById("statusantal");
    a.textContent = n === 0 ? `${S.punkter.length} punkter · inga ändringar ännu`
      : `${S.punkter.length} punkter · ${n} ${n === 1 ? "ändring" : "ändringar"}${S.nedladdad && S.nedladdad.antal === n ? " · nedladdad" : " · inte nedladdad ännu"}`;
    a.classList.toggle("har", n > 0 && !(S.nedladdad && S.nedladdad.antal === n));
  }
}

window.addEventListener("beforeunload", (e) => {
  const n = antalAndringar();
  if (n > 0 && !(S.nedladdad && S.nedladdad.antal === n)) { e.preventDefault(); e.returnValue = ""; }
});

// ---------- Inläsning ----------

async function lasFil(fil) {
  S.fel = "";
  if (!fil) return;
  if (!/\.xlsx$/i.test(fil.name)) { S.fel = "Välj en Excel-fil som slutar på .xlsx."; return render(); }
  if (fil.size > MAX_STORLEK) { S.fel = "Filen är större än 15 MB. Loggen brukar vara mycket mindre; kontrollera att det är rätt fil."; return render(); }
  try {
    const bok = await lasArbetsbok(await fil.arrayBuffer(), env);
    S.bok = bok;
    S.filnamn = fil.name;
    S.punkter = bok.punkter;
    S.nedladdad = null;
    S.mote = { urval: "ta", ko: [], i: 0 };
    S.bytFil = false;
    uppdateraStatus();
    if (location.hash === "#karta") render(); else location.hash = "#karta";
  } catch (err) {
    S.fel = err instanceof Filfel ? err.message : "Filen gick inte att läsa. Kontrollera att det är loggen i Excel-format (.xlsx).";
    console.error(err);
    render();
  }
}

async function lasExempel() {
  try {
    const svar = await fetch("exempel/Exempel_logg_havstangspunkter.xlsx");
    if (!svar.ok) throw new Error(String(svar.status));
    const blob = await svar.blob();
    await lasFil(new File([blob], "Exempel_logg_havstangspunkter.xlsx"));
  } catch (err) {
    console.error(err);
    S.fel = "Exempelfilen gick inte att hämta.";
    render();
  }
}

function slappyta() {
  const input = h("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", class: "dold", id: "filval" });
  input.addEventListener("change", () => lasFil(input.files[0]));
  const yta = h("div", { class: "slapp" },
    h("p", { class: "lead", text: "Dra in loggen hit" }),
    p("eller", "muted small"),
    h("label", { class: "btn", for: "filval", text: "Välj Excel-fil" }),
    input,
    p("Filen läses i din webbläsare och lämnar aldrig datorn.", "hjalp"),
  );
  yta.addEventListener("dragover", (e) => { e.preventDefault(); yta.classList.add("over"); });
  yta.addEventListener("dragleave", () => yta.classList.remove("over"));
  yta.addEventListener("drop", (e) => { e.preventDefault(); yta.classList.remove("over"); lasFil(e.dataTransfer.files[0]); });
  return yta;
}

// ---------- Punktkortet ----------

// Ett nytt inspel behöver bara det gruppen vet. Det sparas så snart något fält utöver källan är ifyllt.
function nyPunkt() {
  const pt = { nr: nastaNummer(S.punkter), titel: "", laset: "", vem: "", skifte: "", havstang: "", rackvidd: "", fonster: "", fonsterNu: "", forslag: "", val: "", nasta: "", lardom: "", kalla: `Inspel på mötet ${idag()}`, uppdaterad: "", rad: null, original: null };
  S.punkter.push(pt);
  return pt;
}
function harInnehall(pt) {
  return REDIGERBARA.some((id) => id !== "kalla" && String(pt[id] || "").trim());
}
function rubrik(pt) {
  if (String(pt.titel || "").trim()) return pt.titel;
  const t = String(pt.laset || pt.fonster || pt.vem || pt.nasta || "").trim();
  return t ? (t.length > 70 ? t.slice(0, 68) + " …" : t) : "(utan rubrik)";
}
function rensaTommaNya(undantag = null) {
  const fore = S.punkter.length;
  S.punkter = S.punkter.filter((pt) => pt.original || harInnehall(pt) || pt === undantag);
  if (S.punkter.length !== fore) uppdateraStatus();
}

function forklaraForslag(pt) {
  const f = forslag(pt);
  if (f && (!pt.havstang || !pt.fonsterNu || !pt.rackvidd)) return "Hävstång, räckvidd eller fönster är inte bedömda ännu, så mallens formel ger " + f + " tills ni fyller i dem.";
  if (f === "Ta upp nu") return "Fönstret är öppet, och både hävstång och räckvidd är medel eller hög.";
  if (f === "Bevaka fönster") return pt.fonsterNu === "Öppet nu" ? "Hög hävstång och öppet fönster, men räckvidden är låg." : "Hög hävstång, men fönstret är inte öppet nu.";
  if (f === "Parkera") return pt.fonsterNu === "Öppet nu" ? "Fönstret är öppet, men hävstången är låg, eller räckvidden låg utan hög hävstång." : "Hävstången är inte hög och fönstret är inte öppet nu.";
  return "Förslaget räknas när inspelet har fått en rubrik.";
}

function kortFor(pt, { vidAndring } = {}) {
  const falt = {};
  const tags = h("span", { class: "taggar" });
  const forslagsrad = h("div", { class: "forslagsrad" });
  const fotInfo = h("span");
  const angra = h("button", { type: "button", class: "lank" });

  function markera() {
    for (const [id, el] of Object.entries(falt)) {
      const andrad = pt.original ? (pt.original[id] ?? "").trim() !== (pt[id] ?? "").trim() : !!(pt[id] ?? "").trim();
      el.classList.toggle("andrad", andrad);
    }
    byt(tags, 
      pt.skifte ? h("span", { class: "tag", text: pt.skifte }) : null,
      forslagTag(pt),
      valTag(pt),
      !pt.original ? h("span", { class: "tag andrad", text: "Nytt inspel" }) : arAndrad(pt) ? h("span", { class: "tag andrad", text: "Ändrad på mötet" }) : null,
    );
    byt(forslagsrad, h("span", { text: "Verktygets förslag:" }), forslagTag(pt), h("span", { text: forklaraForslag(pt) }));
    fotInfo.textContent = pt.original ? (pt.uppdaterad ? `Senast uppdaterad i loggen ${pt.uppdaterad}` : "") + (arAndrad(pt) ? `. Får datumet ${idag()} när ni sparar.` : "") : (harInnehall(pt) ? `Läggs till i loggen som ${pt.nr} när ni sparar.` : "Inspelet sparas så snart något fält är ifyllt.");
    angra.textContent = pt.original ? "Ångra ändringarna i punkten" : "Ta bort inspelet";
    angra.hidden = pt.original ? !arAndrad(pt) : false;
  }
  function andra(id, varde) {
    pt[id] = varde;
    markera();
    uppdateraStatus();
    if (vidAndring) vidAndring(id);
  }

  function textfalt(id, etikett, { rader = 2, lugn = true, klass } = {}) {
    const tid = `f-${id}-${Math.random().toString(36).slice(2, 7)}`;
    const t = h("textarea", { id: tid, rows: rader, class: (lugn ? "lugn " : "") + (klass || "") });
    t.value = pt[id] || "";
    t.addEventListener("input", () => andra(id, t.value));
    autohojd(t);
    const el = h("div", { class: "falt" }, h("label", { for: tid, text: etikett }), t);
    falt[id] = el;
    return el;
  }
  function segmentfalt(id, etikett, varden, { kanTomma = false, klass = "" } = {}) {
    const grupp = h("div", { class: "segment " + klass, role: "group", "aria-label": etikett });
    const knappar = varden.map((v) => {
      const b = h("button", { type: "button", "data-v": v, "aria-pressed": String(pt[id] === v), text: v });
      b.addEventListener("click", () => {
        const nytt = kanTomma && pt[id] === v ? "" : v;
        knappar.forEach((k) => k.setAttribute("aria-pressed", String(k.dataset.v === nytt)));
        andra(id, nytt);
      });
      return b;
    });
    grupp.append(...knappar);
    const el = h("div", { class: "falt" }, h("div", { class: "etikett", text: etikett }), grupp);
    falt[id] = el;
    return el;
  }

  const titel = h("textarea", { class: "titel", rows: 1, "aria-label": "Hävstångspunkt", placeholder: pt.original ? "Rubrik för hävstångspunkten" : "Vad handlar inspelet om?" });
  titel.value = pt.titel;
  titel.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  titel.addEventListener("input", () => andra("titel", titel.value.replace(/\n/g, " ")));
  autohojd(titel);
  falt.titel = h("div", { class: "falt" }, titel);

  const lardomFalt = textfalt("lardom", "Lärdom efter cykeln", { rader: 2 });
  const kallaFalt = textfalt("kalla", "Källa", { rader: 2 });

  const kort = h("article", { class: "kort" },
    !pt.original ? p("Nytt inspel. Fyll i det ni vet, resten kan vänta. Rubrik, bedömning och källa går att komplettera vid nästa möte eller direkt i Excel.", "note") : null,
    h("div", { class: "huvud" }, h("span", { class: "nr", text: pt.nr }), tags),
    falt.titel,
    h("div", { class: "tvaspalt" },
      textfalt("laset", "Låset (en mening)"),
      textfalt("vem", "Vem kan agera"),
    ),
    textfalt("fonster", "Fönster: vad öppnar sig?", { rader: 2 }),
    h("div", { class: "bedomning" },
      segmentfalt("havstang", "Hävstång", listan("havstang", SKALA)),
      segmentfalt("rackvidd", "Räckvidd", listan("rackvidd", SKALA)),
      segmentfalt("fonsterNu", "Fönster nu?", listan("fonsterNu", FONSTER)),
      segmentfalt("skifte", "Skifte", listan("skifte", SKIFTEN)),
    ),
    h("details", { class: "kalla", open: !pt.original }, h("summary", { text: "Källa" }), kallaFalt),
    h("section", { class: "beslut" },
      h("h3", { text: "Gruppens beslut" }),
      forslagsrad,
      segmentfalt("val", "Gruppens val", listan("val", VAL), { kanTomma: true, klass: "val" }),
      textfalt("nasta", "Nästa steg och ansvarig", { rader: 2, lugn: false }),
      h("details", { class: "lardom", open: !!pt.lardom }, h("summary", { text: "Lärdom efter cykeln (utvärderingsmötet)" }), lardomFalt),
    ),
    h("div", { class: "fot" }, fotInfo, angra),
  );
  angra.addEventListener("click", () => {
    if (pt.original) {
      for (const id of Object.keys(pt.original)) pt[id] = pt.original[id];
      const ny = kortFor(pt, { vidAndring });
      kort.replaceWith(ny);
      uppdateraStatus();
      if (vidAndring) vidAndring("alla");
    } else {
      S.punkter = S.punkter.filter((x) => x !== pt);
      uppdateraStatus();
      if (vidAndring) vidAndring("borttagen");
    }
  });
  markera();
  return kort;
}

// ---------- Dialogen ----------

const dialog = document.getElementById("dialog");
let efterStang = null;
document.getElementById("stang").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  rensaTommaNya();
  document.getElementById("dialogkropp").replaceChildren();
  const f = efterStang; efterStang = null;
  if (f) f();
});
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

function oppnaPunkt(pt, { ny = false } = {}) {
  document.getElementById("dialoglage").textContent = ny ? `Nytt inspel · ${pt.nr}` : pt.nr;
  document.getElementById("stang").textContent = ny ? "Klar" : "Stäng";
  const kropp = document.getElementById("dialogkropp");
  kropp.replaceChildren(kortFor(pt, { vidAndring: (id) => { if (id === "borttagen") dialog.close(); } }));
  efterStang = () => render();
  dialog.showModal();
  if (ny) { const t = kropp.querySelector("textarea.titel"); if (t) t.focus(); }
  else kropp.scrollTop = 0;
}

// ---------- Vyer ----------

function kraverFil(vy) {
  lagg(vy, 
    h("h1", { text: "Ladda in loggen först" }),
    p("Kartan, mötet och listan visar innehållet i er Excel-logg. Börja med att läsa in filen.", "lead"),
    h("p", {}, h("a", { class: "btn", href: "#start", text: "Till inläsningen" })),
  );
}

function siffror() {
  const r = { "Ta upp nu": 0, "Bevaka fönster": 0, "Parkera": 0 };
  let val = 0;
  for (const pt of S.punkter) { const f = forslag(pt); if (f in r) r[f]++; if (pt.val) val++; }
  return h("div", { class: "siffror" },
    h("div", { class: "siffra ta" }, h("span", { class: "tal", text: r["Ta upp nu"] }), h("span", { class: "etikett", text: "förslag Ta upp nu" })),
    h("div", { class: "siffra bevaka" }, h("span", { class: "tal", text: r["Bevaka fönster"] }), h("span", { class: "etikett", text: "förslag Bevaka fönster" })),
    h("div", { class: "siffra" }, h("span", { class: "tal", text: r["Parkera"] }), h("span", { class: "etikett", text: "förslag Parkera" })),
    h("div", { class: "siffra" }, h("span", { class: "tal", text: val }), h("span", { class: "etikett", text: "med gruppens val" })),
  );
}

function vyStart(vy) {
  if (S.bok && !S.bytFil) {
    lagg(vy, 
      h("div", { class: "smal" },
        h("div", { class: "eyebrow", text: "Inläst logg" }),
        h("h1", { text: S.filnamn }),
        p(`${S.punkter.length} hävstångspunkter från fliken ${S.bok.bladNamn}. Filen finns bara i den här fliken i webbläsaren.`, "lead"),
        siffror(),
        h("div", { class: "actions" },
          h("a", { class: "btn", href: "#karta", text: "Öppna kartan" }),
          h("a", { class: "btn", href: "#mote", text: "Starta mötet" }),
          h("button", { type: "button", class: "ghost", onclick: () => { S.bytFil = true; render(); }, text: "Läs in en annan fil" }),
        ),
      ),
    );
    return;
  }
  const n = antalAndringar();
  lagg(vy, 
    h("div", { class: "smal" },
      h("div", { class: "eyebrow", text: "Hävstångspunkter och möjlighetsfönster" }),
      h("h1", { text: "Från logg till prioritering" }),
      p("Läs in er Excel-logg. Hävstångskartan visar var systemet går att rubba och när, låter gruppen pröva punkterna en i taget och ger er en ny Excel-fil med mötets beslut.", "lead"),
      h("span", { class: "fritt", text: "Filen läses i din webbläsare och lämnar aldrig datorn." }),
      S.fel ? p(S.fel, "note weak") : null,
      S.bytFil && n > 0 ? p(`Ni har ${n} ändringar som inte är nedladdade. Ladda ner den nya filen under Spara ny fil innan ni läser in en annan, annars försvinner de.`, "note strong") : null,
      slappyta(),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "ghost", onclick: lasExempel, text: "Pröva med ett påhittat exempel" }),
        S.bytFil ? h("button", { type: "button", class: "ghost", onclick: () => { S.bytFil = false; render(); }, text: "Behåll den inlästa filen" }) : null,
        h("a", { href: "#instruktion", text: "Så fungerar det" }),
      ),
    ),
  );
}

function skiftefilter(nar) {
  const val = ["alla", ...listan("skifte", SKIFTEN)];
  return h("div", { class: "segment", role: "group", "aria-label": "Skifte" },
    val.map((v) => h("button", { type: "button", "aria-pressed": String(S.skifte === v), text: v === "alla" ? "Alla skiften" : v, onclick: () => { S.skifte = v; nar(); } })));
}

// Brickan på kartan. På dator kan den dras till en annan ruta, och fönstertexten visas när muspekaren vilar på den.
let dragen = null;
function bricka(pt, { dragbar = false } = {}) {
  const f = forslag(pt);
  // Ett div med knapproll, eftersom riktiga knappar inte går att dra i alla webbläsare.
  const b = h("div", { role: "button", tabindex: "0", class: `bricka f-${FKLASS[f] || "parkera"}${pt.rackvidd === "Låg" ? " svar" : ""}`, draggable: dragbar ? "true" : null },
    h("span", { class: "nr", text: pt.nr + (pt.rackvidd === "Låg" ? " · svår att nå" : "") }),
    h("span", { class: "namn", text: rubrik(pt) }),
    pt.val ? h("span", { class: "valtag" }, valTag(pt)) : null,
    arAndrad(pt) ? h("span", { class: "prick", title: "Ändrad på mötet" }, h("span", { class: "dold", text: "Ändrad på mötet" })) : null,
    String(pt.fonster || "").trim() ? h("span", { class: "fonstertext" }, h("strong", { text: "Fönster: " }), pt.fonster) : null,
  );
  b.addEventListener("click", () => oppnaPunkt(pt));
  b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); oppnaPunkt(pt); } });
  if (dragbar) {
    b.addEventListener("dragstart", (e) => {
      dragen = pt;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", pt.nr);
      b.classList.add("drar");
      b.closest(".matris")?.classList.add("drag-pagar");
    });
    b.addEventListener("dragend", () => {
      dragen = null;
      b.classList.remove("drar");
      document.querySelectorAll(".matris").forEach((m) => m.classList.remove("drag-pagar"));
      document.querySelectorAll(".ruta.mal").forEach((x) => x.classList.remove("mal"));
    });
  }
  return b;
}

function slapprute(ruta, havstang, fonsterNu) {
  ruta.addEventListener("dragover", (e) => { if (!dragen) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; ruta.classList.add("mal"); });
  ruta.addEventListener("dragleave", (e) => { if (!ruta.contains(e.relatedTarget)) ruta.classList.remove("mal"); });
  ruta.addEventListener("drop", (e) => {
    e.preventDefault();
    ruta.classList.remove("mal");
    const pt = dragen;
    dragen = null;
    if (!pt || (pt.havstang === havstang && pt.fonsterNu === fonsterNu)) return;
    S.flytt = { pt, fore: { havstang: pt.havstang, fonsterNu: pt.fonsterNu }, efter: { havstang, fonsterNu } };
    pt.havstang = havstang;
    pt.fonsterNu = fonsterNu;
    render();
  });
}

function flyttbesked() {
  const f = S.flytt;
  if (!f || !S.punkter.includes(f.pt)) return null;
  const delar = [];
  if (f.fore.fonsterNu !== f.efter.fonsterNu) delar.push(`fönster ${f.fore.fonsterNu || "(tomt)"} till ${f.efter.fonsterNu}`);
  if (f.fore.havstang !== f.efter.havstang) delar.push(`hävstång ${f.fore.havstang || "(tomt)"} till ${f.efter.havstang}`);
  const angra = h("button", { type: "button", class: "lank", text: "Ångra flytten" });
  angra.addEventListener("click", () => {
    f.pt.havstang = f.fore.havstang;
    f.pt.fonsterNu = f.fore.fonsterNu;
    S.flytt = null;
    render();
  });
  return h("p", { class: "note flyttad", role: "status" }, `${f.pt.nr} flyttad: ${delar.join(", ")}. Förslaget är nu ${forslag(f.pt) || "tomt"}. `, angra);
}

function vyKarta(vy) {
  if (!S.bok) return kraverFil(vy);
  const synliga = S.punkter.filter((pt) => S.skifte === "alla" || pt.skifte === S.skifte);
  const rader = listan("havstang", SKALA);
  const kolumner = listan("fonsterNu", FONSTER);
  const matris = h("div", { class: "matris", role: "table", "aria-label": "Hävstång mot fönster" });
  matris.append(h("div", { class: "hhuvud axel", text: "Hävstång ↓ Fönster →" }));
  for (const k of kolumner) matris.append(h("div", { class: "hhuvud", text: k }));
  for (const r of rader) {
    matris.append(h("div", { class: "vhuvud", text: r }, h("small", { text: "hävstång" })));
    kolumner.forEach((k, j) => {
      const har = synliga.filter((pt) => pt.havstang === r && pt.fonsterNu === k).sort(motesordning);
      const forst = r === rader[0] && j === 0;
      const ruta = h("div", { class: "ruta" + (forst ? " forst" : "") + (har.length ? "" : " tom-ruta") },
        h("span", { class: "rutnamn", text: `${r} hävstång · ${k}` }),
        forst ? h("span", { class: "forstlapp", text: "Diskuteras först" }) : null,
        har.length ? har.map((pt) => bricka(pt, { dragbar: true })) : h("span", { class: "tomt", text: "Inga punkter" }));
      slapprute(ruta, r, k);
      matris.append(ruta);
    });
  }
  const utanfor = synliga.filter((pt) => !rader.includes(pt.havstang) || !kolumner.includes(pt.fonsterNu));

  lagg(vy, 
    h("h1", { text: "Kartan" }),
    p("Hävstång nedåt, fönster i sidled, som på fliken Översikt. Klicka på en punkt för att läsa den och ändra bedömningen.", "lead"),
    p("På dator: dra en punkt till en annan ruta för att ändra fönster eller hävstång, och låt muspekaren vila på en punkt för att se vad som öppnar sig.", "hjalp"),
    h("div", { class: "verktyg" }, skiftefilter(render), h("button", { type: "button", onclick: () => oppnaPunkt(nyPunkt(), { ny: true }), text: "Lägg till nytt inspel" })),
    flyttbesked(),
    matris,
    utanfor.length ? h("section", {},
      h("h2", { text: "Inte bedömda ännu" }),
      p("Inspel som saknar hävstång eller fönster. Öppna dem och bedöm när ni kommer dit; de följer med i den nya filen ändå.", "hjalp"),
      h("div", { class: "ruta" }, utanfor.map(bricka))) : null,
    h("div", { class: "forklaring" },
      h("span", {}, h("i", { class: "ta" }), "Förslag: Ta upp nu"),
      h("span", {}, h("i", { class: "bevaka" }), "Förslag: Bevaka fönster"),
      h("span", {}, h("i", { class: "parkera" }), "Förslag: Parkera"),
      h("span", {}, h("i", { class: "svar" }), "Streckad: svår att nå (räckvidd låg)"),
      h("span", {}, h("i", { class: "prick" }), "Ändrad på mötet"),
    ),
  );
}

const URVAL = {
  ta: { namn: "Förslag Ta upp nu", filter: (pt) => forslag(pt) === "Ta upp nu" },
  tabevaka: { namn: "Ta upp nu och Bevaka fönster", filter: (pt) => ["Ta upp nu", "Bevaka fönster"].includes(forslag(pt)) },
  utan: { namn: "Utan gruppens val", filter: (pt) => !pt.val },
  alla: { namn: "Alla punkter", filter: () => true },
};
function byggKo() {
  const u = URVAL[S.mote.urval] || URVAL.alla;
  S.mote.ko = S.punkter.filter((pt) => (S.skifte === "alla" || pt.skifte === S.skifte) && u.filter(pt)).sort(motesordning);
  S.mote.i = 0;
}

function vyMote(vy) {
  if (!S.bok) return kraverFil(vy);
  S.mote.ko = S.mote.ko.filter((pt) => S.punkter.includes(pt));
  if (!S.mote.ko.length && !S.mote.byggd) { byggKo(); S.mote.byggd = true; }
  const ko = S.mote.ko;
  S.mote.i = Math.max(0, Math.min(S.mote.i, ko.length - 1));

  const valj = h("select", { class: "liten", "aria-label": "Vilka punkter" },
    Object.entries(URVAL).map(([id, u]) => h("option", { value: id, selected: S.mote.urval === id, text: u.namn })));
  valj.addEventListener("change", () => { S.mote.urval = valj.value; byggKo(); render(); });

  const koRad = h("div", { class: "ko", role: "group", "aria-label": "Punkter i mötet" });
  const ritaKo = () => byt(koRad, ...ko.map((pt, i) => h("button", {
    type: "button", class: pt.val ? "har-val" : "", "aria-current": String(i === S.mote.i), title: pt.titel,
    text: pt.nr, onclick: () => { S.mote.i = i; render(); },
  })));
  ritaKo();

  lagg(vy, 
    h("h1", { text: "Mötet" }),
    p("En punkt i taget, i ordningen förslag, hävstång och räckvidd. Justera bedömningen om samtalet ger skäl, välj Gruppens val och skriv nästa steg.", "lead"),
    h("div", { class: "verktyg" },
      h("span", { class: "grupp-namn", text: "Visa" }), valj,
      skiftefilter(() => { byggKo(); render(); }),
      h("button", { type: "button", class: "ghost", onclick: () => { const pt = nyPunkt(); ko.splice(S.mote.i + 1, 0, pt); S.mote.i = ko.length ? S.mote.i + 1 : 0; render(); }, text: "Lägg till nytt inspel" }),
    ),
  );
  if (!ko.length) {
    lagg(vy, p("Inga punkter i det här urvalet. Välj ett annat urval ovan.", "note"));
    return;
  }
  const pt = ko[S.mote.i];
  const kort = kortFor(pt, { vidAndring: (id) => {
    if (id === "borttagen") { ko.splice(S.mote.i, 1); render(); return; }
    ritaKo();
  } });
  const fore = h("button", { type: "button", class: "ghost", disabled: S.mote.i === 0, text: "← Föregående", onclick: () => { S.mote.i--; render(); } });
  const nasta = h("button", { type: "button", disabled: S.mote.i >= ko.length - 1, text: "Nästa →", onclick: () => { S.mote.i++; render(); } });
  lagg(vy, 
    h("div", { class: "motesrad" }, h("span", { class: "lage", text: `Punkt ${S.mote.i + 1} av ${ko.length}` })),
    koRad,
    kort,
    h("div", { class: "motesnav" }, fore, S.mote.i >= ko.length - 1 ? h("a", { class: "btn", href: "#spara", text: "Klart, till Spara ny fil" }) : nasta),
  );
  if (!pt.original && !pt.titel) { const t = kort.querySelector("textarea.titel"); if (t) t.focus(); }
}

document.addEventListener("keydown", (e) => {
  if (location.hash !== "#mote" || dialog.open) return;
  const t = e.target;
  if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if (e.key === "ArrowRight" && S.mote.i < S.mote.ko.length - 1) { S.mote.i++; render(); }
  if (e.key === "ArrowLeft" && S.mote.i > 0) { S.mote.i--; render(); }
});

function vyLista(vy) {
  if (!S.bok) return kraverFil(vy);
  const L = S.lista;
  const ul = h("ul", { class: "lista" });
  const antal = h("p", { class: "hjalp" });
  const rita = () => {
    const q = L.sok.trim().toLowerCase();
    let rader = S.punkter.filter((pt) =>
      (L.skifte === "alla" || pt.skifte === L.skifte) &&
      (L.forslag === "alla" || forslag(pt) === L.forslag) &&
      (L.val === "alla" || (L.val === "utan" ? !pt.val : pt.val === L.val)) &&
      (!q || [pt.nr, pt.titel, pt.laset, pt.vem, pt.fonster, pt.nasta, pt.lardom, pt.kalla].join(" ").toLowerCase().includes(q)));
    rader = L.ordning === "mote" ? rader.sort(motesordning) : rader.sort((a, b) => String(a.nr).localeCompare(String(b.nr), "sv", { numeric: true }));
    antal.textContent = `${rader.length} av ${S.punkter.length} punkter`;
    byt(ul, ...rader.map((pt) => {
      const f = forslag(pt);
      const b = h("button", { type: "button", class: `listrad f-${FKLASS[f] || "parkera"}` },
        h("span", { class: "nr", text: pt.nr }),
        h("span", {},
          h("h3", { text: rubrik(pt) }),
          h("span", { class: "taggar" },
            pt.skifte ? h("span", { class: "tag", text: pt.skifte }) : null,
            h("span", { class: "tag", text: `Hävstång ${pt.havstang || "?"}` }),
            h("span", { class: "tag", text: `Räckvidd ${pt.rackvidd || "?"}` }),
            h("span", { class: "tag", text: `Fönster ${pt.fonsterNu || "?"}` }),
            forslagTag(pt), valTag(pt),
            arAndrad(pt) ? h("span", { class: "tag andrad", text: pt.original ? "Ändrad" : "Ny" }) : null),
          pt.laset ? p(pt.laset) : null,
          pt.nasta ? p("Nästa steg: " + pt.nasta, "nasta") : null));
      b.addEventListener("click", () => oppnaPunkt(pt));
      return h("li", {}, b);
    }));
  };
  const sel = (id, etikett, varden) => {
    const s = h("select", { class: "liten", "aria-label": etikett }, varden.map(([v, t]) => h("option", { value: v, selected: L[id] === v, text: t })));
    s.addEventListener("change", () => { L[id] = s.value; rita(); });
    return s;
  };
  const sok = h("input", { type: "search", class: "sok", placeholder: "Sök i alla fält", "aria-label": "Sök" });
  sok.value = L.sok;
  sok.addEventListener("input", () => { L.sok = sok.value; rita(); });
  lagg(vy, 
    h("h1", { text: "Alla punkter" }),
    h("div", { class: "verktyg" },
      sok,
      sel("skifte", "Skifte", [["alla", "Alla skiften"], ...listan("skifte", SKIFTEN).map((v) => [v, v])]),
      sel("forslag", "Förslag", [["alla", "Alla förslag"], ...["Ta upp nu", "Bevaka fönster", "Parkera"].map((v) => [v, v])]),
      sel("val", "Gruppens val", [["alla", "Alla val"], ["utan", "Utan gruppens val"], ...listan("val", VAL).map((v) => [v, v])]),
      sel("ordning", "Ordning", [["nr", "Ordning: nummer"], ["mote", "Ordning: som i mötet"]]),
      h("button", { type: "button", class: "ghost", onclick: () => oppnaPunkt(nyPunkt(), { ny: true }), text: "Lägg till nytt inspel" }),
    ),
    antal, ul,
  );
  rita();
}

function vySpara(vy) {
  if (!S.bok) return kraverFil(vy);
  const lista = andringar(S.punkter);
  const perPunkt = new Map();
  for (const a of lista) { if (!perPunkt.has(a.nr)) perPunkt.set(a.nr, { titel: a.titel, rader: [] }); perPunkt.get(a.nr).rader.push(a); }
  const namn = nyttFilnamn(S.filnamn);
  const knapp = h("button", { type: "button", text: "Ladda ner ny Excel-fil" });
  const besked = h("p", { class: "kvitto", "aria-live": "polite" });
  knapp.addEventListener("click", async () => {
    knapp.disabled = true;
    besked.textContent = "Skapar filen …";
    try {
      const data = await skrivArbetsbok(S.bok, S.punkter, env, { datum: idag() });
      const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = h("a", { href: url, download: namn });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const tid = new Date();
      S.nedladdad = { antal: lista.length, tid: `${String(tid.getHours()).padStart(2, "0")}:${String(tid.getMinutes()).padStart(2, "0")}` };
      besked.textContent = `Nedladdad kl. ${S.nedladdad.tid}: ${namn}. Spara den där ni har loggen.`;
      uppdateraStatus();
    } catch (err) {
      console.error(err);
      besked.textContent = "Filen gick inte att skapa. Inget har ändrats i originalet; prova igen eller hör av dig till dan@mickla.se.";
    } finally { knapp.disabled = false; }
  });
  if (S.nedladdad && S.nedladdad.antal === lista.length) besked.textContent = `Nedladdad kl. ${S.nedladdad.tid}: ${namn}.`;

  lagg(vy, 
    h("div", { class: "smal" },
      h("h1", { text: "Spara ny fil" }),
      p(lista.length ? `Mötet har gett ${lista.length} ${lista.length === 1 ? "ändring" : "ändringar"} i ${perPunkt.size} ${perPunkt.size === 1 ? "punkt" : "punkter"}.` : "Inga ändringar ännu. Ni kan ändå ladda ner en kopia med en mötesflik som visar att inget ändrades.", "lead"),
      h("div", { class: "card" },
        h("h3", { text: namn }),
        h("ul", { class: "instruktion" },
          h("li", { text: "Samma flikar, formler, rullgardiner och färger som originalet. Originalfilen ändras inte." }),
          h("li", { text: `Ändrade och nya rader får ${idag()} i kolumnen Uppdaterad. Nya punkter läggs i de första tomma raderna.` }),
          h("li", { text: `En ny flik, Mötet ${idag()}, visar före och efter för varje ändring.` }),
          h("li", { text: "Fliken Logg och fliken Översikt visar läget efter mötet, även i förhandsvisning och skyddad vy." }),
        ),
        h("div", { class: "actions" }, knapp),
        besked,
      ),
      lista.length ? h("h2", { text: "Det här ändrades" }) : null,
      lista.length ? h("ul", { class: "andringar" }, [...perPunkt.entries()].map(([nr, x]) => h("li", {},
        h("h3", { text: `${nr} ${x.titel || "(utan rubrik)"}` }),
        h("table", {}, h("tbody", {}, x.rader.map((a) => a.falt === "Nytt inspel"
          ? h("tr", {}, h("th", { text: "Nytt inspel" }), h("td", { colspan: 2, text: a.efter || "Läggs till i loggen" }))
          : h("tr", {}, h("th", { text: a.falt }), h("td", { class: "fore", text: a.fore || "(tomt)" }), h("td", { text: a.efter || "(tomt)" }))))),
      ))) : null,
    ),
  );
}

function vyInstruktion(vy) {
  const fas = (namn, text) => h("li", { class: "fas" }, h("span", { class: "fas-namn", text: namn }), h("span", { class: "fas-text", text }));
  lagg(vy, h("div", { class: "smal" },
    h("h1", { text: "Så fungerar det" }),
    p("Hävstångskartan gör loggen över hävstångspunkter och möjlighetsfönster överskådlig på mötet. Excel-filen är fortfarande originalet; verktyget läser den, låter er prioritera och ger en ny fil tillbaka.", "lead"),
    h("figure", { class: "karta" },
      h("div", { class: "zon webblasare" },
        h("div", { class: "zon-namn", text: "I din webbläsare: filen lämnar aldrig datorn" }),
        h("ol", { class: "faser", style: null },
          fas("Förbered", "Lägg in nya inspel i loggen och läs in filen."),
          fas("Överblicka", "Kartan visar hävstång mot fönster."),
          fas("Välj", "Mötet tar punkterna en i taget."),
          fas("Spara", "Ladda ner en ny Excel-fil."),
        )),
      h("p", { class: "overgang", text: "Den nya filen sparas där ni har loggen och läses in igen vid utvärderingsmötet, där ni fyller i lärdomen efter cykeln." }),
    ),
    h("ol", { class: "instr-steg" },
      h("li", {}, h("h3", { text: "Förbered" }),
        p("Lägg in nya inspel i Excel-loggen som vanligt, en rad per hävstångspunkt. Öppna Hävstångskartan och dra in filen eller välj den. Kontrollera att antalet punkter stämmer.")),
      h("li", {}, h("h3", { text: "Överblicka på kartan" }),
        p("Varje punkt ligger efter hävstång (nedåt) och fönster (i sidled), som på fliken Översikt. Kantens färg visar verktygets förslag: grön för Ta upp nu, ockra för Bevaka fönster, grå för Parkera. Streckad kant betyder att räckvidden är låg. Rutan uppe till vänster, hög hävstång och öppet fönster, diskuteras först. Klicka på en punkt för att läsa och ändra den.")),
      h("li", {}, h("h3", { text: "Samtala och välj i mötesläget" }),
        p("Mötet visar en punkt i taget. Justera hävstång, räckvidd och fönster om samtalet ger skäl; förslaget räknas om direkt. Välj Gruppens val och skriv nästa steg och ansvarig. Nya inspel som kommer upp läggs till med Lägg till nytt inspel; fyll i det ni vet, resten kan vänta. Dela skärmen i Teams eller visa på storbild; piltangenterna bläddrar.")),
      h("li", {}, h("h3", { text: "Spara den nya filen" }),
        p("Under Spara ny fil ser ni allt som ändrats. Ladda ner den nya Excel-filen och spara den där ni har loggen. Fliken Logg och fliken Översikt visar läget efter mötet, och en ny flik visar före och efter. Formler och rullgardiner följer med. Originalfilen ändras inte.")),
      h("li", {}, h("h3", { text: "Lär efter cykeln" }),
        p("På utvärderingsmötet läser ni in den nya filen, fyller i Lärdom efter cykeln, justerar bedömningarna och sätter Gruppens val till Klar, Bevaka eller Parkera.")),
    ),
    h("h2", { text: "Inspel mellan mötena" }),
    p("Projektgruppen skickar inspel med formuläret Skicka inspel. Det öppnar ett färdigt mejl med ämnet Inspel till ShiftSweden i avsändarens eget mejlprogram, med samma uppgifter som kolumnerna i loggen. Filer bifogas i mejlet. Dan för in mejlen i loggen före mötet; inspel som gäller en befintlig punkt fyller tomma fält och får tillägg, och bedömningar som skiljer sig lämnas som förslag till gruppen på fliken Inspel. Under mötet används Lägg till nytt inspel direkt på kartan."),
    h("h2", { text: "Förslaget" }),
    p("Förslaget räknas som i Excel-mallen. Ta upp nu när fönstret är öppet nu och varken hävstång eller räckvidd är låg. Bevaka fönster när hävstången är hög men punkten inte uppfyller det första. Annars Parkera. Förslaget är en utgångspunkt; det är gruppens val som gäller."),
    h("h2", { text: "Bra att veta" }),
    h("ul", { class: "instruktion" },
      h("li", { text: "Inget sparas i webbläsaren och inget skickas någonstans. Stänger du fliken innan du laddat ner den nya filen försvinner mötets ändringar; webbläsaren varnar först." }),
      h("li", { text: "Filen behöver mallens kolumner, från Nr till Uppdaterad. Ordningen spelar ingen roll, och fliken heter helst Logg." }),
      h("li", { text: "På kartan kan ni dra en punkt till en annan ruta med musen. Det ändrar fönster (i sidled) eller hävstång (i höjdled) och räknas som en ändring i den nya filen. Ångra flytten finns direkt efter. Låt muspekaren vila på en punkt för att se fönstertexten. På telefon och surfplatta öppnar ni punkten i stället." }),
      h("li", { text: "Ett nytt inspel behöver bara det ni vet. Det får nästa nummer, källan Inspel på mötet och dagens datum, och syns under Inte bedömda ännu på kartan tills hävstång och fönster är satta." }),
      h("li", { text: "Pröva gärna först med det påhittade exemplet på startsidan." }),
      h("li", { text: "Verktyget är ett diskussionsunderlag, inte en mätning." }),
    ),
    h("h2", { text: "Om verktyget" }),
    p("Hävstångskartan är utvecklad av IQ Samhällsbyggnad och Engströms Mickla AB. Frågor och förslag: dan@mickla.se."),
  ));
}

// ---------- Skicka inspel (för projektgruppen, mellan mötena) ----------
// Formuläret bygger ett mejl som öppnas i besökarens eget mejlprogram. Inget skickas och inget sparas av sajten.

function tomtForm() {
  return { avsandare: "", organisation: "", punkt: "", titel: "", laset: "", vem: "", fonster: "", havstang: "", rackvidd: "", fonsterNu: "", skifte: "", lankar: [""] };
}

function vyInspel(vy) {
  if (!S.form) S.form = tomtForm();
  const F = S.form;
  const forhand = h("pre", { class: "mejltext" });
  const oppna = h("a", { class: "btn", href: "#inspel", text: "Öppna mejlet i mitt mejlprogram" });
  const kopiera = h("button", { type: "button", class: "ghost", text: "Kopiera texten" });
  const besked = h("p", { class: "kvitto", "aria-live": "polite" });
  const langd = h("p", { class: "note strong", hidden: true });

  const uppdatera = () => {
    const mejl = byggMejl({ ...F, datum: idag() });
    forhand.textContent = `Till: ${mejl.till}\nÄmne: ${mejl.amne}\n\n${mejl.text}`;
    const ok = harInspel(F);
    oppna.setAttribute("href", ok ? mailtoLank(mejl) : "#inspel");
    oppna.classList.toggle("avstangd", !ok);
    oppna.setAttribute("aria-disabled", String(!ok));
    kopiera.disabled = !ok;
    const lang = mailtoLank(mejl).length > MAX_LANGD;
    langd.hidden = !lang;
    langd.textContent = lang ? `Mejlet är långt, och vissa mejlprogram kortar det när det öppnas härifrån. Använd hellre Kopiera texten och klistra in i ett nytt mejl till ${MOTTAGARE} med ämnet "${AMNE}".` : "";
  };

  const textrad = (id, etikett, hjalp, { rader = 0, placeholder = "" } = {}) => {
    const fid = "in-" + id;
    const el = rader ? h("textarea", { id: fid, rows: rader, placeholder }) : h("input", { id: fid, type: "text", placeholder });
    el.value = F[id];
    el.addEventListener("input", () => { F[id] = el.value; uppdatera(); });
    if (rader) autohojd(el);
    return h("div", { class: "falt" }, h("label", { for: fid, text: etikett }), hjalp ? h("span", { class: "hjalp small", text: hjalp }) : null, el);
  };
  const val = (id, etikett, varden, hjalp) => {
    const grupp = h("div", { class: "segment", role: "group", "aria-label": etikett });
    const knappar = varden.map((v) => h("button", { type: "button", "data-v": v, "aria-pressed": String(F[id] === v), text: v }));
    knappar.forEach((b) => b.addEventListener("click", () => {
      F[id] = F[id] === b.dataset.v ? "" : b.dataset.v;
      knappar.forEach((k) => k.setAttribute("aria-pressed", String(k.dataset.v === F[id])));
      uppdatera();
    }));
    grupp.append(...knappar);
    return h("div", { class: "falt" }, h("div", { class: "etikett", text: etikett }), hjalp ? h("span", { class: "hjalp small", text: hjalp }) : null, grupp);
  };

  const lankLista = h("div", { class: "lankar" });
  const ritaLankar = () => {
    byt(lankLista, F.lankar.map((l, i) => {
      const inp = h("input", { type: "text", inputmode: "url", placeholder: "https://", "aria-label": `Länk ${i + 1}` });
      inp.value = l;
      inp.addEventListener("input", () => { F.lankar[i] = inp.value; uppdatera(); });
      const bort = h("button", { type: "button", class: "lank", text: "Ta bort", onclick: () => { F.lankar.splice(i, 1); if (!F.lankar.length) F.lankar.push(""); ritaLankar(); uppdatera(); } });
      return h("div", { class: "lankrad" }, inp, F.lankar.length > 1 || l ? bort : null);
    }));
  };
  ritaLankar();

  oppna.addEventListener("click", (e) => {
    if (!harInspel(F)) { e.preventDefault(); besked.textContent = "Fyll i minst ett fält först."; return; }
    besked.textContent = "Mejlet öppnas i ditt mejlprogram. Bifoga eventuella filer och tryck på skicka där. Töm sedan formuläret om du vill skicka ett inspel till.";
  });
  kopiera.addEventListener("click", async () => {
    const mejl = byggMejl({ ...F, datum: idag() });
    try { await navigator.clipboard.writeText(mejl.text); besked.textContent = `Texten är kopierad. Klistra in den i ett nytt mejl till ${MOTTAGARE} med ämnet "${AMNE}".`; }
    catch { besked.textContent = "Kopieringen gick inte. Markera texten under Se mejlet och kopiera den själv."; }
  });

  lagg(vy, h("div", { class: "smal" },
    h("div", { class: "eyebrow", text: "För projektgruppen" }),
    h("h1", { text: "Skicka ett inspel" }),
    p("Har du hittat en hävstångspunkt, ett lås eller ett möjlighetsfönster? Fyll i det du vet; inget fält är obligatoriskt. Formuläret öppnar ett färdigt mejl till Dan i ditt eget mejlprogram, och inspelet läggs in i loggen inför nästa möte.", "lead"),
    h("span", { class: "fritt", text: "Inget skickas förrän du själv trycker på skicka i ditt mejlprogram." }),
    h("section", { class: "card" },
      h("h3", { text: "Från" }),
      h("div", { class: "tvaspalt" },
        textrad("avsandare", "Ditt namn"),
        textrad("organisation", "Organisation"),
      ),
      textrad("punkt", "Gäller befintlig punkt (frivilligt)", "Skriv numret, till exempel HP-012, om inspelet hör till en punkt som redan finns i loggen."),
    ),
    h("section", { class: "card" },
      h("h3", { text: "Inspelet" }),
      textrad("titel", "Hävstångspunkt", "En kort rubrik."),
      textrad("laset", "Låset", "Vad hindrar? Gärna en mening.", { rader: 2 }),
      textrad("vem", "Vem kan agera", "Myndigheter, kommuner, företag eller andra som kan rubba låset.", { rader: 2 }),
      textrad("fonster", "Fönster: vad öppnar sig?", "Ett beslut, en utredning, en upphandling, ett stort projekt. Skriv gärna datum och hur säker uppgiften är.", { rader: 3 }),
    ),
    h("section", { class: "card" },
      h("h3", { text: "Din bedömning" }),
      p("Hoppa över det du inte vet. Klicka igen för att ångra ett val.", "hjalp small"),
      h("div", { class: "bedomning" },
        val("havstang", "Hävstång", SKALA, "Hur stor effekt blir det om låset rubbas?"),
        val("rackvidd", "Räckvidd", SKALA, "Kan vi nå de som kan agera?"),
        val("fonsterNu", "Fönster nu?", FONSTER),
        val("skifte", "Skifte", SKIFTEN),
      ),
    ),
    h("section", { class: "card" },
      h("h3", { text: "Källor" }),
      p("Lägg till länkar till rapporter, beslut eller artiklar, så många du vill.", "hjalp small"),
      lankLista,
      h("button", { type: "button", class: "ghost", text: "Lägg till länk", onclick: () => { F.lankar.push(""); ritaLankar(); uppdatera(); lankLista.querySelector(".lankrad:last-child input")?.focus(); } }),
      p("Har du en fil, till exempel en rapport eller ett PM? Bifoga den i mejlet innan du skickar. Det går inte att bifoga filer från formuläret.", "note strong"),
    ),
    langd,
    h("div", { class: "actions" },
      oppna, kopiera,
      h("button", { type: "button", class: "ghost", text: "Töm formuläret", onclick: () => { S.form = tomtForm(); render(); } }),
    ),
    besked,
    h("details", { class: "forhand" }, h("summary", { text: "Se mejlet" }), forhand),
    p(`Mejlet går till ${MOTTAGARE} med ämnet "${AMNE}". Uppgifterna används bara för att föra in inspelet i projektets logg; ditt namn och din organisation står i loggens kolumn Källa.`, "hjalp small"),
  ));
  uppdatera();
}

const VYER = { start: vyStart, karta: vyKarta, mote: vyMote, lista: vyLista, spara: vySpara, inspel: vyInspel, instruktion: vyInstruktion };

function render() {
  const namn = (location.hash || "#start").slice(1);
  const vyNamn = VYER[namn] ? namn : "start";
  const vy = document.getElementById("vy");
  rensaTommaNya(vyNamn === "mote" ? S.mote.ko[S.mote.i] : null);
  vy.replaceChildren();
  VYER[vyNamn](vy);
  for (const a of document.querySelectorAll(".toplinks a")) {
    if (a.dataset.vy === vyNamn) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  uppdateraStatus();
}

let senasteVy = null;
window.addEventListener("hashchange", () => {
  if (dialog.open) dialog.close();
  const ny = (location.hash || "#start").slice(1);
  if (ny === "start") S.bytFil = false;
  if (ny !== "karta") S.flytt = null;
  senasteVy = ny;
  render();
  window.scrollTo(0, 0);
});

document.getElementById("version").textContent = `Hävstångskartan · ${VERSION}`;
senasteVy = (location.hash || "#start").slice(1);
render();
