import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { spanDays } from '../domain/span.js';
import { planUmwandlung } from '../domain/umwandlung.js';
import { normalisiereTermin } from './termin.js';

const KITA_TYPEN = ['kita_essen', 'kita_ohne'];

/**
 * Zustand der App. Alle Änderungen gehen zuerst in den Zustand (Oberfläche reagiert sofort) und dann in den
 * Adapter; schlägt das Speichern fehl, wird der alte Zustand wiederhergestellt und `fehler` gesetzt.
 */
export function createStore(adapter, { jetzt = () => new Date(), neueId = () => `u${Math.random().toString(36).slice(2, 10)}` } = {}) {
  let state = { geladen: false, settings: normalizeSettings(), tage: {}, urlaub: [], termine: [], fehler: null };
  const hoerer = new Set();
  const melden = () => {
    for (const h of hoerer) h(state);
  };

  async function aendere(neu, schreibe) {
    const alt = state;
    state = { ...state, ...neu, fehler: null };
    melden();
    try {
      await schreibe();
    } catch {
      state = { ...alt, fehler: 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.' };
      melden();
    }
  }

  const store = {
    getState: () => state,
    subscribe(fn) {
      hoerer.add(fn);
      return () => hoerer.delete(fn);
    },
    jetzt,
    heute: () => todayVienna(jetzt()),

    async laden() {
      const daten = await adapter.laden();
      state = { ...state, ...daten, geladen: true, fehler: null };
      melden();
    },

    setTag: (date, typ) => store.setTage([date], typ),

    async setTage(dates, typ) {
      const tage = { ...state.tage };
      for (const d of dates) tage[d] = { typ };
      await aendere({ tage }, async () => {
        for (const d of dates) await adapter.setzeTag(d, typ);
      });
    },

    async loescheTag(date) {
      if (!state.tage[date]) return;
      const tage = { ...state.tage };
      delete tage[date];
      await aendere({ tage }, () => adapter.loescheTag(date));
    },

    /** Legt einen Urlaub an; Betreuungstage darin werden umgewandelt (gelöscht). Gibt { id, umgewandelt } zurück. */
    async urlaubHinzufuegen({ start, end }) {
      if (!(start <= end)) throw new Error('Ungültiger Zeitraum');
      const tage = { ...state.tage };
      const betreuung = new Set(spanDays({ start, end }).filter((d) => KITA_TYPEN.includes(tage[d]?.typ)));
      const plan = planUmwandlung({ dates: [...betreuung], zielTyp: 'urlaub', vorhandeneBifen: betreuung });
      for (const d of plan.loeschen) delete tage[d];
      const eintrag = { id: neueId(), start, end };
      await aendere({ tage, urlaub: [...state.urlaub, eintrag] }, async () => {
        for (const d of plan.loeschen) await adapter.loescheTag(d);
        await adapter.speichereUrlaub(eintrag);
      });
      return { id: eintrag.id, umgewandelt: plan.loeschen.length };
    },

    async urlaubLoeschen(id) {
      await aendere({ urlaub: state.urlaub.filter((u) => u.id !== id) }, () => adapter.loescheUrlaub(id));
    },

    /** Legt einen Termin an oder ändert ihn (mit `id`). Wirft bei ungültigen Eingaben einen Error mit deutscher Meldung. */
    async terminSpeichern(roh, id = null) {
      const termin = { id: id ?? neueId(), ...normalisiereTermin(roh) };
      const termine = [...state.termine.filter((t) => t.id !== termin.id), termin];
      await aendere({ termine }, () => adapter.speichereTermin(termin));
      return termin.id;
    },

    async terminLoeschen(id) {
      await aendere({ termine: state.termine.filter((t) => t.id !== id) }, () => adapter.loescheTermin(id));
    },

    async einstellungen(teil) {
      const settings = normalizeSettings({ ...state.settings, ...teil });
      await aendere({ settings }, () => adapter.speichereSettings(teil));
    },

    async zuruecksetzen() {
      const daten = await adapter.zuruecksetzen();
      state = { ...state, ...daten, geladen: true, fehler: null };
      melden();
    },
  };
  return store;
}
