import { todayVienna } from '../../domain/dates.js';
import { normalizeSettings } from '../../domain/settings.js';
import { spanDays } from '../../domain/span.js';
import { planUmwandlung } from '../../domain/umwandlung.js';
import { einzelnWiederherstellbar, urlaubCheckEventId } from '../../domain/ids.js';
import { normalisiereTermin } from '../termin.js';
import { urlaubChecksAbgleich, urlaubChecksWunsch } from '../../domain/urlaub-check.js';
import { MAX_SERIEN_WOCHEN, naechsterWochentag, wochenSerie } from '../serie.js';
import { TEXT_URLAUB_WEG } from '../../domain/urlaub.js';
import { FACHLICH, istAuthFehler } from './kern.js';

const KITA_TYPEN = ['kita_essen', 'kita_ohne'];

/** Ergebnis eines Eintragens mit `rueckgaengig` – auch, wenn es nur auf die Anmeldung wartet (es bleibt sichtbar); nicht nach einem Fehlschlag. */
const mitZuruecknehmen = (r, rueckgaengig) => (r.ok || r.wartet ? { ...r, rueckgaengig } : r);

/** Liegt [von, bis) vollständig in den Bereichen `bereiche` ({ von, bis }, auch mehrere aneinander anschließende oder überlappende)? */
function bereichAbgedeckt(von, bis, bereiche) {
  let bisHier = von;
  for (const b of [...bereiche].sort((x, y) => x.von.localeCompare(y.von))) {
    if (b.von > bisHier) break;
    if (b.bis > bisHier) bisHier = b.bis;
    if (bisHier >= bis) return true;
  }
  return bisHier >= bis;
}

/**
 * Scheibe „Kalender“ des Stores: Tage, Urlaub, Termine und Sachen, das Nachladen älterer Zeiträume, die Urlaub-Checks, dazu die
 * Einstellungen und die Erinnerungen von Google Kalender. `store` = die Fassade (für Aufrufe über ihre öffentlichen Methoden).
 * → { methoden (öffentliche Methoden des Stores), intern (was die Fassade braucht) }.
 */
export function createKalenderSlice(kern, { store }) {
  const { adapter, jetzt, neueId, melden, unlesbarMerken, aendere, ergebnisVon, mitRueckgaengig, ohneUeberschreiben } = kern;
  const geladeneBereiche = [];
  kern.nachNeuLaden(() => () => {
    geladeneBereiche.length = 0;
  });
  const ladendeBereiche = new Map(); // Schlüssel „von|bis“ → laufendes Laden (dieselbe Zusage für jeden, der denselben Bereich anfordert)

  /** Lädt [von, bis) und übernimmt Tage, Urlaub und Termine dieses Zeitraums; Ergebnis wie sichereBereich. */
  async function bereichLaden(von, bis) {
    let erfolg = false;
    try {
      const d = await adapter.ladeBereich(von, bis);
      const tage = { ...kern.state.tage };
      for (const k of Object.keys(tage)) if (k >= von && k < bis) delete tage[k];
      Object.assign(tage, d.tage);
      kern.state = {
        ...kern.state,
        tage,
        termine: [...kern.state.termine.filter((t) => !(t.date >= von && t.date < bis)), ...d.termine],
        urlaub: [...kern.state.urlaub.filter((u) => !d.urlaub.some((x) => x.id === u.id)), ...d.urlaub],
      };
      geladeneBereiche.push({ von, bis });
      erfolg = true;
    } catch (fehler) {
      kern.state = istAuthFehler(fehler) ? { ...kern.state, anmeldungNoetig: true } : { ...kern.state, fehler: 'Dieser Zeitraum konnte nicht geladen werden.' };
    }
    melden();
    return erfolg;
  }
  let checksLaufen = false;
  const pruefeWochen = (wochen) => {
    if (!Number.isInteger(wochen) || wochen < 1 || wochen > MAX_SERIEN_WOCHEN) throw new Error(`Wochen: bitte 1 bis ${MAX_SERIEN_WOCHEN} wählen.`);
  };

  /** Termine einer wöchentlichen Serie ab `roh.date` (Feiertage, Urlaub usw. werden verschoben oder übersprungen). */
  function serieTermine(roh, wochen) {
    const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined });
    const plan = wochenSerie(kern.state, { start: basis.date, wochen, richtung: basis.richtung, heute: todayVienna(jetzt()) });
    const serie = neueId();
    return {
      termine: plan.eintraege.map((e) => ({ id: neueId(), ...basis, date: e.date, serie })),
      verschoben: plan.eintraege.filter((e) => e.verschobenVon).length,
      uebersprungen: plan.uebersprungen,
    };
  }

  /** Legt Termine an (oder ersetzt die mit derselben Kennung). Wirft sofort, wenn es keinen gibt; sonst → wie `ergebnisVon`. */
  async function termineAnlegen(neue) {
    if (neue.length === 0) throw new Error('In diesem Zeitraum gibt es keinen passenden Tag.');
    const ids = new Set(neue.map((t) => t.id));
    const e = await aendere({ termine: [...kern.state.termine.filter((t) => !ids.has(t.id)), ...neue] }, async (bericht) => {
      let i = 0;
      for (const t of neue) {
        await adapter.speichereTermin(t);
        bericht((i += 1), neue.length);
      }
    });
    return ergebnisVon(e);
  }

  /** Stellt Tage auf einen früheren Stand zurück: `vorher` = [[Datum, Typ oder null], …]. → 'ok' | 'auth' | 'fehler' (wie `aendere`). */
  async function stelleTageWieder(vorher, zusatz = {}) {
    const tage = { ...kern.state.tage };
    for (const [d, t] of vorher) {
      if (t === null) delete tage[d];
      else tage[d] = { typ: t };
    }
    return aendere({ tage, ...zusatz.zustand }, async (bericht) => {
      if (zusatz.vorher) await zusatz.vorher();
      let i = 0;
      for (const [d, t] of vorher) {
        if (t === null) await adapter.loescheTag(d);
        else await adapter.setzeTag(d, t);
        bericht((i += 1), vorher.length);
      }
    });
  }

  /** Betreuungstage in [start, end], die ein Urlaub ersetzt: → { tage (Zustand ohne sie), loeschen (Daten), entfernt ([[Datum, Typ], …] fürs Rückgängig) }. */
  function betreuungUmwandeln(start, end) {
    const tage = { ...kern.state.tage };
    const betreuung = new Set(spanDays({ start, end }).filter((d) => KITA_TYPEN.includes(tage[d]?.typ)));
    const plan = planUmwandlung({ dates: [...betreuung], zielTyp: 'urlaub', vorhandeneBifen: betreuung });
    const entfernt = plan.loeschen.map((d) => [d, tage[d].typ]);
    for (const d of plan.loeschen) delete tage[d];
    return { tage, loeschen: plan.loeschen, entfernt };
  }

  /** Löscht die umgewandelten Betreuungstage im Kalender; `gesamt` = alle Schreibvorgänge der Aktion (Fortschrittsanzeige), `ab` = schon erledigte. */
  async function umgewandelteTageLoeschen(loeschen, bericht, gesamt, ab = 0) {
    let i = ab;
    for (const d of loeschen) {
      await adapter.loescheTag(d);
      bericht((i += 1), gesamt);
    }
  }

  const methoden = {
    /**
     * Holt Tage, Urlaub und Termine eines Zeitraums nach (Monat zurückblättern); mehrfaches Anfordern lädt nur einmal: wer einen
     * Bereich anfordert, der gerade geladen wird, wartet auf dasselbe Laden. Abgedeckt ist ein Zeitraum auch durch mehrere
     * aneinander anschließende geladene Bereiche (z. B. „Ältere laden“ Schritt für Schritt).
     * Ergebnis: true, wenn der Zeitraum jetzt da ist; false, wenn es nicht möglich war (Demo, Fehler).
     */
    sichereBereich(von, bis) {
      if (!adapter.ladeBereich || !kern.state.fenster) return Promise.resolve(false);
      if (bereichAbgedeckt(von, bis, [kern.state.fenster, ...geladeneBereiche])) return Promise.resolve(true);
      const schluessel = `${von}|${bis}`;
      if (!ladendeBereiche.has(schluessel)) {
        ladendeBereiche.set(
          schluessel,
          bereichLaden(von, bis).finally(() => ladendeBereiche.delete(schluessel)),
        );
      }
      return ladendeBereiche.get(schluessel);
    },

    /**
     * Gleicht die Urlaub-Checks im Kalender mit dem Stand des Urlaubs ab (am 1.3., 1.5., 1.7. um 09:00, solange noch Urlaub offen ist).
     * Nur mit Google und frisch geladenen Daten; Fehler (z. B. abgelaufene Anmeldung) sind kein Problem: beim nächsten Öffnen erneut.
     * Ergebnis: true, wenn etwas geschrieben wurde.
     */
    async urlaubChecksAbgleichen() {
      if (!adapter.gleicheUrlaubChecksAb || !kern.state.geladen || kern.state.nurSnapshot || checksLaufen) return false;
      const heute = todayVienna(jetzt());
      const { schreiben, loeschen } = urlaubChecksAbgleich({ wunsch: urlaubChecksWunsch(kern.state, heute), vorhanden: kern.state.urlaubChecks ?? [], heute });
      if (schreiben.length === 0 && loeschen.length === 0) return false;
      checksLaufen = true;
      try {
        await adapter.gleicheUrlaubChecksAb({ schreiben, loeschen });
      } catch {
        return false;
      } finally {
        checksLaufen = false;
      }
      const weg = new Set([...loeschen, ...schreiben.map((c) => urlaubCheckEventId(c.date))]);
      const neu = schreiben.map((c) => ({ id: urlaubCheckEventId(c.date), date: c.date, titel: c.title }));
      kern.state = { ...kern.state, urlaubChecks: [...(kern.state.urlaubChecks ?? []).filter((c) => !weg.has(c.id)), ...neu].sort((a, b) => a.date.localeCompare(b.date)) };
      return true;
    },

    setTag: (date, typ) => store.setTage([date], typ),

    /**
     * Setzt den Typ für mehrere Tage. → wie `ergebnisVon`, dazu `rueckgaengig()` (stellt die Tage auf den früheren Stand) – nicht,
     * wenn das Speichern gescheitert ist (dann ist schon alles zurückgenommen und neu geladen).
     */
    async setTage(dates, typ) {
      const vorher = dates.map((d) => [d, kern.state.tage[d]?.typ ?? null]);
      const tage = { ...kern.state.tage };
      for (const d of dates) tage[d] = { typ };
      const e = await aendere({ tage }, async (bericht) => {
        let i = 0;
        for (const d of dates) {
          await adapter.setzeTag(d, typ);
          bericht((i += 1), dates.length);
        }
      });
      return mitZuruecknehmen(ergebnisVon(e), () => stelleTageWieder(vorher));
    },

    /**
     * Löscht den Eintrag eines Tages. → { ok, fehler?, gemeldet?, wartet?, rueckgaengig? } (siehe `ergebnisVon`); `rueckgaengig()` setzt
     * den Typ wieder – nicht bei einem Tag mit Konflikt (zwei Einträge: der verdrängte käme nicht zurück). Nichts da → { ok: true }.
     */
    async loescheTag(date) {
      const vorher = kern.state.tage[date];
      if (!vorher) return { ok: true };
      const tage = { ...kern.state.tage };
      delete tage[date];
      const r = ergebnisVon(await aendere({ tage }, () => adapter.loescheTag(date)));
      const zurueck = async () =>
        ergebnisVon(await aendere({ tage: { ...kern.state.tage, [date]: { typ: vorher.typ } } }, ohneUeberschreiben(() => (adapter.stelleTagWieder ? adapter.stelleTagWieder(date, vorher.typ) : adapter.setzeTag(date, vorher.typ)))));
      return mitRueckgaengig(r, vorher.konflikt ? null : zurueck);
    },

    /**
     * Legt einen Urlaub an; Betreuungstage darin werden umgewandelt (gelöscht). Wirft sofort bei einem ungültigen Zeitraum.
     * → wie `ergebnisVon`, dazu { id, umgewandelt } und `rueckgaengig()` (nicht, wenn das Speichern gescheitert ist).
     */
    async urlaubHinzufuegen({ start, end }) {
      if (!(start <= end)) throw new Error('Ungültiger Zeitraum');
      const { tage, loeschen, entfernt } = betreuungUmwandeln(start, end);
      const eintrag = { id: neueId(), start, end };
      const e = await aendere({ tage, urlaub: [...kern.state.urlaub, eintrag] }, async (bericht) => {
        const gesamt = loeschen.length + 1;
        await umgewandelteTageLoeschen(loeschen, bericht, gesamt);
        await adapter.speichereUrlaub(eintrag);
        bericht(gesamt, gesamt);
      });
      const zurueck = () =>
        stelleTageWieder(entfernt, {
          zustand: { urlaub: kern.state.urlaub.filter((u) => u.id !== eintrag.id) },
          vorher: () => adapter.loescheUrlaub(eintrag.id),
        });
      return mitZuruecknehmen({ ...ergebnisVon(e), id: eintrag.id, umgewandelt: loeschen.length }, zurueck);
    },

    /**
     * Ändert Beginn und Ende eines Urlaubs (dasselbe Ereignis, gleiche Kennung); Betreuungstage im neuen Zeitraum werden wie beim Anlegen
     * umgewandelt. Wirft sofort bei einem ungültigen Zeitraum. Ist der Urlaub inzwischen (anderes Telefon) gelöscht: { ok: false, fehler }
     * und nichts wird angelegt. → wie `ergebnisVon`, dazu { umgewandelt } und `rueckgaengig()` (alter Zeitraum und umgewandelte Tage
     * zurück; nicht bei einem Ereignis einer wiederkehrenden Google-Serie, nicht nach einem Fehlschlag). Danach laufen die Urlaub-Checks neu.
     */
    async urlaubAendern(id, { start, end }) {
      if (!(start <= end)) throw new Error('Ungültiger Zeitraum');
      const alt = kern.state.urlaub.find((u) => u.id === id);
      if (!alt) return { ok: false, fehler: TEXT_URLAUB_WEG, gemeldet: false }; // nicht in state.fehler: die Oberfläche zeigt die Meldung (einmal)
      const { tage, loeschen, entfernt } = betreuungUmwandeln(start, end);
      const zeitraum = (z) => kern.state.urlaub.map((u) => (u.id === id ? { ...u, ...z } : u));
      let weg = false;
      const e = await aendere({ tage, urlaub: zeitraum({ start, end }) }, async (bericht) => {
        try {
          await adapter.aendereUrlaub({ id, start, end }); // zuerst: ist der Urlaub weg, bleiben die Betreuungstage unberührt
        } catch (fehler) {
          if (fehler?.name === 'UrlaubWeg') {
            weg = true;
            FACHLICH.add(fehler); // ihre Meldung steht dann in state.fehler
          }
          throw fehler;
        }
        await umgewandelteTageLoeschen(loeschen, bericht, loeschen.length + 1, 1);
        bericht(loeschen.length + 1, loeschen.length + 1);
      });
      if (weg) return { ok: false, fehler: TEXT_URLAUB_WEG, gemeldet: true };
      const r = { ...ergebnisVon(e), umgewandelt: loeschen.length };
      if (r.ok) store.urlaubChecksAbgleichen();
      const zurueck = () =>
        stelleTageWieder(entfernt, {
          zustand: { urlaub: zeitraum({ start: alt.start, end: alt.end }) },
          vorher: () => adapter.aendereUrlaub({ id, start: alt.start, end: alt.end }),
        });
      return mitRueckgaengig(r, einzelnWiederherstellbar(id) ? zurueck : null);
    },

    /**
     * Löscht einen Urlaub. → wie `loescheTag`; `rueckgaengig()` schreibt denselben Zeitraum mit derselben Kennung wieder (nicht bei
     * einem Ereignis einer wiederkehrenden Google-Serie, siehe einzelnWiederherstellbar).
     */
    async urlaubLoeschen(id) {
      const u = kern.state.urlaub.find((x) => x.id === id);
      const r = ergebnisVon(await aendere({ urlaub: kern.state.urlaub.filter((x) => x.id !== id) }, () => adapter.loescheUrlaub(id)));
      const zurueck = async () =>
        ergebnisVon(await aendere({ urlaub: [...kern.state.urlaub.filter((x) => x.id !== id), u] }, ohneUeberschreiben(() => (adapter.stelleUrlaubWieder ? adapter.stelleUrlaubWieder(u) : adapter.speichereUrlaub(u)))));
      return mitRueckgaengig(r, u && einzelnWiederherstellbar(id) ? zurueck : null);
    },

    /**
     * Legt einen Termin an oder ändert ihn (mit `id`). Wirft bei ungültigen Eingaben sofort einen Error mit deutscher Meldung.
     * → wie `ergebnisVon`, dazu `id` (auch wenn das Speichern gescheitert ist: dann steht der Termin nicht mehr im Zustand).
     */
    async terminSpeichern(roh, id = null) {
      const termin = { id: id ?? neueId(), ...normalisiereTermin(roh) };
      const termine = [...kern.state.termine.filter((t) => t.id !== termin.id), termin];
      return { ...ergebnisVon(await aendere({ termine }, () => adapter.speichereTermin(termin))), id: termin.id };
    },

    /**
     * Löscht einen Termin (oder eine einzelne Sache, auch aus einer Serie). → wie `loescheTag`; `rueckgaengig()` schreibt ihn unverändert
     * mit derselben Kennung wieder – nicht bei einem Termin einer wiederkehrenden Google-Serie; ist er inzwischen wieder da (anderes
     * Telefon), bleibt er unverändert (Meldung).
     */
    async terminLoeschen(id) {
      const t = kern.state.termine.find((x) => x.id === id);
      const r = ergebnisVon(await aendere({ termine: kern.state.termine.filter((x) => x.id !== id) }, () => adapter.loescheTermin(id)));
      const zurueck = async () =>
        ergebnisVon(await aendere({ termine: [...kern.state.termine.filter((x) => x.id !== id), t] }, ohneUeberschreiben(() => (adapter.stelleTerminWieder ? adapter.stelleTerminWieder(t) : adapter.speichereTermin(t)))));
      return mitRueckgaengig(r, t && einzelnWiederherstellbar(id) ? zurueck : null);
    },

    /**
     * Sachen für Krabbelstube/Kindergarten: einmalig (`wochen` = 1), als wöchentliche Serie (`wochen` > 1)
     * oder, mit `id`, als Änderung genau dieser Sache. Wirft sofort bei ungültigen Eingaben. → wie `ergebnisVon`, dazu
     * { ids, verschoben, uebersprungen }.
     */
    async sachenSpeichern(roh, { wochen = 1, id = null } = {}) {
      pruefeWochen(wochen);
      if (id) {
        const alt = kern.state.termine.find((t) => t.id === id);
        const basis = normalisiereTermin({ ...roh, typ: 'kita_sache', serie: alt?.serie });
        return { ...(await termineAnlegen([{ id, ...basis }])), ids: [id], verschoben: 0, uebersprungen: [] };
      }
      if (wochen === 1) {
        const termin = { id: neueId(), ...normalisiereTermin({ ...roh, typ: 'kita_sache', serie: undefined }) };
        return { ...(await termineAnlegen([termin])), ids: [termin.id], verschoben: 0, uebersprungen: [] };
      }
      const r = serieTermine(roh, wochen);
      return { ...(await termineAnlegen(r.termine)), ids: r.termine.map((t) => t.id), verschoben: r.verschoben, uebersprungen: r.uebersprungen };
    },

    /** Pyjamas-Wechsel: wöchentlich „Pyjamas hinbringen“ (hinTag) und „Pyjamas heimholen“ (heimTag), Mo = 0 … Fr = 4. → wie `sachenSpeichern`. */
    async pyjamasWechselSpeichern({ hinTag = 0, heimTag = 4, wochen = 8, mitnehmen = ['Pyjamas'] } = {}) {
      pruefeWochen(wochen);
      for (const tag of [hinTag, heimTag]) {
        if (!Number.isInteger(tag) || tag < 0 || tag > 4) throw new Error('Bitte Wochentage von Montag bis Freitag wählen.');
      }
      const heute = todayVienna(jetzt());
      const { bringzeit, abholzeit } = kern.state.settings;
      const hin = serieTermine({ richtung: 'hin', date: naechsterWochentag(heute, hinTag), time: bringzeit, mitnehmen, kosten: null }, wochen);
      const heim = serieTermine({ richtung: 'heim', date: naechsterWochentag(heute, heimTag), time: abholzeit, mitnehmen, kosten: null }, wochen);
      const neue = [...hin.termine, ...heim.termine];
      return {
        ...(await termineAnlegen(neue)),
        ids: neue.map((t) => t.id),
        verschoben: hin.verschoben + heim.verschoben,
        uebersprungen: [...hin.uebersprungen, ...heim.uebersprungen],
      };
    },

    /** Löscht diese Sache und, falls sie zu einer Serie gehört, alle folgenden. Gibt die Anzahl gelöschter Sachen zurück. */
    async terminLoeschenAbHier(id) {
      const t = kern.state.termine.find((x) => x.id === id);
      if (!t) return 0;
      const weg = t.serie ? kern.state.termine.filter((x) => x.serie === t.serie && x.date >= t.date) : [t];
      await aendere({ termine: kern.state.termine.filter((x) => !weg.includes(x)) }, async (bericht) => {
        let i = 0;
        for (const x of weg) {
          await adapter.loescheTermin(x.id);
          bericht((i += 1), weg.length);
        }
      });
      return weg.length;
    },

    /** „Erledigt“: entfernt die Sache (und damit die Erinnerung). `rueckgaengig` stellt sie unverändert wieder her. */
    async terminErledigt(id) {
      const t = kern.state.termine.find((x) => x.id === id);
      if (!t) return { rueckgaengig: async () => {} };
      await aendere({ termine: kern.state.termine.filter((x) => x.id !== id) }, () => adapter.loescheTermin(id));
      return {
        rueckgaengig: async () => {
          await aendere({ termine: [...kern.state.termine.filter((x) => x.id !== id), t] }, () => adapter.speichereTermin(t));
        },
      };
    },

    async einstellungen(teil) {
      const settings = normalizeSettings({ ...kern.state.settings, ...teil });
      await aendere({ settings }, async () => {
        await adapter.speichereSettings(teil);
        if (unlesbarMerken('settings', false)) melden(); // nicht abgelehnt: die gespeicherten Einstellungen waren lesbar
      });
    },

    /** Erinnerungen (nur mit Google): prüfen, reparieren, Test-Erinnerung starten/beenden. Fehler der Anmeldung laufen nach oben. */
    erinnerungenPruefen: () => adapter.pruefeErinnerungen(),
    erinnerungenReparieren: () => adapter.repariereErinnerungen(),
    erinnerungenTestStarten: () => adapter.starteTestErinnerung(),
    erinnerungenTestBeenden: () => adapter.beendeTestErinnerung(),
  };

  return { methoden, intern: { geladeneBereiche } };
}
