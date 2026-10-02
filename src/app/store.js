import { todayVienna } from '../domain/dates.js';
import { normalizeSettings } from '../domain/settings.js';
import { spanDays } from '../domain/span.js';
import { planUmwandlung } from '../domain/umwandlung.js';
import { normalisiereTermin } from './termin.js';
import { MAX_SERIEN_WOCHEN, naechsterWochentag, wochenSerie } from './serie.js';

const KITA_TYPEN = ['kita_essen', 'kita_ohne'];

/** Zufällige ID aus den Zeichen 0-9 und a-v: so darf sie auch als Google-Ereignis-ID dienen. */
const zufaelligeId = () => `u${Array.from({ length: 11 }, () => Math.floor(Math.random() * 32).toString(32)).join('')}`;

/**
 * Zustand der App. Alle Änderungen gehen zuerst in den Zustand (Oberfläche reagiert sofort) und dann in den
 * Adapter; schlägt das Speichern fehl, wird der alte Zustand wiederhergestellt und `fehler` gesetzt.
 */
export function createStore(adapter, { jetzt = () => new Date(), neueId = zufaelligeId } = {}) {
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

  const pruefeWochen = (wochen) => {
    if (!Number.isInteger(wochen) || wochen < 1 || wochen > MAX_SERIEN_WOCHEN) throw new Error(`Wochen: bitte 1 bis ${MAX_SERIEN_WOCHEN} wählen.`);
  };

  /** Termine einer wöchentlichen Serie ab `roh.date` (Feiertage, Urlaub usw. werden verschoben oder übersprungen). */
  function serieTermine(roh, wochen) {
    const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined });
    const plan = wochenSerie(state, { start: basis.date, wochen, richtung: basis.richtung, heute: todayVienna(jetzt()) });
    const serie = neueId();
    return {
      termine: plan.eintraege.map((e) => ({ id: neueId(), ...basis, date: e.date, serie })),
      verschoben: plan.eintraege.filter((e) => e.verschobenVon).length,
      uebersprungen: plan.uebersprungen,
    };
  }

  async function termineAnlegen(neue) {
    if (neue.length === 0) throw new Error('In diesem Zeitraum gibt es keinen passenden Tag.');
    const ids = new Set(neue.map((t) => t.id));
    await aendere({ termine: [...state.termine.filter((t) => !ids.has(t.id)), ...neue] }, async () => {
      for (const t of neue) await adapter.speichereTermin(t);
    });
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

    /**
     * Sachen für Krabbelstube/Kindergarten: einmalig (`wochen` = 1), als wöchentliche Serie (`wochen` > 1)
     * oder, mit `id`, als Änderung genau dieser Sache. Gibt { ids, verschoben, uebersprungen } zurück.
     */
    async sachenSpeichern(roh, { wochen = 1, id = null } = {}) {
      pruefeWochen(wochen);
      if (id) {
        const alt = state.termine.find((t) => t.id === id);
        const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: alt?.serie });
        await termineAnlegen([{ id, ...basis }]);
        return { ids: [id], verschoben: 0, uebersprungen: [] };
      }
      if (wochen === 1) {
        const termin = { id: neueId(), ...normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined }) };
        await termineAnlegen([termin]);
        return { ids: [termin.id], verschoben: 0, uebersprungen: [] };
      }
      const r = serieTermine(roh, wochen);
      await termineAnlegen(r.termine);
      return { ids: r.termine.map((t) => t.id), verschoben: r.verschoben, uebersprungen: r.uebersprungen };
    },

    /** Pyjamas-Wechsel: wöchentlich „Pyjamas hinbringen“ (hinTag) und „Pyjamas heimholen“ (heimTag), Mo = 0 … Fr = 4. */
    async pyjamasWechselSpeichern({ hinTag = 0, heimTag = 4, wochen = 8, mitnehmen = ['Pyjamas'] } = {}) {
      pruefeWochen(wochen);
      for (const tag of [hinTag, heimTag]) {
        if (!Number.isInteger(tag) || tag < 0 || tag > 4) throw new Error('Bitte Wochentage von Montag bis Freitag wählen.');
      }
      const heute = todayVienna(jetzt());
      const { bringzeit, abholzeit } = state.settings;
      const hin = serieTermine({ richtung: 'hin', date: naechsterWochentag(heute, hinTag), time: bringzeit, mitnehmen, kosten: null }, wochen);
      const heim = serieTermine({ richtung: 'heim', date: naechsterWochentag(heute, heimTag), time: abholzeit, mitnehmen, kosten: null }, wochen);
      const neue = [...hin.termine, ...heim.termine];
      await termineAnlegen(neue);
      return {
        ids: neue.map((t) => t.id),
        verschoben: hin.verschoben + heim.verschoben,
        uebersprungen: [...hin.uebersprungen, ...heim.uebersprungen],
      };
    },

    /** Löscht diese Sache und, falls sie zu einer Serie gehört, alle folgenden. Gibt die Anzahl gelöschter Sachen zurück. */
    async terminLoeschenAbHier(id) {
      const t = state.termine.find((x) => x.id === id);
      if (!t) return 0;
      const weg = t.serie ? state.termine.filter((x) => x.serie === t.serie && x.date >= t.date) : [t];
      await aendere({ termine: state.termine.filter((x) => !weg.includes(x)) }, async () => {
        for (const x of weg) await adapter.loescheTermin(x.id);
      });
      return weg.length;
    },

    /** „Erledigt“: entfernt die Sache (und damit die Erinnerung). `rueckgaengig` stellt sie unverändert wieder her. */
    async terminErledigt(id) {
      const t = state.termine.find((x) => x.id === id);
      if (!t) return { rueckgaengig: async () => {} };
      await aendere({ termine: state.termine.filter((x) => x.id !== id) }, () => adapter.loescheTermin(id));
      return {
        rueckgaengig: async () => {
          await aendere({ termine: [...state.termine.filter((x) => x.id !== id), t] }, () => adapter.speichereTermin(t));
        },
      };
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
