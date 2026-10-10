# Tests für den Familienkalender

Die App selbst braucht keinen Build-Schritt und kein `npm`. `package.json` gibt es nur für die Tests:

- **Unit-Tests** (`tests/unit/*.test.js`) mit dem eingebauten Test-Runner von Node (`node:test`, `node:assert/strict`).
  Sie prüfen die reinen Module ohne DOM und ohne Netz: Regeln (`src/domain`), View-Modelle und Store (`src/app`),
  Umrechnung von/zu Google Kalender (`src/calendar`) und Push-Plan/-Verschlüsselung (`src/push`).
- **End-to-End-Tests** (`tests/e2e/*.spec.js`) mit Playwright in Chromium, im Telefonformat (390 × 844, Touch).
  Sie starten die echte Seite über einen kleinen statischen Server (`tests/server.mjs`, Port 8141) – meist im Demo-Modus,
  einmal im Google-Modus aus einem gespeicherten Stand (ohne Netz).

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
npm run test:e2e       # End-to-End-Tests (startet den Server selbst, etwa 1 Minute)
npm run test:alle      # beides nacheinander
```

Einzelne Dateien oder Tests:

```sh
node --test tests/unit/titles.test.js
node --test --test-name-pattern="Mutter-Kind-Pass" tests/unit/classify.test.js
npx playwright test tests/e2e/mehr.spec.js
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
| `unit/domain-regeln.test.js` | Konflikte, IDs, Urlaubsstand, offene Tage, Notiz, Eingabe von Zeit/Datum, Hell/Dunkel (inkl. `theme-init.js`) |
| `unit/termin.test.js`, `unit/serie.test.js` | Termin-Formular (Prüfung, Entwurf, Vorschau mit Zeichenzahl) und Serien für Sachen |
| `unit/nachrichten.test.js` | Jeder Anlass ergibt einen Text, „in die Krabbelstube“/„in den Kindergarten“, sie/er/Name, WhatsApp/SMS/E-Mail |
| `unit/app-hilfen.test.js` | Sicherung als Datei, Listen, Urlaub-Checks, Versionsprüfung, deutsche Datumstexte |
| `unit/views-*.test.js` | View-Modelle: Heute, Monat, Tag, Urlaub, Neu, Sachen, Einkauf, Kontostand (mit Diagramm-Geometrie), Verlauf, Verbindung |
| `unit/store.test.js` | Store mit Demo-Adapter: sofort sichtbar, Fehler, abgelaufene Anmeldung, Rückgängig, Serien, Einkauf, Kontostand |
| `unit/mapping.test.js` | Google-Ereignisse ↔ App (alle Arten, Uhrzeit-Korrektur, versteckte Ereignisse), Zusammenfassung mit Konflikten |
| `unit/speicher.test.js` | Konfiguration, gespeicherter Stand (strenge Prüfung, Größe), Einrichtungscode, Freigabe |
| `unit/push-*.test.js` | Push-Plan (Zeiten in Wien, Zeitumstellung, Monatsende) und Meldungen (RFC-8291-Testvektor, Entschlüsselung, stabiles `h`) |
| `e2e/willkommen.spec.js` | Erster Start mit drei Wegen, Demo starten, falscher Code |
| `e2e/heute.spec.js` | Abschnitte, Schnell-Eintrag, offene Tage, Wochenende, Kontostand am Monatsende, Sachen erledigt |
| `e2e/monat.spec.js` | Blättern, Tagesblatt mit „Eintragen“, Typ setzen und im Raster sehen |
| `e2e/neu.spec.js` | Jede Kachel öffnet ihr Formular; Mutter-Kind-Pass speichern und in Heute/Monat/Verlauf wiederfinden |
| `e2e/urlaub-einkauf.spec.js` | Urlaub (Stand, Jahre, planen, löschen) und Einkauf (Menge, abhaken, löschen, Rückgängig) |
| `e2e/konto-verlauf.spec.js` | Kontostand-Diagramme und Eintragen in der Demo; Verlauf mit Suche und Filtern |
| `e2e/mehr.spec.js` | Menü: Intro-Animation, Akkordeon, offen nach dem Speichern, reduzierte Bewegung, Wege |
| `e2e/app.spec.js` | Konto & App: Karten, Hell/Dunkel, Sicherung als Download, Demo zurücksetzen, Version |
| `e2e/google.spec.js` | Google-Modus ohne Netz aus dem gespeicherten Stand: Banner, Status in Mehr, fünf Karten |

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
- Stabile Selektoren: Rollen und sichtbarer Text (`getByRole('button', { name: 'Speichern' })`), vorhandene IDs und Klassen
  (`#menue-betreuung`, `.menue-eintrag[data-id="familie"]`). Keine festen Wartezeiten – auf Zustände warten (`expect(…).toBeVisible()`).
- Standard ist „reduzierte Bewegung“ (siehe `playwright.config.js`). Wer Animationen prüft, schaltet sie im Test wieder ein:
  `test.use({ contextOptions: { reducedMotion: 'no-preference' } })`. Achtung: die Option wirkt nur über `contextOptions`.

## CI

`.github/workflows/tests.yml` läuft bei Pushes auf `main`, `claude/**` und `agent/**` sowie bei Pull Requests:
Job `unit` (`npm ci`, `npm test`) und Job `e2e` (`npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e`).
Schlägt `e2e` fehl, liegen Bericht, Screenshots und Traces als Artefakt `playwright-report` bereit.
