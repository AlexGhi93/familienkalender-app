// Verbindung zu Google als reine Daten: Banner oben, Statuskarte in „Konto & App“ und Kurzstatus in „Mehr“. Kein DOM, damit alle Fälle testbar sind.
import { standText } from '../format-de.js';

/** Rest der Anmeldung: Minuten aufgerundet, unter einer Minute „weniger als 1 Min“; ohne Anmeldung leer. */
export function restText(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms <= 60_000) return 'weniger als 1 Min';
  return `${Math.ceil(ms / 60_000)} Min`;
}

const warteText = (n) => (n > 0 ? ` ${n} ${n === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf das Speichern.` : '');

const TIPP = 'Die Anmeldung gilt eine Stunde. Nach dem Öffnen der App einmal „Verbinden“ tippen; Änderungen ohne Anmeldung warten und werden danach gesendet.';
const TIPP_DAUERHAFT = 'Einmal anmelden – danach bleibt dieses Telefon angemeldet. Änderungen ohne Verbindung warten und werden danach gesendet.';
const STILL_TEXT = 'Verbinde mit Google …';

/** Hinweis unter „Mit Google anmelden“ (große Karte vor dem ersten Laden): nur mit Login-Dienst, sonst leer. */
export const anmeldeHinweis = (login) => (login ? 'Einmal anmelden – danach bleibt dieses Telefon angemeldet.' : '');

/** Läuft gerade eine stille Anmeldung über den Login-Dienst, die man sehen soll? (Nicht, solange die Verbindung ohnehin steht.) */
export const stillSichtbar = (login, status) => login?.still === true && status !== 'verbunden';

/**
 * `state` = Zustand des Speichers (geladen, nurSnapshot, anmeldungNoetig, stand), `status` = auth.status(), `restMs` = auth.restMs(),
 * `bald` = auth.baldAbgelaufen(), `verbindung` = { laeuft, fehler } des letzten Versuchs, `ausstehend` = Anzahl wartender Änderungen,
 * `login` = auth.dauerAnmeldung(): null ohne Login-Dienst, sonst { dauerhaft, still }.
 * Ergebnis: { banner: { emoji, text, knopf | null, fehler | null } | null, karte: { status, statusText, zeilen, fehler | null } }.
 */
export function verbindungsModel({ state, status, restMs, bald = false, verbindung, ausstehend = 0, login = null }) {
  const still = stillSichtbar(login, status) && verbindung?.laeuft !== true;
  const laeuft = verbindung?.laeuft === true || still;
  const fehler = laeuft ? null : (verbindung?.fehler ?? null);
  const stand = state.nurSnapshot && state.stand ? standText(state.stand) : '';
  const abgelaufen = state.anmeldungNoetig || status === 'abgelaufen';

  let banner = null;
  if (still) {
    banner = { emoji: '⏳', text: STILL_TEXT, knopf: null, fehler: null }; // ohne Google-Fenster, daher ohne Pop-up-Hinweis
  } else if (laeuft) {
    banner = { emoji: '⏳', text: 'Verbinde mit Google … Erscheint kein Fenster, erlaube Pop-ups für diese Seite.', knopf: null, fehler: null };
  } else if (state.nurSnapshot) {
    banner = { emoji: '📴', text: `Gespeicherter Stand vom ${stand}. Zum Aktualisieren verbinden.`, knopf: 'Verbinden', fehler };
  } else if (abgelaufen) {
    banner = { emoji: '🔒', text: `Bitte neu anmelden.${warteText(ausstehend)}`, knopf: 'Neu anmelden', fehler };
  } else if (bald) {
    banner = { emoji: '⏳', text: 'Die Anmeldung läuft bald ab. Jetzt erneuern, damit nichts verloren geht.', knopf: 'Erneuern', fehler };
  }

  let karte;
  if (laeuft) {
    karte = { status: 'laeuft', statusText: '⏳ Verbinde mit Google …', zeilen: [], fehler: null };
  } else if (status === 'verbunden' && !abgelaufen && !state.nurSnapshot) {
    const rest = login?.dauerhaft ? 'Dieses Telefon bleibt angemeldet' : `Anmeldung noch ${restText(restMs)}`; // mit Sitzung erneuert sich das Token still
    karte = { status: 'verbunden', statusText: `✅ Verbunden · ${rest}`, zeilen: [], fehler };
  } else {
    const zeilen = [];
    if (stand) zeilen.push(`Gespeicherter Stand vom ${stand}.`);
    if (ausstehend > 0) zeilen.push(warteText(ausstehend).trim());
    zeilen.push(login ? TIPP_DAUERHAFT : TIPP);
    const ohneAnmeldung = status === 'abgelaufen' || (status === 'verbunden' && abgelaufen);
    karte = { status: ohneAnmeldung ? 'abgelaufen' : 'getrennt', statusText: ohneAnmeldung ? '🔒 Anmeldung abgelaufen' : '📴 Nicht verbunden', zeilen, fehler };
  }
  return { banner, karte };
}
