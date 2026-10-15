# Hävstångskartan: havstang.mickla.se

Arbetsbeskrivning för den som utvecklar verktyget vidare, människa eller Claude.

## Sammanhang

- Verktyg för en arbetsgrupp som loggar hävstångspunkter och möjlighetsfönster i en Excel-mall och prioriterar dem på möten.
- Upphov: Dan Engström, Engströms Mickla AB. Dan äger allt innehåll; Claude föreslår, Dan beslutar.
- Logiken: först hävstångspunkter (var systemet går att rubba), sedan möjlighetsfönster (när). Excel-loggen ger fullständighet; verktyget ger överskådlighet och ett mötesflöde.
- Pilot (prototyp v0.1 och v0.2, 2026-10-15): Dan förbereder genom att läsa in loggen. Gruppen prioriterar på mötet. Efter mötet laddas en ny Excel-fil ner som speglar mötets beslut.

## Fasta principer

- Allt på svenska. Inga tankstreck (varken — eller –) i texter.
- **Loggen lämnar aldrig webbläsaren.** Filen läses från disken med JSZip och DOMParser och den nya filen laddas ner till disken. Ingen server, ingen statistik, inga kakor, inga externa typsnitt eller CDN. Content Security Policy i `publik/index.html` tillåter bara sidans egna filer.
- **Inget sparas i webbläsaren** (ingen localStorage). Mötets ändringar finns bara i minnet tills filen laddas ner; webbläsaren varnar om fliken stängs med ändringar som inte laddats ner.
- All text läggs in med DOM-metoder och `textContent`, aldrig `innerHTML`.
- **Publikt repo.** Riktiga loggar får aldrig läggas i repot. Bara den påhittade exempelfilen `publik/exempel/Exempel_logg_havstangspunkter.xlsx`. `.gitignore` stoppar andra `.xlsx`, och `scripts/kontrollera.mjs` stoppar publiceringen om något annat hamnar i `publik/exempel/`.
- Excel-filen är originalet. Verktyget skriver bara om de celler som ändrats; flikar, formler, rullgardiner, villkorsstyrd formatering och kolumnbredder lämnas orörda.
- Upphovsrad: "© Engströms Mickla AB 2026". Versionsnummer (`VERSION` i `publik/app.js` och i sidfoten i `index.html`) räknas upp vid varje publicering.

## Struktur

- `publik/`: det som publiceras.
  - `index.html`, `style.css` (Boosts formspråk), `app.js` (vyerna), `regler.js` (förslagsregeln, mötesordning, kolumner), `xlsx.js` (läsa och skriva Excel).
  - `vendor/jszip.min.js` (JSZip 3.10.1, MIT) med licens.
  - `exempel/`: den påhittade exempelfilen, samma struktur som mallen.
  - `img/mickla.png`: ormen.
- `test/`: Node-tester mot exempelfilen (`npm test`).
- `scripts/kontrollera.mjs`: inga externa adresser, ingen innerHTML, inga tankstreck, CSP finns, bara exempelfiler.
- `.github/workflows/publicera.yml`: kontroller och tester före varje publicering; publiceringen stoppas om något fallerar.

## Excel-mallen

- Fliken heter Logg (annars används första fliken). Rubrikraden hittas där Nr och Hävstångspunkt står (rad 4 i mallen). Kolumnerna hittas på rubrikerna, inte på bokstäverna: Nr, Hävstångspunkt, Låset, Vem kan agera, Skifte, Hävstång, Räckvidd, Fönster: vad öppnar sig?, Fönster nu?, Förslag, Gruppens val, Nästa steg och ansvarig, Lärdom efter cykeln, Källa, Uppdaterad.
- Valbara värden läses från filens rullgardiner (dataValidation); standardvärden finns i `regler.js`.
- Förslag: `Ta upp nu` när Fönster nu är Öppet nu och varken Hävstång eller Räckvidd är Låg; annars `Bevaka fönster` om Hävstång är Hög; annars `Parkera`. Samma som formeln i mallen. Ändras formeln i mallen ändras `forslag()` och testet.

## Den nya filen

- Ändrade celler skrivs som inline-text i samma stil som cellen hade. Ändrade och nya rader får dagens datum i Uppdaterad.
- Nya punkter får nästa nummer (HP-026 osv.) och läggs i första tomma raden efter loggen; radhöjden kopieras från första dataraden.
- Nya inspel på mötet (knappen "Lägg till nytt inspel", v0.3, Dans krav): inget fält är obligatoriskt. Inspelet sparas så snart något fält utöver Källa är ifyllt; Källa förifylls med "Inspel på mötet ÅÅÅÅ-MM-DD". Utan rubrik ger mallens formel tomt Förslag. Inspel utan hävstång eller fönster visas under "Inte bedömda ännu" på kartan. På mötesfliken listas inspelet med en rad "Nytt inspel" och en rad per ifyllt fält.
- Statusflikarna visar läget efter mötet direkt i filen (Dans krav 2026-10-15): Logg med ändringarna, Översikt med färdigräknade värden. Verktyget skriver de sparade värdena i Förslag och i Översiktens TEXTJOIN-formler (`uppdateraSammanstallningar` i `xlsx.js`), så att läget syns även i skyddad vy, förhandsvisning och på telefon där Excel inte räknar om. Formlerna lämnas orörda och arbetsboken får `fullCalcOnLoad`. Formler som inte följer mallens mönster lämnas åt Excel.
- En ny flik, `Mötet ÅÅÅÅ-MM-DD`, listar varje ändring med före och efter.
- Filnamn: originalets namn plus `_mote_ÅÅÅÅ-MM-DD.xlsx`.

## Vyer

- Loggen (`#start`): inläsning, påhittat exempel, sammanfattning.
- Kartan (`#karta`): hävstång mot fönster som på fliken Översikt. Kantfärg efter förslag, streckad kant vid låg räckvidd, prick vid ändring. Rutan Hög × Öppet nu markeras "Diskuteras först".
- Mötet (`#mote`): en punkt i taget i mötesordning (förslag, hävstång, räckvidd, nummer). Urval: Ta upp nu, Ta upp nu och Bevaka fönster, utan gruppens val, alla. Kön behålls när man går till andra vyer.
- Alla punkter (`#lista`): sök och filter.
- Spara ny fil (`#spara`): före och efter, nedladdning.
- Så fungerar det (`#instruktion`): processkarta och användarinstruktion.

## Beslut och öppna frågor

- Valt alternativ 1 av tre (2026-10-15): tomt verktyg som läser filen lokalt, i stället för inloggning med gemensam lagring eller en privat sida hos annan leverantör.
- Eget repo och egen subdomän, eftersom Boost är ägnat åt Learning Curve Approach.
- Öppet: om projektnamnet ska nämnas på sajten; om regeln för Förslag ska ge "Snart" med nära datum samma vikt som "Öppet nu"; om mallen ska få kolumnerna Fönsterdatum och Säkerhet (då kan en tidslinje byggas).

## Test

Kör `node scripts/kontrollera.mjs` och `npm test`. Kör hela flödet i en webbläsare (Playwright med Chromium) i datorstorlek och telefonstorlek innan något föreslås för publicering: läs in en logg, ändra i kartan och mötet, lägg till en punkt, ladda ner, öppna den nya filen och kontrollera att Översikt räknas om (LibreOffice går bra). Kontrollera att sidan inte gör några anrop utanför den egna domänen.

## Publicering

Dan laddar upp filer via GitHubs webbgränssnitt. Mappar som börjar med punkt (`.github`) följer inte med vid uppladdning och skapas i stället med Add file > Create new file. Publicera aldrig utan att Dan har sagt "publicera".
