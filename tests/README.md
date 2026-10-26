# Tests für den Familienkalender

Die App selbst braucht keinen Build-Schritt und kein `npm`. `package.json` gibt es nur für die Tests:

- **Unit-Tests** (`tests/unit/*.test.js`) mit dem eingebauten Test-Runner von Node (`node:test`, `node:assert/strict`).
  Sie prüfen die reinen Module ohne DOM und ohne Netz: Regeln (`src/domain`), View-Modelle und Store (`src/app`),
  Umrechnung von/zu Google Kalender (`src/calendar`) und Push-Plan/-Verschlüsselung (`src/push`).
- **End-to-End-Tests** (`tests/e2e/*.spec.js`) mit Playwright in Chromium, im Telefonformat (390 × 844, Touch; die Tab-Leiste
  zusätzlich mit 375 px Breite). Sie starten die echte Seite über einen kleinen statischen Server (`tests/server.mjs`, Port 8141) –
  meist im Demo-Modus, dazu im Google-Modus ohne Netz: aus einem gespeicherten Stand oder angemeldet über eine Attrappe von
  Google-Anmeldung und Kalender-API (`tests/e2e/hilfen.js`).

## Einrichten

Voraussetzung: **Node.js 22** oder neuer. Die Befehle sind unter Windows (PowerShell oder Eingabeaufforderung), macOS und Linux gleich:

```sh
npm install
npx playwright install chromium
```

(`npx playwright install chromium` lädt den passenden Chromium einmalig herunter; unter Linux ggf. `npx playwright install --with-deps chromium`.)

## Ausführen

```sh
npm test               # Unit-Tests (dauert etwa 2 Sekunden)
npm run test:e2e       # End-to-End-Tests in allen drei Aussehen (startet den Server selbst, etwa 4 Minuten)
npm run test:alle      # beides nacheinander
npm run test:visuell   # Klassisch Pixel für Pixel gegen die Basis in tests/visuell/__basis__/ (git-ignoriert; erzeugt auf 097adc4, siehe tests/visuell/klassisch.spec.js)
npm run test:kontrast  # Kontrast ≥ 4,5:1 (Buchstabenpixel gegen den Hintergrund) und Ziele ≥ 44 px, alle Bildschirme × 3 Aussehen × Hell/Dunkel (etwa 10 Minuten)
npm run test:leistung  # Bewegung auf 4× langsamerer CPU: lange Aufgaben und verlorene Bilder in Glas und Bento (etwa 3 Minuten)
npm run test:webkit    # nur lokal: Glas und Bento in Safari/WebKit als iPhone (einmalig `npx playwright install webkit`)
node tests/visuell/galerie.mjs   # Fotos aller Bildschirme × 3 Aussehen × Hell/Dunkel mit index.html (Standard: .superpowers/…/screens/task-10)
```

`kontrast.mjs` nimmt `--aussehen glas,bento`, `--modus dunkel`, `--bildschirm heute,monat`, `--breite 360` (z. B. Samsung mit größerer
Anzeige) und `--json datei`; `galerie.mjs` dazu `--browser webkit` und `--ordner`. Der WebKit-Port für Windows rechnet variable
Schriften nicht (alles erscheint dünn) – Schriftstärken also nur auf dem echten iPhone beurteilen.

Einzelne Dateien oder Tests:

```sh
node --test tests/unit/titles.test.js
node --test --test-name-pattern="Mutter-Kind-Pass" tests/unit/classify.test.js
npx playwright test tests/e2e/mehr.spec.js
npx playwright test --project=telefon-chromium   # nur Klassisch (telefon-glas, telefon-bento: die anderen Aussehen)
npx playwright test -g "Intro beim Betreten"
npx playwright test --headed          # mit sichtbarem Browser
npx playwright test --ui              # interaktiv, mit Zeitreise durch jeden Schritt
npx playwright show-trace test-results/<ordner>/trace.zip   # nach einem Fehler
```

Die App von Hand im Browser ansehen (derselbe Server wie in den Tests): `node tests/server.mjs` und dann <http://127.0.0.1:8141/> öffnen.
Läuft der Server schon, verwenden ihn die End-to-End-Tests lokal mit.

Wie auf dem CI-Server (eine Wiederholung bei Fehlern, HTML-Bericht in `playwright-report/`):

```sh
# macOS/Linux
CI=1 npm run test:e2e
# Windows PowerShell
$env:CI=1; npm run test:e2e
```

## Was abgedeckt ist

| Datei | Inhalt |
| --- | --- |
| `unit/dates.test.js` | Datumsrechnung, Werktage, Wiener Datum, Zeitumstellung, Feiertage, Zeitspannen, Wien ↔ Zeitpunkt |
| `unit/titles.test.js` | Kalendertitel bauen und zurücklesen (Für wen, Mitnehmen, Kosten, Trennzeichen), Kita-Sachen, Formate |
| `unit/classify.test.js` | Typ eines Google-Ereignisses, Arzt-Untertypen, alte „EKP“-Titel und neuer „Mutter-Kind-Pass“/„MuKi-Pass“ |
| `unit/settings.test.js` | Standardwerte, jede ungültige Einstellung, Mitnehmen-Listen |
| `unit/types.test.js` | Stammdaten stimmig, Standard-Arzttermine passen in 60 Zeichen |
| `unit/konto.test.js`, `unit/einkauf.test.js` | Kontostand (Cent, Monatsende, Nachtragen, Sonderbeträge) und Einkaufsliste |
| `unit/domain-regeln.test.js` | Konflikte, IDs, Urlaubsstand, offene Tage, Notiz, Eingabe von Zeit/Datum, Hell/Dunkel (inkl. `theme-init.js` gegen die Regeln, jede Kombination mit Aussehen und Bewegung) |
| `unit/aussehen.test.js`, `unit/darstellung.test.js` | Aussehen (Klassisch/Glas/Bento) und Bewegung: gültige Werte, theme-color je Aussehen × Hell/Dunkel; Anwenden zur Laufzeit (Attribute, Metas, Speicher, gesperrter Speicher) |
| `unit/termin.test.js`, `unit/serie.test.js` | Termin-Formular (Prüfung, Entwurf, Vorschau mit Zeichenzahl) und Serien für Sachen |
| `unit/nachrichten.test.js` | Jeder Anlass ergibt einen Text, „in die Krabbelstube“/„in den Kindergarten“, sie/er/Name, WhatsApp/SMS/E-Mail |
| `unit/app-hilfen.test.js` | Sicherung als Datei, Listen, Urlaub-Checks, Versionsprüfung, deutsche Datumstexte |
| `unit/views-*.test.js` | View-Modelle: Heute, Monat, Tag, Urlaub, Neu, Sachen, Einkauf, Kontostand (mit Diagramm-Geometrie), Verlauf, Verbindung |
| `unit/store.test.js` | Store mit Demo-Adapter: sofort sichtbar, Fehler, abgelaufene Anmeldung, Rückgängig, Serien, Einkauf, Kontostand |
| `unit/mapping.test.js` | Google-Ereignisse ↔ App (alle Arten, Uhrzeit-Korrektur, versteckte Ereignisse), Zusammenfassung mit Konflikten |
| `unit/speicher.test.js` | Konfiguration, gespeicherter Stand (strenge Prüfung, Größe), Einrichtungscode, Freigabe |
| `unit/schicht.test.js` | Schichtplan-Regeln: Schichtarten (Kürzel, nie wiederverwendete Schlüssel, ausblenden, ordnen, Zusatz mit Uhrzeit), Monat (Länge, Schaltjahr), Pinsel/Setzen/Notiz/Zusatz idempotent, Größe ≤ 6000 Zeichen, Zählung, kaputte Daten |
| `unit/schicht-speicher.test.js` | Schichtplan im Demo- und Google-Adapter (versteckte Ereignisse `fkschichtarten`, `fksch<JJJJMM>`) und Beispieldaten |
| `unit/schicht-model.test.js` | View-Modelle des Schichtplans: Monatsraster (Muster Urlaub/offen), Filter dieses Telefons, Pinsel, Tagesblatt (Zusatz-Arten mit Hinweis auf die Erinnerung), Schichtarten bearbeiten (Entwurf mit „Erinnern“) |
| `unit/schicht-abgleich.test.js`, `unit/schicht-farben.test.js` | Abgleich alle 30 Sekunden und bei der Rückkehr (höchstens einmal pro Minute); Farbpalette hell/dunkel im Theme (Kontrast der Kürzel) |
| `unit/blatt-ziehen.test.js` | Blätter nach unten wischen: ab 100 px oder kurz und schnell geworfen schließt, sonst zurück; Totzone und Richtung eines Zugs |
| `unit/push-*.test.js` | Push-Plan (Zeiten in Wien, Zeitumstellung, Monatsende) und Meldungen (RFC-8291-Testvektor, Entschlüsselung, stabiles `h`) |
| `unit/design-tokens.test.js` | Design-Tokens in `theme.css` (Werte von Klassisch, Liste im Kopf, alte Namen ersetzt) und lokale Schriften (`FK …`, woff2, ≤ 250 KB, OFL-Texte) |
| `e2e/schriften.spec.js` | In allen drei Aussehen keine Anfrage an einen anderen Ursprung; Klassisch lädt die neuen Schriften nie; `font/woff2` |
| `visuell/klassisch.spec.js` | Visuelle Regression Klassisch (Hell, Dunkel per System, Dunkel gewählt): alle Seiten und Blätter, Willkommen, Datenschutz, Meldung, Rückfrage, Formulare (Termin, Fixkosten, Sparziel, Sachen, Schichtart), Schichtarten, Ersatzdienst gestreift, Konflikt, Einrichtung, Code-Fehler, Verbindung (Karte, Banner, Fehler), Fokusring, gesperrter Knopf, Mehr aufgeklappt |
| `e2e/willkommen.spec.js` | Erster Start mit drei Wegen, Demo starten, falscher Code |
| `e2e/tabs.spec.js` | Tab-Leiste: acht Registerkarten (Heute, Monat, Einkauf, ＋ Neu, Schicht, Urlaub, Konto, Mehr), Fenstertitel je Seite („Kontostand“ für `#/konto`, „Schichtplan“ für `#/schicht`), Einkauf und Kontostand ohne „‹ Zurück“, „＋ Neu“ rund an vierter Stelle, bei 320, 375 und 390 px nichts abgeschnitten oder überlappt |
| `e2e/heute.spec.js` | Abschnitte, „Demnächst“ als kompakte Zeilen (Antippen öffnet den Tag), Schnell-Eintrag, offene Tage, Wochenende, Kontostand am Monatsende, Sachen erledigt |
| `e2e/monat.spec.js` | Blättern, Tagesblatt mit „Eintragen“, Typ setzen und im Raster sehen; „Neu an diesem Tag“ (Arzttermin, Termin, Sachen mit dem angetippten Tag); „Bringen & Abholen“ im Tagesblatt (nur künftige Betreuungstage, nur für diesen Tag) |
| `e2e/neu.spec.js` | Jede Kachel öffnet ihr Formular; Mutter-Kind-Pass speichern und in Heute/Monat/Verlauf wiederfinden |
| `e2e/urlaub-einkauf.spec.js` | Urlaub (Stand, Jahre, planen, löschen) und Einkauf (Menge, abhaken, löschen, Rückgängig, Registerkarte ohne „Zurück“) |
| `e2e/einkauf-aktuell.spec.js` | Einkauf aktuell halten: Herunterziehen (echte Touch-Ereignisse) in der Demo und im Google-Modus, „Aktualisiert um …“, Abgleich alle 30 Sekunden nur bei offener Liste (Google-Attrappe, laufende Uhr) |
| `e2e/essensgeld.spec.js` | „Preis pro Mittagessen“ in Mehr → Betreuung (Schreibweisen, Fehler, Leeren = aus) und „Essensgeld: ca. … (N × … €)“ im Monat, nur mit Preis |
| `e2e/konto-verlauf.spec.js` | Kontostand-Diagramme und Eintragen in der Demo, „Sparen pro Monat“ (neueste drei, „Ältere anzeigen (N)“/„Weniger anzeigen“), „ⓘ Was sind Sonderbeträge?“; Verlauf mit Suche und Filtern |
| `e2e/fixkosten.spec.js` | Fixkosten im Konto-Tab (Demo): Umschalter „Kontostand · Fixkosten“ (gemerkt), Kopf und Filter mit Summen, „Diesen Monat fällig“ ohne Haken, Kategorien, „Kündbar bis“ mit ⚠, „monatlich kündbar“, Formular mit Vorlage/Intervall/Vertrag, Archivieren, Zurückholen, „Endgültig löschen“, Ziel `#/konto/fixkosten`, „Beispieldaten entfernen“, unlesbare Teile und ausgeblendete Posten (auch Google) |
| `e2e/mehr.spec.js` | Menü mit elf Zeilen (neun klappen auf, zwei führen weiter): Intro-Animation (elf `m-*`), Akkordeon, offen nach dem Speichern, reduzierte Bewegung, Wege; getippte Uhrzeit/Datum wird mit Enter bzw. beim Verlassen gespeichert |
| `e2e/nachrichten.spec.js` | Nachricht an Krabbelstube/Kindergarten: Wege (Heute, „Benachrichtigen“ nach „Krank“/„Abwesend“, Mehr), 14 Situationen, Heute/Morgen, Angaben, änderbarer Text, Links für WhatsApp (`wa.me/43…`), SMS und E-Mail, Teilen, Kopieren, Einstellungen (Kontakt, Gruß, Unterschrift, „Das Kind ist“) |
| `e2e/bringen-holen.spec.js` | Wer bringt, wer holt: Wochenplan in Mehr (— → 👨 Papa → 👩 Mama → —), Benachrichtigungen, „🚗 Heute“ mit Ausnahme nur für diesen Tag, am Abend „Morgen“ |
| `e2e/schichtplan.spec.js` | Schichtplan (Demo): Registerkarte „Schicht“, Monatsraster mit Streifen Papa/Mama, Monatswechsel, Filter (gemerkt), Zählung, Legende; 375 und 320 px ohne Abschneiden; Pinsel, Tagesblatt (Art, Notiz, „＋ Dienstbesprechung“ mit Uhrzeit und Hinweis auf die Erinnerung), Ersatzdienst E gestreift wie Urlaub (Raster, Legende, Pinsel), Schichtarten anlegen/ändern/ausblenden/ordnen, Haken „🔔 Erinnern“ bei Zusätzen, alles nach dem Neuladen noch da |
| `e2e/schichtplan-google.spec.js` | Schichtplan mit der Google-Attrappe: erst die Seite liest `fkschichtarten` und drei Monate, der Pinsel schreibt `fksch202610` (Titel ohne Inhalt, JSON ≤ 6000 Zeichen, versteckt), nichts davon in Heute/Monat/Verlauf, ohne Netz nach dem Neuladen: besuchter Monat aus der Offline-Kopie, unbesuchter „Noch nicht geladen“; Hinweis unter „＋ Dienstbesprechung“ je nach Geräte-Register (Telefon von Mama da / fehlt / hier nicht zu sehen) |
| `e2e/blatt-wischen.spec.js` | Blätter nach unten wischen (echte Touch-Ereignisse): am Griff, an der Überschrift oder im Inhalt ganz oben schließt (Tagesblatt in Schicht und Monat, Notiz gespeichert), 40 px langsam springt zurück, kurzer Wurf schließt, gescrollter Inhalt scrollt, seitlich und aus Eingabefeldern kein Zug; am Griff auch nach dem Antippen eines Uhrzeit-Felds (markierter Wert) und nach langem Drücken, Neuzeichnen mitten im Zug hängt nicht fest, Wischen verlässt das Eingabefeld; ✕/Escape/Hintergrund/Wischen rufen `beimSchliessen` genau einmal; mit und ohne Bewegung; kein Neuladen durch Herunterziehen (html/body `overscroll-behavior-y: none`, auch zwei Blätter, Einkaufsliste danach wieder `contain`) |
| `e2e/app.spec.js` | Konto & App: Karten, Hell/Dunkel, Sicherung als Download, Demo zurücksetzen, Version |
| `e2e/aussehen.spec.js` | Aussehen und Bewegung in „Darstellung“ (nur Projekt Klassisch): sofort und nach dem Neuladen, zurück zu Klassisch ohne Attribut, Wechsel bei offenem Blatt, kaputte Werte → Klassisch, `aria-pressed` und Fokus nach der Wahl, offline mit Service Worker (`themes/glas.css` aus dem Zwischenspeicher, Gegenprobe: Ungespeichertes kommt nicht; dafür setzt `playwright.config.js` `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`) |
| `e2e/aussehen-fokus.spec.js` | Glas und Bento: Tab durch Heute, Monat (mit Konflikt), Schicht, Konto, Einkauf, Urlaub, Mehr, Neu und das Tagesblatt – jedes Bedienelement zeigt einen Fokusring (Umriss oder Schatten, den es ohne Fokus nicht hat) |
| `e2e/aussehen-ziele.spec.js` | Glas und Bento: Tab-Karten, Tage in Monat und Schichtplan ≥ 44 px bei 360/375/384 px Breite, Schließen-Knopf 44 × 44 neben langem Blatt-Titel, ein Chip wird beim Wählen nicht breiter |
| `e2e/google.spec.js` | Google-Modus ohne Netz aus dem gespeicherten Stand: Banner, Status in Mehr, fünf Karten, „Dieses Telefon gehört“; Login-Dienst aus: Verhalten wie bisher (Token-Weg, „gilt eine Stunde“, keine Sitzung, keine Anfrage an den Dienst) |

Vermutete Fehler in `src/` sind als offene Tests markiert (`{ todo: … }` bei den Unit-Tests, `test.fixme` bei Playwright)
und stehen dort mit Datei und Zeile im Kommentar. Wird ein Fehler behoben, die Markierung entfernen.

## Neue Tests schreiben

**Unit-Tests**

- Datei `tests/unit/<thema>.test.js`, Testnamen auf Deutsch, kurz und genau („Urlaub schlägt einen Tageseintrag“).
- `import { test, describe } from 'node:test'` und `import assert from 'node:assert/strict'`; Module direkt aus `../../src/…` laden.
- Helfer in `tests/unit/hilfen.js`: `zustand({ … })` baut einen kleinen Zustand mit Standard-Einstellungen,
  `speicherAttrappe()` ersetzt `localStorage` (mit `{ kaputt: true }` wirft jeder Zugriff).
- Immer ein festes Datum übergeben (`heute`, `jetzt`), nie die echte Uhr. WebCrypto (`globalThis.crypto`) ist in Node 22 da.
- Verhalten prüfen, nicht Zeilen: Grenzfälle (Monatsende, Zeitumstellung, Feiertage, leere/ungültige Eingaben) lohnen sich.

**End-to-End-Tests**

- Datei `tests/e2e/<bereich>.spec.js`; `test`, `expect` und Helfer **aus `./hilfen.js`** importieren, nicht direkt aus Playwright:
  dort hängt die Wache, die jeden `pageerror` und jedes `console.error` zum Fehler macht.
- `await starteDemo(page, { route: '#/monat' })` startet die Demo zur festen Zeit (Mittwoch, 14.10.2026, 08:00 Wien);
  mit `zeit: '…'` eine andere Uhrzeit, mit `speicher: { … }` vorbelegter `localStorage`.
  `starteGoogleAusSnapshot(page)` startet den Google-Modus ohne Netz (dazu `test.use({ erlaubteFehler: NETZFEHLER })`).
  `starteGoogleVerbunden(page, { einkauf, ereignisse, listenMitAllen, uhrLaeuft })` meldet sich über eine Attrappe an (Google-Skript und
  Kalender-API im Test, siehe `googleAttrappe`); das Ergebnis zählt die Anfragen (`anfragen`, geschrieben: `geschrieben`), zeigt mit
  `ereignis(id)` den gespeicherten Stand und spielt mit `setzeEinkauf(liste)`/`setzeSchichtarten(katalog)` das andere Telefon.
- Uhr: Standard ist eine stehende Uhr (`page.clock.setFixedTime`). Wer Zeitgeber prüft (z. B. den 30-Sekunden-Abgleich), lässt sie
  laufen (`uhrLaeuft: true`, intern `page.clock.install`) und springt mit `page.clock.fastForward(…)` – nie mit festen Wartezeiten.
- Wischen und Ziehen: echte Touch-Ereignisse über das DevTools-Protokoll (`Input.dispatchTouchEvent`, siehe `einkauf-aktuell.spec.js`).
- Stabile Selektoren: Rollen und sichtbarer Text (`getByRole('button', { name: 'Speichern' })`), vorhandene IDs und Klassen
  (`#menue-betreuung`, `.menue-eintrag[data-id="familie"]`). Keine festen Wartezeiten – auf Zustände warten (`expect(…).toBeVisible()`).
- Drei Projekte, dieselbe Suite: `telefon-chromium` (Klassisch), `telefon-glas`, `telefon-bento`. Lokal kommen auf Wunsch
  `webkit-glas` und `webkit-bento` dazu (Safari-Engine als iPhone 17 Pro, nur die Dateien der Aussehen; `npm run test:webkit`). Die Option `aussehen` (in `hilfen.js`)
  legt `fk.aussehen.v1` einmal je Kontext vor dem Laden ab (Neuladen und neue Tabs behalten eine Wahl aus dem Test); im Test steht
  sie als Fixture `aussehen` bereit (null = Klassisch).
- Standard ist „reduzierte Bewegung“ (siehe `playwright.config.js`). Wer Animationen prüft, schaltet sie im Test wieder ein:
  `test.use({ contextOptions: { reducedMotion: 'no-preference' } })`. Achtung: die Option wirkt nur über `contextOptions`.

## CI

`.github/workflows/tests.yml` läuft bei Pushes auf `main`, `claude/**` und `agent/**` sowie bei Pull Requests:
Job `unit` (`npm ci`, `npm test`) und Job `e2e` (`npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e`).
Schlägt `e2e` fehl, liegen Bericht, Screenshots und Traces als Artefakt `playwright-report` bereit.
