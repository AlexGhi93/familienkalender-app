// Bearbeiten kurzer Listen (Mitnehmen je Arzt-Untertyp, eigene Sachen): rein, ohne DOM. Die Grenzen stehen in domain/settings.js.
import { MAX_LISTEN_EINTRAG, bereinigeListenEintrag } from '../domain/settings.js';

const schluessel = (text) => text.toLocaleLowerCase('de');

/** Neue Liste mit dem Eintrag am Ende; wirft mit deutscher Meldung, wenn er nicht passt. */
export function listeMitEintrag(liste, text, { max }) {
  const eintrag = bereinigeListenEintrag(text);
  if (eintrag === '') throw new Error('Bitte etwas eingeben.');
  if (eintrag.length > MAX_LISTEN_EINTRAG) throw new Error(`Das ist zu lang (höchstens ${MAX_LISTEN_EINTRAG} Zeichen).`);
  if (liste.some((x) => schluessel(x) === schluessel(eintrag))) throw new Error('Das steht schon in der Liste.');
  if (liste.length >= max) throw new Error(`Höchstens ${max} Einträge. Bitte erst einen entfernen.`);
  return [...liste, eintrag];
}

export const listeOhneEintrag = (liste, text) => liste.filter((x) => x !== text);
