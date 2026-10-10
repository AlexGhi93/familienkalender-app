# Login-Dienst des Familienkalenders

Ein kleiner Cloudflare Worker (`familienkalender-login`), damit die Telefone bei Google angemeldet bleiben.
Ohne ihn gilt eine Google-Anmeldung nur eine Stunde, danach muss man in der App wieder auf „Verbinden“ tippen.

Er ist unabhängig vom Push-Dienst (`familienkalender-push`) und läuft im Gratis-Tarif von Cloudflare.

## Was er tut

1. **Einmal anmelden:** Die App öffnet das Google-Fenster (GIS-Code-Client) und schickt den einmaligen Code an
   `POST /v1/anmelden`. Der Dienst tauscht ihn bei Google gegen ein Zugriffstoken (1 Stunde) und ein **Refresh-Token**
   (unbegrenzt gültig). Er prüft, ob beide Kalender-Berechtigungen erteilt sind.
   Dann legt er eine **Sitzung** an. Die Sitzung besteht aus 32 Zufallsbytes und bekommt nur das Telefon
   (localStorage `fk.login.v1`).
2. **Still erneuern:** Kurz bevor das Zugriffstoken abläuft, nach dem Öffnen der App und bei der Rückkehr in die App fragt
   das Telefon `POST /v1/token`. Dabei gibt es kein Popup und nichts zu tippen. Der Dienst holt mit dem Refresh-Token ein
   neues Zugriffstoken. Das Refresh-Token selbst verlässt den Dienst nie.
3. **Abmelden:** „Konto & App → Dieses Telefon zurücksetzen“ ruft `POST /v1/abmelden`. Der Dienst widerruft das
   Refresh-Token bei Google und löscht die Sitzung.

| Anfrage | Antwort |
| --- | --- |
| `POST /v1/anmelden {code}` | `200 {sitzung, access_token, expires_in}` · `409 {fehler:'kein-dauerzugang'}` (Google gab kein Refresh-Token) · `403 {fehler:'berechtigung-fehlt'}` · `400 {fehler:'code-ungueltig'}` |
| `POST /v1/token {sitzung}` | `200 {access_token, expires_in}` · `401 {fehler:'abgelaufen'}` (Sitzung unbekannt oder bei Google widerrufen: dann ist sie gelöscht) |
| `POST /v1/abmelden {sitzung}` | `204` |
| alle | `403 {fehler:'herkunft'}` (fremde Seite) · `413 {fehler:'zu-gross'}` (über 4 KB) · `400/415 {fehler:'ungueltig'}` · `502 {fehler:'google'}` · `500` |

Erlaubt ist nur die Herkunft `https://alexghi93.github.io` (CORS, `ERLAUBTE_HERKUNFT` in `wrangler.toml`).
Alle Antworten haben `Cache-Control: no-store`.

Ist der Dienst nicht erreichbar, fällt die App beim nächsten Tipp auf die bisherige Stunden-Anmeldung zurück.
Ist `login.dienst` in `src/calendar/config.js` leer, verhält sich die App genau wie vorher.

## Sicherheit

**Was wo liegt**

| Ort | Inhalt |
| --- | --- |
| Telefon (localStorage) | nur die Sitzung (Zufallswert); kein Google-Token |
| Workers KV `SITZUNGEN` | Schlüssel `s:` + SHA-256(Sitzung), Wert `{v, rt, iv, erstellt, zuletzt}`; `rt` = Refresh-Token, mit AES-GCM-256 verschlüsselt. Den Schlüssel leitet der Dienst per HKDF-SHA-256 aus der Sitzung ab. Eintrag verfällt nach 180 Tagen ohne Benutzung |
| Cloudflare-Secret | `GOOGLE_CLIENT_SECRET` (nie im Repository) |
| Repository (öffentlich) | Code, Client-ID, KV-ID: alles nicht geheim |

**Was ein Angreifer könnte**

- **Mit einem Auszug aus KV:** nichts Brauchbares. Er sieht nur Hashes und verschlüsselte Tokens. Ohne die Sitzung vom
  Telefon lässt sich kein Token entschlüsseln. Selbst ein entschlüsseltes Refresh-Token nützt ohne das Client-Secret
  nichts. Mit Schreibzugriff könnte er Sitzungen löschen; dann muss man sich einmal neu anmelden.
- **Mit einem gestohlenen, entsperrten Telefon** (oder Zugriff auf dessen Browser-Speicher): Er kann über den Dienst
  Zugriffstoken holen, solange die Sitzung gilt. Das sind höchstens 180 Tage ohne Benutzung, sonst unbegrenzt.
  Die Token erlauben nur, was die App darf: die von der App angelegten Kalender und die Kalenderliste. An Gmail, Drive
  oder das Google-Passwort kommt er nicht heran. Sperren:
  1. Hast du das Telefon noch: **„Konto & App → Dieses Telefon zurücksetzen“**. Das löscht die Sitzung und widerruft
     das Token bei Google.
  2. Ist das Telefon weg: im **Google-Konto → Sicherheit → „Drittanbieter-Apps und -Dienste“ / „Verbindungen zu
     Drittanbieter-Apps“** (https://myaccount.google.com/connections) beim Familienkalender **„Zugriff entfernen“**.
     Das macht alle Refresh-Tokens dieses Google-Kontos für die App ungültig. Die gestohlene Sitzung bekommt danach nur
     noch `401`. Die eigenen anderen Telefone melden sich mit einem Tipp neu an.
  3. Notbremse für alle: in `src/calendar/config.js` `login.dienst` leeren und `npx wrangler delete` ausführen
     (oder nur das Secret durch Unsinn ersetzen: `npx wrangler secret put GOOGLE_CLIENT_SECRET`).
- **Mit Zugriff auf das Cloudflare-Konto:** Er könnte den Code des Dienstes ändern und künftige Tokens mitschneiden.
  Schütze das Cloudflare-Konto deshalb mit Zwei-Faktor-Anmeldung.
- **Eine andere Webseite** kann den Dienst im Browser nicht benutzen (CORS und `Origin`-Prüfung). Ein Skript
  außerhalb des Browsers kann den `Origin` fälschen. Dann schützt die Sitzung: 256 Zufallsbits, die man nicht erraten kann.

**Grenzen**

- Alle Seiten unter `alexghi93.github.io` (also jedes GitHub-Pages-Projekt dieses Kontos) teilen sich denselben Ursprung
  und damit denselben localStorage. Code, der dort läuft, könnte die Sitzung lesen; den gespeicherten Kalenderstand kann
  er schon heute lesen. Veröffentliche unter diesem Konto nur eigenen, vertrauenswürdigen Code.
- Der Dienst protokolliert nichts: Es gibt kein `console.log`, und Workers Logs sind nicht eingeschaltet.
  Tokens, Codes und Sitzungen stehen nur im Anfrage-Körper, nie in der URL.
- Es gibt keine Ratenbegrenzung. Wer den Dienst mit Anfragen flutet, kann das Gratis-Kontingent des Tages aufbrauchen.
  Dann fällt die App bis Mitternacht (UTC) auf die Stunden-Anmeldung zurück. Daten gehen dabei nicht verloren.

## Kosten

Alles bleibt im Gratis-Tarif:

- **Workers Free:** 100.000 Anfragen pro Tag, 10 ms CPU je Anfrage. Verschlüsselung und Hash brauchen weniger als
  1 ms; das Warten auf Google zählt nicht.
- **Workers KV Free:** 100.000 Lesevorgänge, 1.000 Schreibvorgänge, 1.000 Löschungen pro Tag und 1 GB Speicher.
  Geschrieben wird nur beim Anmelden und höchstens einmal pro Tag und Telefon (Frist verlängern).
  Gelesen wird einmal je neuem Token.
  Beispiel: 4 Telefone, je 30 Mal am Tag geöffnet → etwa 150 Anfragen, 150 Lesevorgänge und 4 Schreibvorgänge pro Tag.
- **Google OAuth:** kostenlos.

## Einrichten (Windows, PowerShell)

Du brauchst Node.js 22 oder neuer (`node --version`) und das Cloudflare-Konto, in dem auch der Push-Dienst läuft.

### 1. Google Cloud Console

1. https://console.cloud.google.com/ → Projekt des Familienkalenders → **APIs & Dienste → Anmeldedaten**
   (APIs & Services → Credentials).
   Unter „OAuth 2.0-Client-IDs“ den vorhandenen **Webclient** öffnen (`154849350786-nv47…`).
   Dort das **Clientschlüssel/Client-Secret** kopieren. Ist keines zu sehen (Google zeigt neue Secrets nur einmal an),
   mit **„Secret hinzufügen“ / „Add secret“** eines anlegen und sofort kopieren.
   - Eine neue Weiterleitungs-URI ist **nicht** nötig. Der Popup-Code-Flow von Google nutzt den festen Wert
     `postmessage`.
   - Unter „Autorisierte JavaScript-Quellen“ muss `https://alexghi93.github.io` stehen. Das ist schon so, sonst ginge die
     App heute nicht.
2. **OAuth-Zustimmungsbildschirm** (OAuth consent screen; in der neuen Oberfläche „Google Auth Platform → Zielgruppe“)
   → Veröffentlichungsstatus → **„App veröffentlichen“** → Status **„In Produktion“**.
   Wichtig: Im Status „Test“ verfallen Refresh-Tokens nach 7 Tagen. Dann müsste jedes Telefon wöchentlich neu
   anmelden.
   Google zeigt beim Anmelden einmal „Google hat diese App nicht überprüft“. Das ist für eine private App normal und
   kostenlos. Weiter geht es mit „Erweitert“ → „Zu Familienkalender wechseln“. Eine Überprüfung durch Google ist nicht
   nötig.

### 2. Cloudflare

Im Repository-Ordner in PowerShell:

```powershell
cd login-dienst
npm install
npx wrangler login
npx wrangler kv namespace create SITZUNGEN
```

`wrangler kv namespace create` gibt eine `id` aus. Trage sie in `wrangler.toml` statt `HIER-DIE-KV-ID-EINTRAGEN` ein.
Die KV-id ist nicht geheim. Fragt wrangler, ob es die Konfiguration selbst ergänzen soll, antworte mit **n** und trage
die id von Hand ein. Es darf nur einen `[[kv_namespaces]]`-Block mit `binding = "SITZUNGEN"` geben.

```powershell
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Füge das Client-Secret aus Schritt 1 ein; die Eingabe bleibt unsichtbar. Dann:

```powershell
npx wrangler deploy
```

Der Dienst läuft danach unter `https://familienkalender-login.fk-h2vq8eei.workers.dev`. Kurzer Test (in PowerShell
`curl.exe`, nicht `curl`):

```powershell
curl.exe -i -X OPTIONS https://familienkalender-login.fk-h2vq8eei.workers.dev/v1/token -H "Origin: https://alexghi93.github.io"
```

Erwartet: `HTTP/1.1 204` und `Access-Control-Allow-Origin: https://alexghi93.github.io`.

### 3. App einschalten

In `src/calendar/config.js`:

```js
login: Object.freeze({ dienst: 'https://familienkalender-login.fk-h2vq8eei.workers.dev' }),
```

Danach committen und pushen (GitHub Pages). Die Adresse steht schon in der Content-Security-Policy von `index.html`.
Auf jedem Telefon dann einmal „Verbinden“ bzw. „Mit Google anmelden“ tippen und im Google-Fenster beide Häkchen
setzen. Ab dann bleibt das Telefon angemeldet.

**Abschalten:** `login.dienst` wieder leeren. Die App meldet sich dann wieder wie früher stündlich an.
Die Einträge in KV verfallen von selbst.

## Entwickeln

```powershell
npm test
```

Die Tests laufen ohne Netz und ohne Cloudflare: Google und KV sind durch Fälschungen ersetzt (`test/`).
