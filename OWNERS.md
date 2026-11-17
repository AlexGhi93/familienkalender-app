# Ownership map for parallel agents

An agent edits only the files of its area. Hubs belong to the integrator: an area agent hands over a described change
(file, place, exact lines) instead of editing a hub. `tests/unit/agenten-doku.test.js` checks that every file under `src/`
and `themes/` is listed in exactly one area (`## Shared` is not an area) and that every path below exists.
Files not listed belong to the integrator (Nicht aufgeführte Dateien gehören dem Integrator). Format: `*` matches inside one path segment, `{a,b}` lists alternatives.

## Hubs
- `src/{shell,start,main}.js`, `src/ui/seiten.js`, `src/app/seiten-besuch.js`, `src/app/store.js`, `src/app/store/{kern,geteilt}.js`
- `src/app/{hintergrund,seed,sicherung,version,demo-adapter}.js`, `src/calendar/{mapping,google-adapter,snapshot}.js`, `src/push/plan.js`
- `themes/klassisch/basis.css`, `themes/glas.css`, `themes/bento.css`
- `index.html`, `datenschutz.html`, `sw.js`, `package.json`, `package-lock.json`, `playwright.config.js`, `playwright.visuell.config.js`
- `.github/workflows/tests.yml`, `.gitignore`, `manifest.webmanifest`, `fonts/*`, `icons/*`
- `tests/README.md`, `tests/duplikate-basis.json`, `tests/{duplikate,server}.mjs`, `tests/visuell/*`
- `tests/unit/hilfen.js`
- `tests/unit/{store,store-scheiben,hintergrund,mapping,speicher,app-hilfen,loeschen-rueckgaengig,seiten-besuch,sw,ebenen,agenten-doku}.test.js`
- `tests/e2e/{app,tabs,google}.spec.js`, `tests/e2e/hilfen.js`

## Base (shared helpers and look)
- `src/ui/{dom,components,eingabefelder,einstellungs-feld,fortschritt,bewegung,blatt-ziehen,darstellung,verbindung}.js`
- `src/ui/{formular,wischen,zwischenablage,mitnehmen-feld}.js`, `src/theme-init.js`
- `src/domain/{gemeinsam,unlesbar,aussehen,darstellung}.js`, `src/app/{einmal,speicher}.js`, `src/app/views/gemeinsam.js`
- `themes/klassisch/bewegung.css`
- `tests/unit/{bewegung,blatt-ziehen,darstellung,aussehen,design-tokens,datenschutz,gemeinsam,einmal,unlesbar,unlesbar-speicher}.test.js`
- `tests/unit/css-hilfen.js`, `tests/e2e/{bewegung,blatt-wischen,aussehen,aussehen-fokus,aussehen-formulare,schriften}.spec.js`

## Calendar core
- `src/domain/{dates,span,feiertage,format,types,titles,classify,ids,konflikt,umwandlung,offen,urlaub,urlaub-check,notiz,eingabe,fuer,modus,instant,dienst,termin-anzeige}.js`
- `src/app/{termin,serie,listen,format-de,nachrichten}.js`, `src/app/store/kalender.js`
- `src/app/views/{heute,monat,tag,neu,sachen,urlaub,dienst}-model.js`
- `src/ui/{heute,monat,neu,urlaub}-screen.js`, `src/ui/{tagesblatt,termin-formular,sachen-formular,sachen-aktionen,pyjamas-wechsel,bringen-holen,nachricht-blatt}.js`
- `themes/{monat,formulare}.css`, `themes/klassisch/{monat,formulare,heute}.css`
- `tests/unit/{dates,titles,classify,types,domain-regeln,dienst,termin,serie,nachrichten,views-tage}.test.js`
- `tests/e2e/{heute,aussehen-heute,monat,neu,bringen-holen,essensgeld,nachrichten,urlaub}.spec.js`

## Shopping list
- `src/domain/einkauf.js`, `src/app/einkauf-abgleich.js`, `src/app/views/einkauf-model.js`, `src/ui/einkauf-screen.js`
- `tests/unit/einkauf.test.js`, `tests/e2e/{einkauf,einkauf-aktuell}.spec.js`

## Account balances and history
- `src/domain/konto.js`, `src/app/store/einkauf-konto.js`, `src/app/views/{konto-model,konto-diagramm,verlauf-model}.js`
- `src/ui/{konto-screen,konto-karte,konto-diagramm,kontostand-karte,verlauf-screen}.js`
- `themes/konto.css`, `themes/klassisch/konto.css`
- `tests/unit/{konto,konto-bewegung,views-konto-verlauf}.test.js`, `tests/e2e/{konto-bewegung,konto-verlauf}.spec.js`

## Fixed costs
- `src/domain/fixkosten.js`, `src/app/store/fixkosten.js`, `src/app/views/fixkosten-model.js`, `src/ui/fixkosten-{screen,formular}.js`
- `tests/unit/fixkosten*.test.js`, `tests/e2e/fixkosten.spec.js`

## Savings goals
- `src/domain/sparziele*.js`, `src/app/store/sparziele.js`, `src/app/views/sparziele-model.js`, `src/ui/sparziele-{screen,formular}.js`
- `tests/unit/sparziele*.test.js`, `tests/e2e/{sparziele,aussehen-ziele}.spec.js`

## Insurance
- `src/domain/versicherung*.js`, `src/app/store/versicherung.js`, `src/app/views/versicherung-model.js`, `src/ui/versicherung-{screen,formular}.js`
- `themes/versicherung.css`, `themes/klassisch/versicherung.css`
- `tests/unit/versicherung*.test.js`, `tests/e2e/versicherung.spec.js`

## Cars
- `src/domain/autos*.js`, `src/app/store/autos.js`, `src/app/views/autos-model.js`, `src/ui/{autos-screen,auto-screen,auto-formular}.js`
- `themes/autos.css`, `themes/klassisch/autos.css`
- `tests/unit/autos*.test.js`, `tests/e2e/{autos,autos-hilfen}.*`

## Shift plan
- `src/domain/schicht.js`, `src/app/{schicht-abgleich,schicht-vorladen}.js`, `src/app/store/schicht.js`, `src/app/views/schicht-model.js`, `src/ui/schicht-*.js`
- `themes/schicht.css`, `themes/klassisch/schicht.css`
- `tests/unit/schicht*.test.js`, `tests/e2e/schichtplan*.js`

## Settings, "Mehr", setup
- `src/domain/settings.js`, `src/app/version-check.js`, `src/app/views/verbindung-model.js`
- `src/ui/{mehr-screen,menue,app-screen,listen-karten,erinnerungen-karte,sichern-karte,nachrichten-einstellungen,anleitung,willkommen-screen,einrichtung-screen}.js`
- `themes/mehr.css`, `themes/klassisch/mehr.css`
- `tests/unit/{settings,verbindung-login}.test.js`, `tests/e2e/{mehr,willkommen,aussehen-mehr}.spec.js`

## Google connection
- `src/calendar/{api,auth,config,konfiguration,login-dienst,setup,erinnerungen,zustand}.js`
- `login-dienst/*`, `login-dienst/{src,test}/*.js`
- `tests/unit/{auth-login,login-dienst}.test.js`

## Push
- `src/push/{client,geraete,meldungen,verschluesselung,base64url}.js`, `src/ui/push-abschnitt.js`
- `tests/unit/push-*.test.js`

## Shared
- `themes/konto.css` serves balances, fixed costs and goals: one agent at a time, or split by its sections.
- `src/app/store/einkauf-konto.js` serves shopping list and balances (owner: balances); `src/app/store/geteilt.js` serves cars and insurance (hub).
- `tests/e2e/schichtplan-google.spec.js` and `tests/e2e/google.spec.js` touch both Shift plan and Google connection.
- `src/ui/heute-screen.js` and `src/ui/mehr-screen.js` place cards of other areas: that area exports the card, only the screen owner places it.
- `tests/unit/konto-bewegung.test.js`, `tests/unit/autos-erinnerungen.test.js` and `tests/unit/versicherung-model.test.js` import hubs (`src/push/plan.js`, `src/app/store.js`, `src/app/hintergrund.js`): a hub change can break them.
