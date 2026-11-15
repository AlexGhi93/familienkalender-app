// Unlesbarer Text in den älteren versteckten Kalenderereignissen (Kontostand, Einkaufsliste, Schichtarten, Schichtmonate, Einstellungen,
// Geräte-Register): kaputtes JSON oder eine neuere App-Version. So ein Text wird leer GEZEIGT, aber nie überschrieben – der Adapter wirft
// beim Ändern `unlesbarFehler(bereich)`, statt zu schreiben (wie Fixkosten, Sparziele, Autos und Versicherung mit ihren „…Gesperrt“-Fehlern).
// Es zählt nur die Hülle; einzelne ungültige Einträge in einer gültigen Hülle werden wie bisher nachsichtig verworfen.
// Rein, ohne DOM und ohne Netz.
import { istObjekt } from './gemeinsam.js';

/**
 * Liest die Hülle eines gespeicherten Textes: { art: 'leer' } (kein Text oder nur Leerraum – es gibt noch nichts), { art: 'lesbar', roh }
 * (ein JSON-Objekt mit `v: 1`) oder { art: 'unlesbar' } (kaputtes JSON, kein Objekt, andere Version). Mit `ohneV` darf `v` fehlen
 * (Einstellungen der ersten Fassungen): unlesbar ist dann nur ein vorhandenes `v`, das nicht 1 ist.
 */
export function huelleLesen(text, { ohneV = false } = {}) {
  if (typeof text !== 'string' || text.trim() === '') return { art: 'leer' };
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    return { art: 'unlesbar' };
  }
  if (!istObjekt(roh)) return { art: 'unlesbar' };
  const versionPasst = roh.v === 1 || (ohneV && roh.v === undefined);
  return versionPasst ? { art: 'lesbar', roh } : { art: 'unlesbar' };
}

const GRUND = 'unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht,';
const BEIDE = '– bitte die App auf beiden Telefonen aktualisieren.';

/** Meldung je Bereich (für den Hinweis oben auf der Seite und als Text des Fehlers „Unlesbar“). */
export const UNLESBAR_TEXT = Object.freeze({
  konto: `Die Kontostände sind ${GRUND} lassen sie sich hier nicht ändern ${BEIDE}`,
  einkauf: `Die Einkaufsliste ist ${GRUND} lässt sie sich hier nicht ändern ${BEIDE}`,
  settings: `Die Einstellungen sind ${GRUND} lassen sie sich hier nicht ändern ${BEIDE}`,
  schichtarten: `Die Schichtarten sind ${GRUND} lassen sie sich hier nicht ändern ${BEIDE}`,
  schicht: `Dieser Monat des Schichtplans ist ${GRUND} lässt er sich hier nicht ändern ${BEIDE}`,
  geraete: 'Das Geräte-Register stammt von einer neueren App-Version. Damit nichts verloren geht, lässt es sich hier nicht ändern – bitte die App auf diesem Telefon aktualisieren.',
});

/**
 * Fehler „Unlesbar“ (Name 'Unlesbar'): ein Adapter wirft ihn, statt unlesbaren Text zu überschreiben. `bereich` = 'konto' | 'einkauf' |
 * 'settings' | 'schichtarten' | 'geraete' | 'schicht:JJJJ-MM'; die Meldung ist die des Bereichs.
 */
export const unlesbarFehler = (bereich) => Object.assign(new Error(UNLESBAR_TEXT[bereich.split(':')[0]]), { name: 'Unlesbar', bereich });
