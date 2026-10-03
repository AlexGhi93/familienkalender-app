// Urlaub-Check: Erinnerung am 1. März, 1. Mai und 1. Juli (09:00) mit „noch X offen“, solange im Kindergartenjahr noch Urlaub offen ist.
// Reine Berechnung: was es geben soll (`urlaubChecksWunsch`) und was dafür im Kalender zu tun ist (`urlaubChecksAbgleich`).
import { istUrlaubCheckId, urlaubCheckEventId } from '../domain/ids.js';
import { planUrlaubChecks, urlaubStatus } from '../domain/urlaub.js';
import { schliessTageListe } from './views/gemeinsam.js';

/** [{ date, title, id }] für das aktuelle Kindergartenjahr; leer, wenn nichts mehr offen ist; nur zukünftige Daten. */
export function urlaubChecksWunsch(state, heute) {
  const spans = state.urlaub.map(({ start, end }) => ({ start, end }));
  const status = urlaubStatus({ spans, schliessTage: schliessTageListe(state), settings: state.settings, today: heute });
  return planUrlaubChecks({ status, today: heute }).map((c) => ({ ...c, id: urlaubCheckEventId(c.date) }));
}

/** Der Titel ohne „(Stand …)“: ändert sich nur das Datum des Standes, lohnt kein neues Schreiben. */
const ohneStand = (titel) => String(titel).replace(/ \(Stand [^)]*\)$/, '');

/**
 * Was im Kalender zu tun ist. `vorhanden` = [{ id, date, titel }] (die vorhandenen Checks); `heute` = 'JJJJ-MM-TT'.
 * schreiben: fehlende oder inhaltlich geänderte Checks; loeschen: IDs vergangener oder nicht mehr gewünschter Checks.
 * Nur eigene IDs (`fkc…`) werden je angefasst.
 */
export function urlaubChecksAbgleich({ wunsch, vorhanden, heute }) {
  const eigene = vorhanden.filter((v) => istUrlaubCheckId(v.id));
  const nachDatum = new Map(eigene.map((v) => [v.date, v]));
  const schreiben = wunsch.filter((w) => {
    const da = nachDatum.get(w.date);
    return !da || ohneStand(da.titel) !== ohneStand(w.title);
  });
  const gewuenscht = new Set(wunsch.map((w) => w.date));
  // der Check von heute bleibt bis morgen stehen (er hat schon erinnert oder erinnert gleich), alles Frühere und nicht mehr Gewünschte Spätere geht
  const loeschen = eigene.filter((v) => v.date < heute || (v.date > heute && !gewuenscht.has(v.date))).map((v) => v.id);
  return { schreiben: schreiben.map(({ date, title }) => ({ date, title })), loeschen };
}
