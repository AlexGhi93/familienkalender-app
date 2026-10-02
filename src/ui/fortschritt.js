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
