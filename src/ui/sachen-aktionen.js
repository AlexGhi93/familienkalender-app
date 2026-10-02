import { h } from './dom.js';
import { bestaetigen, blatt, toast } from './components.js';

/** „Erledigt“: die Sache verschwindet (und damit die Erinnerung); 10 Sekunden lang gibt es „Rückgängig“. */
export async function sacheErledigt(store, id) {
  const { rueckgaengig } = await store.terminErledigt(id);
  toast('Erledigt ✓', {
    aktion: {
      text: 'Rückgängig',
      beiKlick: async () => {
        await rueckgaengig();
        toast('Wieder offen');
      },
    },
  });
}

/** Löschen mit Rückfrage; bei Serien zusätzlich die Wahl „Nur diese“ oder „Diese und alle folgenden“. */
export function sacheLoeschen(store, e) {
  const bezeichnung = `${e.label}${e.time ? ` um ${e.time}` : ''}`;
  if (!e.serie) {
    return bestaetigen({
      titel: 'Sache löschen?',
      text: `${bezeichnung} wird entfernt.`,
      ja: 'Löschen',
      gefahr: true,
      beiJa: async () => {
        await store.terminLoeschen(e.id);
        toast('Gelöscht');
      },
    });
  }
  return blatt({
    titel: 'Sache löschen?',
    render: ({ schliessen }) => [
      h('p', { class: 'blatt-text' }, `${bezeichnung} gehört zu einer Serie. Was soll gelöscht werden?`),
      h(
        'div',
        { class: 'knopfspalte breit' },
        h(
          'button',
          {
            class: 'knopf klein',
            type: 'button',
            onClick: async () => {
              schliessen();
              await store.terminLoeschen(e.id);
              toast('Gelöscht');
            },
          },
          'Nur diese',
        ),
        h(
          'button',
          {
            class: 'knopf klein gefahr',
            type: 'button',
            onClick: async () => {
              schliessen();
              const n = await store.terminLoeschenAbHier(e.id);
              toast(`${n} ${n === 1 ? 'Sache' : 'Sachen'} gelöscht`);
            },
          },
          'Diese und alle folgenden',
        ),
        h('button', { class: 'knopf klein', type: 'button', onClick: schliessen }, 'Abbrechen'),
      ),
    ],
  });
}
