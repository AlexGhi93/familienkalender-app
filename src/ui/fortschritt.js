import { h } from './dom.js';
import { toast } from './components.js';

/** Fortschrittsanzeige für Aktionen mit vielen Schreibvorgängen („7 von 12“); null, wenn nichts läuft. */
export function fortschrittLeiste(state) {
  const f = state.fortschritt;
  if (!f) return null;
  return h(
    'div',
    { class: 'fortschritt', role: 'progressbar', 'aria-label': 'Speichern', 'aria-valuemin': '0', 'aria-valuemax': String(f.gesamt), 'aria-valuenow': String(f.erledigt) },
    h('span', {}, `Speichere … ${f.erledigt} von ${f.gesamt}`),
    h('div', { class: 'balken' }, h('div', { class: 'fuellung', style: { width: `${Math.round((f.erledigt / f.gesamt) * 100)}%` } })),
  );
}

const ALLGEMEINER_FEHLER = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';

/** So lange steht „Gelöscht ✓ · Rückgängig“ (ms). */
export const GELOESCHT_DAUER = 6000;

/**
 * Meldet das Ergebnis eines Löschens aus dem Store ({ ok, fehler?, gemeldet?, wartet?, rueckgaengig? }); → true = erledigt (gelöscht
 * oder wartet nur auf die Anmeldung). Gelöscht: „Gelöscht ✓“ – mit `rueckgaengig` etwa 6 Sekunden lang mit „Rückgängig“. Ein Fehler
 * erscheint genau einmal: mit `gemeldet` (oder beim Warten auf die Anmeldung) zeigt ihn schon die Shell aus state.fehler.
 * „Rückgängig“ wirkt genau einmal (die Meldung verschwindet beim Tippen); sein Ergebnis wird ebenso gemeldet („Wiederhergestellt ✓“).
 */
export function geloeschtMelden(r, { text = 'Gelöscht ✓', zurueck = 'Wiederhergestellt ✓' } = {}) {
  if (r?.wartet) return true;
  if (!r?.ok) {
    if (!r?.gemeldet) toast(r?.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
    return false;
  }
  // gelöscht ist gelöscht: eine noch stehende Fehlermeldung einer früheren Aktion darf die Meldung (und ihr Rückgängig) nicht verschlucken
  if (!r.rueckgaengig) {
    toast(text, { ersetztFehler: true });
    return true;
  }
  toast(text, {
    ersetztFehler: true,
    dauer: GELOESCHT_DAUER,
    aktion: {
      text: 'Rückgängig',
      beiKlick: async () => {
        let e;
        try {
          e = await r.rueckgaengig();
        } catch (fehler) {
          e = { ok: false, fehler: fehler?.message || ALLGEMEINER_FEHLER };
        }
        if (e?.ok === false) {
          if (!e.gemeldet && !e.wartet) toast(e.fehler ?? ALLGEMEINER_FEHLER, { art: 'fehler' });
          return;
        }
        toast(zurueck, { ersetztFehler: true });
      },
    },
  });
  return true;
}

/** Ein Löschen ausführen, das auch werfen kann (ungültige Eingabe): ein Wurf wird zu { ok: false, fehler }. */
export async function sicherLoeschen(lauf) {
  try {
    return await lauf;
  } catch (e) {
    return { ok: false, fehler: e?.message || ALLGEMEINER_FEHLER };
  }
}

/** Meldung mit „Rückgängig“ (10 Sekunden) nach einer Aktion mit mehreren Tagen. */
export function zeigeRueckgaengig(text, rueckgaengig) {
  toast(text, {
    aktion: {
      text: 'Rückgängig',
      beiKlick: async () => {
        await rueckgaengig();
        toast('Rückgängig gemacht');
      },
    },
  });
}
