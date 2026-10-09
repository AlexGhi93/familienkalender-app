// Verbindung zu Google als reine Daten: Banner oben und Statuskarte in „Mehr“. Kein DOM, damit alle Fälle testbar sind.
import { standText } from '../format-de.js';

/** Rest der Anmeldung: Minuten aufgerundet, unter einer Minute „weniger als 1 Min“; ohne Anmeldung leer. */
export function restText(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms <= 60_000) return 'weniger als 1 Min';
  return `${Math.ceil(ms / 60_000)} Min`;
}

const warteText = (n) => (n > 0 ? ` ${n} ${n === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf das Speichern.` : '');

const TIPP = 'Die Anmeldung gilt eine Stunde. Nach dem Öffnen der App einmal „Verbinden“ tippen; Änderungen ohne Anmeldung warten und werden danach gesendet.';

/**
 * `state` = Zustand des Speichers (geladen, nurSnapshot, anmeldungNoetig, stand), `status` = auth.status(), `restMs` = auth.restMs(),
 * `bald` = auth.baldAbgelaufen(), `verbindung` = { laeuft, fehler } des letzten Versuchs, `ausstehend` = Anzahl wartender Änderungen.
 * Ergebnis: { banner: { emoji, text, knopf | null, fehler | null } | null, karte: { status, statusText, zeilen, fehler | null } }.
 */
export function verbindungsModel({ state, status, restMs, bald = false, verbindung, ausstehend = 0 }) {
  const laeuft = verbindung?.laeuft === true;
  const fehler = laeuft ? null : (verbindung?.fehler ?? null);
  const stand = state.nurSnapshot && state.stand ? standText(state.stand) : '';
  const abgelaufen = state.anmeldungNoetig || status === 'abgelaufen';

  let banner = null;
  if (laeuft) {
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
    karte = { status: 'verbunden', statusText: `✅ Verbunden · Anmeldung noch ${restText(restMs)}`, zeilen: [], fehler };
  } else {
    const zeilen = [];
    if (stand) zeilen.push(`Gespeicherter Stand vom ${stand}.`);
    if (ausstehend > 0) zeilen.push(warteText(ausstehend).trim());
    zeilen.push(TIPP);
    const ohneAnmeldung = status === 'abgelaufen' || (status === 'verbunden' && abgelaufen);
    karte = { status: ohneAnmeldung ? 'abgelaufen' : 'getrennt', statusText: ohneAnmeldung ? '🔒 Anmeldung abgelaufen' : '📴 Nicht verbunden', zeilen, fehler };
  }
  return { banner, karte };
}
