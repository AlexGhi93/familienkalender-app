// Alle Bildschirme und Zustände, die Kontrast-Prüfung (kontrast.mjs) und Galerie (galerie.mjs) besuchen: dieselben wie in der
// visuellen Regression (klassisch.spec.js), dazu die Blätter und Formulare der Aussehen. Jeder Eintrag: `name` (Dateiname),
// `titel` (für die Galerie), `blatt` (true = man sieht nur den Bildschirm, sonst die ganze Seite) und `oeffne(page)`.
import { starteDemo, WERKTAG, WERKTAG_DATUM } from './werkzeug.js';
import { seedDemo } from '../../src/app/seed.js';
import { autoId, demoMitAutos, winterRotationFaellig } from '../e2e/autos-hilfen.js';

const ABEND = '2026-10-14T19:00:00+02:00';
const AUTO_DEZEMBER = '2026-12-20T08:00:00+01:00'; // Tesla: Winterreifen überfällig, Vignette bald
const ansichtKonto = (page, name) => page.getByRole('group', { name: 'Ansicht im Konto' }).getByRole('button', { name });

function konfliktDemo() {
  const demo = seedDemo(WERKTAG_DATUM);
  demo.tage = { ...demo.tage, '2026-10-20': { typ: 'krank', konflikt: true, andere: ['kita_essen'] } };
  return demo;
}

export const BILDSCHIRME = [
  { name: 'heute', titel: 'Heute', oeffne: (p) => starteDemo(p) },
  { name: 'morgen', titel: 'Heute am Abend (Morgen)', oeffne: (p) => starteDemo(p, { zeit: ABEND }) },
  {
    name: 'monat',
    titel: 'Monat',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/monat' });
      await p.locator('.raster').waitFor();
    },
  },
  {
    name: 'tagesblatt',
    titel: 'Monat: Tagesblatt',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/monat' });
      await p.locator('.raster').getByRole('button', { name: 'Donnerstag, 22. Oktober' }).click();
      await p.getByRole('dialog', { name: 'Donnerstag, 22. Oktober' }).waitFor();
    },
  },
  {
    name: 'konflikt',
    titel: 'Monat: Konflikt im Tagesblatt',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/monat', speicher: { 'fk.demo.v1': konfliktDemo() } });
      await p.locator('.raster').getByRole('button', { name: /^Dienstag, 20\. Oktober/ }).click();
      await p.locator('.konflikt-hinweis').waitFor();
    },
  },
  {
    name: 'schicht',
    titel: 'Schicht',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/schicht' });
      await p.locator('.sp-zelle[data-datum="2026-10-21"]').waitFor();
    },
  },
  {
    name: 'schicht-pinsel',
    titel: 'Schicht: Pinsel',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/schicht' });
      await p.getByRole('button', { name: '✏️ Eintragen' }).click();
      await p.locator('.sp-pinsel').getByRole('button', { name: 'F Frühdienst', exact: true }).click();
      await p.locator('.sp-pinsel').waitFor();
    },
  },
  {
    name: 'schicht-tag',
    titel: 'Schicht: Blatt eines Tages',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/schicht' });
      await p.locator('.sp-zelle[data-datum="2026-10-21"]').click();
      await p.getByRole('dialog', { name: 'Mittwoch, 21. Oktober' }).waitFor();
    },
  },
  {
    name: 'schichtarten',
    titel: 'Schicht: Schichtarten',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/schicht' });
      await p.getByRole('button', { name: 'Schichtarten bearbeiten' }).click();
      await p.locator('.sp-arten-person[data-person="papa"]').waitFor();
    },
  },
  {
    name: 'schichtart-formular',
    titel: 'Schicht: neue Art',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/schicht' });
      await p.getByRole('button', { name: 'Schichtarten bearbeiten' }).click();
      await p.locator('.sp-arten-person[data-person="papa"]').getByRole('button', { name: '＋ Neue Art' }).click();
      await p.locator('.sp-art-form').waitFor();
    },
  },
  {
    name: 'konto-kontostand',
    titel: 'Konto: Kontostand',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/konto' });
      await ansichtKonto(p, 'Kontostand').waitFor();
    },
  },
  {
    name: 'konto-fixkosten',
    titel: 'Konto: Fixkosten',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/konto/fixkosten' });
      await p.getByRole('button', { name: '＋ Fixkosten eintragen' }).waitFor();
    },
  },
  {
    name: 'konto-sparziele',
    titel: 'Konto: Sparziele',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/konto/sparziele' });
      await p.getByRole('button', { name: '＋ Neues Sparziel' }).waitFor();
    },
  },
  {
    name: 'fixkosten-formular',
    titel: 'Konto: Fixkosten-Formular',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/konto/fixkosten' });
      await p.getByRole('button', { name: '＋ Fixkosten eintragen' }).click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'sparziel-formular',
    titel: 'Konto: Sparziel-Formular',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/konto/sparziele' });
      await p.getByRole('button', { name: '＋ Neues Sparziel' }).click();
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'neu',
    titel: 'Neu',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/neu' });
      await p.locator('.kacheln .kachel').first().waitFor();
    },
  },
  {
    name: 'termin-formular',
    titel: 'Neu: Termin',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/neu' });
      await p.locator('.kachel').filter({ hasText: /^📌Termin$/ }).click();
      await p.getByRole('button', { name: '‹ Zurück' }).waitFor();
    },
  },
  {
    name: 'sachen-formular',
    titel: 'Neu: Sachen für die Krabbelstube',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/neu' });
      await p.locator('.kacheln .kachel').filter({ has: p.locator('b', { hasText: /^Sachen für Krabbelstube$/ }) }).click();
      await p.getByRole('button', { name: '‹ Zurück' }).waitFor();
    },
  },
  {
    name: 'einkauf',
    titel: 'Einkauf',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/einkauf' });
      await p.getByRole('button', { name: 'Milch löschen' }).waitFor();
    },
  },
  {
    name: 'toast',
    titel: 'Einkauf: Meldung mit „Rückgängig“',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/einkauf' });
      await p.getByRole('button', { name: 'Milch löschen' }).click();
      await p.locator('.toast.auf').getByRole('button', { name: 'Rückgängig' }).waitFor();
    },
  },
  {
    name: 'urlaub',
    titel: 'Urlaub',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/urlaub' });
      await p.getByRole('button', { name: 'Urlaub planen' }).waitFor();
    },
  },
  {
    name: 'rueckfrage',
    titel: 'Urlaub: Rückfrage',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/urlaub' });
      await p.locator('.liste .zeile').filter({ hasText: '2. Nov.' }).getByRole('button', { name: 'Löschen' }).click();
      await p.getByRole('dialog', { name: 'Urlaub löschen?' }).waitFor();
    },
  },
  {
    name: 'mehr',
    titel: 'Mehr',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/mehr' });
      await p.locator('.menue-eintrag').first().waitFor();
    },
  },
  {
    name: 'mehr-offen',
    titel: 'Mehr: Familie aufgeklappt',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/mehr' });
      await p.locator('.menue-eintrag[data-id="familie"] .menue-zeile').click();
      await p.locator('.menue-eintrag[data-id="familie"].offen').waitFor();
    },
  },
  ...['mitnehmen', 'kontostand', 'bringen', 'nachrichten', 'zeiten'].map((id) => ({
    name: `mehr-${id}`,
    titel: `Mehr: ${id[0].toUpperCase()}${id.slice(1)} aufgeklappt`,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/mehr' });
      await p.locator(`.menue-eintrag[data-id="${id}"] .menue-zeile`).click();
      await p.locator(`.menue-eintrag[data-id="${id}"].offen`).waitFor();
    },
  })),
  {
    name: 'autos',
    titel: 'Autos: Liste',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/autos' });
      await p.locator('.au-karte').first().waitFor();
    },
  },
  {
    name: 'autos-leer',
    titel: 'Autos: noch kein Auto',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/autos', speicher: { 'fk.demo.v1': demoMitAutos(WERKTAG_DATUM, undefined, { leer: true }) } });
      await p.locator('.au-leer').waitFor();
    },
  },
  {
    name: 'auto-tesla',
    titel: 'Auto: Tesla (Fällig, km, Reifen, Vignette, Verlauf, Daten)',
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Tesla Model 3')}` });
      await p.locator('.au-held').waitFor();
    },
  },
  {
    name: 'auto-fiat',
    titel: 'Auto: Fiat (unbekannte Termine, Ölwechsel)',
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Fiat 500')}` });
      await p.locator('.au-held').waitFor();
    },
  },
  {
    name: 'auto-faellig',
    titel: 'Auto: überfällig und bald (20.12.)',
    oeffne: async (p) => {
      await starteDemo(p, { zeit: AUTO_DEZEMBER, route: `#/autos/${autoId('2026-12-20', 'Tesla Model 3')}` });
      await p.locator('.au-regel.ueberfaellig').first().waitFor();
    },
  },
  {
    name: 'auto-oelwechsel',
    titel: 'Auto: Ölwechsel eintragen',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Fiat 500')}` });
      await p.getByRole('button', { name: 'Ölwechsel: Erledigt eintragen' }).click();
      await p.getByRole('dialog', { name: '🛢️ Ölwechsel eintragen' }).waitFor();
    },
  },
  {
    name: 'auto-reifenwechsel',
    titel: 'Auto: Reifenwechsel mit Vorschlag „vorne/hinten getauscht“',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Tesla Model 3')}`, speicher: { 'fk.demo.v1': demoMitAutos(WERKTAG_DATUM, winterRotationFaellig) } });
      await p.getByRole('button', { name: '＋ Reifenwechsel' }).click();
      await p.locator('.au-vorschlag').waitFor();
    },
  },
  {
    name: 'auto-vignette',
    titel: 'Auto: Vignette eintragen',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Tesla Model 3')}` });
      await p.getByRole('button', { name: 'Vignette eintragen' }).click();
      await p.getByRole('dialog', { name: '🎫 Vignette eintragen' }).waitFor();
    },
  },
  {
    name: 'auto-km',
    titel: 'Auto: Kilometerstand mit „bitte prüfen“',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Tesla Model 3')}` });
      await p.getByRole('button', { name: 'Kilometerstand aktualisieren' }).click();
      await p.getByRole('dialog', { name: 'Kilometerstand aktualisieren' }).getByRole('textbox', { name: 'Kilometerstand laut Tacho' }).fill('17.000');
      await p.locator('.au-feld-hinweis').waitFor();
    },
  },
  {
    name: 'auto-regel',
    titel: 'Auto: Regel (Info, Quelle, Intervall)',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Fiat 500')}` });
      await p.getByRole('button', { name: 'Ölwechsel: Info, Quelle, ändern oder abschalten' }).click();
      await p.locator('.au-regel-info').waitFor();
    },
  },
  {
    name: 'auto-neu',
    titel: 'Auto hinzufügen (Vorlage)',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/autos' });
      await p.getByRole('button', { name: '＋ Auto hinzufügen' }).click();
      await p.getByRole('dialog', { name: '＋ Auto hinzufügen' }).waitFor();
    },
  },
  {
    name: 'auto-daten',
    titel: 'Auto: Fahrzeugdaten bearbeiten',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p, { route: `#/autos/${autoId(WERKTAG_DATUM, 'Tesla Model 3')}` });
      await p.getByRole('button', { name: 'Fahrzeugdaten bearbeiten' }).click();
      await p.getByRole('dialog', { name: 'Fahrzeugdaten bearbeiten' }).waitFor();
    },
  },
  {
    name: 'konto-und-app',
    titel: 'Konto & App',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/app' });
      await p.getByRole('button', { name: 'Demo zurücksetzen' }).waitFor();
    },
  },
  {
    name: 'verlauf',
    titel: 'Verlauf',
    oeffne: async (p) => {
      await starteDemo(p, { route: '#/verlauf' });
      await p.getByRole('heading', { name: 'Verlauf 📜' }).waitFor();
      await p.waitForFunction(() => !document.querySelector('#inhalt')?.textContent.includes('Lade …'));
    },
  },
  {
    name: 'nachricht-blatt',
    titel: 'Nachricht an die Krabbelstube',
    blatt: true,
    oeffne: async (p) => {
      await starteDemo(p);
      await p.getByRole('button', { name: 'Krabbelstube benachrichtigen', exact: true }).click();
      await p.getByRole('dialog', { name: 'Nachricht an die Krabbelstube' }).waitFor();
    },
  },
  {
    name: 'willkommen',
    titel: 'Willkommen',
    oeffne: async (p) => {
      await p.clock.setFixedTime(new Date(WERKTAG));
      await p.goto('/');
      await p.getByRole('heading', { name: 'Willkommen beim Familienkalender' }).waitFor();
    },
  },
  {
    name: 'einrichtung',
    titel: 'Einrichtung',
    oeffne: async (p) => {
      await p.clock.setFixedTime(new Date(WERKTAG));
      await p.route(/accounts\.google\.com|googleapis\.com|workers\.dev/, (r) => r.abort());
      await p.goto('/');
      await p.getByRole('button', { name: /Neu einrichten/ }).click();
      await p.getByRole('button', { name: 'Mit Google anmelden' }).waitFor();
    },
  },
];
