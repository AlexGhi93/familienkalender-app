// Weitere reine Regeln: Konflikte, Ereignis-IDs, Urlaubsstand, offene Tage, Umwandlung, Notizen, Eingaben, Darstellung.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dominanterTyp, hatKonflikt, verdraengteTypen } from '../../src/domain/konflikt.js';
import { dateFromDayEventId, dayEventId, istUrlaubCheckId, isValidGoogleEventId, urlaubCheckEventId } from '../../src/domain/ids.js';
import { jahrFuerId, kindergartenjahr, naechsterUrlaub, planUrlaubChecks, urlaubCheckDaten, urlaubStatus } from '../../src/domain/urlaub.js';
import { offeneTage, planBestaetigung } from '../../src/domain/offen.js';
import { planUmwandlung } from '../../src/domain/umwandlung.js';
import { MAX_NOTIZ, bereinigeNotiz, notizAusBeschreibung } from '../../src/domain/notiz.js';
import { datumAnzeige, datumAusEingabe, datumWaehrendTippen, zeitAusEingabe, zeitWaehrendTippen } from '../../src/domain/eingabe.js';
import { DARSTELLUNGEN, DARSTELLUNG_SCHLUESSEL, gueltigeDarstellung, istDunkel, themeAttribut, themeFarben } from '../../src/domain/darstellung.js';
import { normalizeSettings } from '../../src/domain/settings.js';

describe('Konflikte am selben Tag', () => {
  test('Vorrang: Urlaub > Krank > Abwesend > Schließtag > Betreuung', () => {
    assert.equal(dominanterTyp(['kita_essen', 'krank']), 'krank');
    assert.equal(dominanterTyp(['schliess', 'abwesend', 'kita_ohne']), 'abwesend');
    assert.equal(dominanterTyp(['krank', 'urlaub']), 'urlaub');
    assert.equal(dominanterTyp(['kita_ohne', 'kita_essen']), 'kita_essen');
    assert.equal(dominanterTyp([]), null);
  });

  test('verdrängte Typen und Konflikt-Erkennung', () => {
    assert.deepEqual(verdraengteTypen(['kita_essen', 'krank', 'kita_essen', 'abwesend']), ['abwesend', 'kita_essen']);
    assert.equal(hatKonflikt(['krank', 'krank']), false);
    assert.equal(hatKonflikt(['krank', 'abwesend']), true);
    assert.equal(hatKonflikt(['krank', 'arzt']), false);
  });
});

describe('Ereignis-IDs', () => {
  test('Tages-IDs hin und zurück', () => {
    assert.equal(dayEventId('2026-10-14'), 'fk20261014');
    assert.equal(dateFromDayEventId('fk20261014'), '2026-10-14');
    assert.equal(dateFromDayEventId('fk20260230'), null);
    assert.equal(dateFromDayEventId('fkc20261014'), null);
    assert.throws(() => dayEventId('14.10.2026'));
  });

  test('Urlaub-Check-IDs gehören der App nur mit gültigem Datum', () => {
    assert.equal(urlaubCheckEventId('2027-03-01'), 'fkc20270301');
    assert.equal(istUrlaubCheckId('fkc20270301'), true);
    assert.equal(istUrlaubCheckId('fkc20270230'), false);
    assert.equal(istUrlaubCheckId('fk20270301'), false);
    assert.equal(istUrlaubCheckId(undefined), false);
  });

  test('erlaubte Zeichen für Google-IDs (a–v, 0–9, 5 bis 1024)', () => {
    assert.equal(isValidGoogleEventId('fk20261014'), true);
    assert.equal(isValidGoogleEventId('uabc0123456'), true);
    assert.equal(isValidGoogleEventId('fkw2026'), false);
    assert.equal(isValidGoogleEventId('abcd'), false);
    assert.equal(isValidGoogleEventId('ABCDE'), false);
  });
});

describe('Urlaub im Kindergartenjahr', () => {
  const settings = normalizeSettings();

  test('Kindergartenjahr', () => {
    assert.deepEqual(jahrFuerId(2026), { id: 2026, start: '2026-09-01', end: '2027-08-31' });
    assert.equal(kindergartenjahr('2026-08-31').id, 2025);
    assert.equal(kindergartenjahr('2026-09-01').id, 2026);
    assert.deepEqual(kindergartenjahr('2027-01-15', '01-01'), { id: 2027, start: '2027-01-01', end: '2027-12-31' });
  });

  test('genommen, geplant, offen; Wochenenden und Feiertage zählen nicht', () => {
    const spans = [
      { start: '2026-10-05', end: '2026-10-09' }, // 5 Tage, vorbei
      { start: '2026-10-26', end: '2026-10-30' }, // Nationalfeiertag am Montag: 4 Tage geplant
    ];
    const s = urlaubStatus({ spans, settings, today: '2026-10-14' });
    assert.deepEqual([s.ziel, s.genommen, s.geplant, s.offen], [25, 5, 4, 16]);
    assert.equal(s.durchgehend.ziel, 10);
    assert.equal(s.durchgehend.erfuellt, false);
  });

  test('zwei Wochen am Stück: ein Feiertag mittendrin überbrückt und zählt zur Serie', () => {
    const spans = [{ start: '2027-05-10', end: '2027-05-21' }]; // Pfingstmontag 17.05. mittendrin
    const s = urlaubStatus({ spans, settings, today: '2026-10-14' });
    assert.equal(s.geplant, 9);
    assert.equal(s.durchgehend.laengsteSerie, 10);
    assert.equal(s.durchgehend.erfuellt, true);
  });

  test('ein Feiertag am Rand der Serie zählt nicht mit', () => {
    const spans = [{ start: '2026-12-21', end: '2027-01-01' }]; // Christtag mittendrin, Neujahr am Ende
    const s = urlaubStatus({ spans, settings, today: '2026-10-14' });
    assert.equal(s.geplant, 8);
    assert.equal(s.durchgehend.laengsteSerie, 9);
    assert.equal(s.durchgehend.erfuellt, false);
  });

  test('Schließtage: neutral oder als Urlaub gezählt', () => {
    const spans = [{ start: '2026-11-02', end: '2026-11-06' }, { start: '2026-11-10', end: '2026-11-13' }];
    const ohne = urlaubStatus({ spans, schliessTage: ['2026-11-09'], settings, today: '2026-10-14' });
    assert.equal(ohne.geplant, 9);
    assert.equal(ohne.durchgehend.laengsteSerie, 10); // Schließtag überbrückt
    const mit = urlaubStatus({ spans, schliessTage: ['2026-11-09'], settings: normalizeSettings({ schliessZaehlenAlsUrlaub: true }), today: '2026-10-14' });
    assert.equal(mit.geplant, 10);
  });

  test('anderes Jahr über jahrOffset; ohne Ziel für „am Stück“ gilt es als erfüllt', () => {
    const s = urlaubStatus({ spans: [], settings: normalizeSettings({ durchgehendWochen: 0 }), today: '2026-10-14', jahrOffset: -1 });
    assert.equal(s.jahr.id, 2025);
    assert.equal(s.offen, 25);
    assert.equal(s.durchgehend.erfuellt, true);
  });

  test('nächster Urlaub und „schlafen“', () => {
    assert.deepEqual(naechsterUrlaub([{ start: '2026-10-20', end: '2026-10-21' }, { start: '2026-10-10', end: '2026-10-11' }], '2026-10-14'), { start: '2026-10-20', schlafen: 6 });
    assert.equal(naechsterUrlaub([{ start: '2026-10-14', end: '2026-10-15' }], '2026-10-14'), null);
  });

  test('Urlaub-Checks am 1.3., 1.5., 1.7. – nur zukünftig und nur, solange etwas offen ist', () => {
    assert.deepEqual(urlaubCheckDaten(jahrFuerId(2026)), ['2027-03-01', '2027-05-01', '2027-07-01']);
    const status = urlaubStatus({ spans: [], settings, today: '2027-04-10' });
    assert.deepEqual(planUrlaubChecks({ status, today: '2027-04-10' }), [
      { date: '2027-05-01', title: '🏖️ Urlaub-Check: noch 5 Wochen offen (Stand 10.04.)' },
      { date: '2027-07-01', title: '🏖️ Urlaub-Check: noch 5 Wochen offen (Stand 10.04.)' },
    ]);
    assert.deepEqual(planUrlaubChecks({ status: { ...status, offen: 0 }, today: '2027-04-10' }), []);
  });
});

describe('offene Tage und Bestätigung', () => {
  test('erwartete Werktage ohne Eintrag bis gestern, ohne Feiertage', () => {
    const tage = offeneTage({
      erwartung: [0, 1, 2, 3, 4],
      erfassungAb: '2026-10-22',
      today: '2026-10-30',
      anwesenheit: new Set(['2026-10-22']),
      abwesenheit: new Set(['2026-10-23']),
      urlaub: new Set(['2026-10-27']),
    });
    assert.deepEqual(tage, ['2026-10-28', '2026-10-29']); // 26.10. Feiertag, Wochenende fällt weg, heute zählt nicht
    assert.deepEqual(offeneTage({ erwartung: [0], erfassungAb: null, today: '2026-10-30', anwesenheit: new Set(), abwesenheit: new Set(), urlaub: new Set() }), []);
  });

  test('Bestätigung: deterministische IDs, mit oder ohne Essen', () => {
    assert.deepEqual(planBestaetigung(['2026-10-28']), [{ date: '2026-10-28', typ: 'kita_essen', id: 'fk20261028' }]);
    assert.equal(planBestaetigung(['2026-10-28'], false)[0].typ, 'kita_ohne');
  });
});

describe('Umwandlung von Betreuungstagen', () => {
  test('Abwesenheit: löschen und je Tag neu anlegen; Urlaub: nur löschen', () => {
    const vorhandeneBifen = new Set(['2026-10-14']);
    assert.deepEqual(planUmwandlung({ dates: ['2026-10-14', '2026-10-15'], zielTyp: 'krank', vorhandeneBifen }), {
      loeschen: ['2026-10-14'],
      erstellen: [
        { date: '2026-10-14', typ: 'krank', id: 'fk20261014' },
        { date: '2026-10-15', typ: 'krank', id: 'fk20261015' },
      ],
    });
    assert.deepEqual(planUmwandlung({ dates: ['2026-10-14'], zielTyp: 'urlaub', vorhandeneBifen }), { loeschen: ['2026-10-14'], erstellen: [] });
    assert.throws(() => planUmwandlung({ dates: [], zielTyp: 'kita_essen', vorhandeneBifen }), /Ungültiger Zieltyp/);
  });
});

describe('Notiz', () => {
  test('bereinigeNotiz vereinheitlicht Zeilen und Leerraum', () => {
    assert.equal(bereinigeNotiz('  a  \r\nb\r\r\n\n\nc  '), 'a\nb\n\nc');
    assert.equal(bereinigeNotiz('   '), '');
  });

  test('notizAusBeschreibung: HTML aus Google Kalender wird Text, gekürzt, leer = null', () => {
    assert.equal(notizAusBeschreibung('2. Stock<br>Zimmer&nbsp;3 &amp; 4<p>x &lt;y&gt;</p><b>fett</b>'), '2. Stock\nZimmer 3 & 4x <y>\nfett');
    assert.equal(notizAusBeschreibung('<div></div>'), null);
    assert.equal(notizAusBeschreibung(undefined), null);
    assert.equal(notizAusBeschreibung('x'.repeat(MAX_NOTIZ + 50)).length, MAX_NOTIZ);
  });
});

describe('Eingabe von Uhrzeit und Datum mit der Zifferntastatur', () => {
  test('zeitAusEingabe', () => {
    const faelle = { '0730': '07:30', 730: '07:30', '7:30': '07:30', '7.30': '07:30', '7 30': '07:30', 19: '19:00', 7: '07:00', '23:59': '23:59', 2400: null, '12:60': null, abc: null, '': null, '7:3': null };
    for (const [ein, aus] of Object.entries(faelle)) assert.equal(zeitAusEingabe(ein), aus, ein);
    assert.equal(zeitAusEingabe(null), null);
  });

  test('zeitWaehrendTippen', () => {
    assert.equal(zeitWaehrendTippen('0730'), '07:30');
    assert.equal(zeitWaehrendTippen('073'), '073');
    assert.equal(zeitWaehrendTippen('07a3'), '073');
    assert.equal(zeitWaehrendTippen('7:3a'), '7:3');
    assert.equal(zeitWaehrendTippen('073012'), '07:30');
  });

  test('datumAusEingabe mit und ohne Jahr', () => {
    const heute = '2026-10-10';
    const faelle = {
      '03.10.2026': '2026-10-03',
      '3.10.26': '2026-10-03',
      '03102026': '2026-10-03',
      '031026': '2026-10-03',
      '3/10/2026': '2026-10-03',
      '3.10.': '2026-10-03',
      '0310': '2026-10-03',
      '24.12.': '2026-12-24',
      '1.1.': '2027-01-01', // mehr als ein halbes Jahr vorbei → nächstes Jahr
      '1.5.': '2026-05-01',
      '31.02.2026': null,
      '1.1.1999': null,
      '1.1.2101': null,
      morgen: null,
      '': null,
    };
    for (const [ein, aus] of Object.entries(faelle)) assert.equal(datumAusEingabe(ein, { heute }), aus, ein);
  });

  test('datumWaehrendTippen / datumAnzeige', () => {
    assert.equal(datumWaehrendTippen('03102026'), '03.10.2026');
    assert.equal(datumWaehrendTippen('0310'), '0310');
    assert.equal(datumWaehrendTippen('3.10.x'), '3.10.');
    assert.equal(datumAnzeige('2026-10-03'), '03.10.2026');
    assert.equal(datumAnzeige(''), '');
    assert.equal(datumAnzeige('2026-02-30'), '');
  });
});

describe('Darstellung (Hell/Dunkel)', () => {
  test('Regeln', () => {
    assert.deepEqual(DARSTELLUNGEN, ['auto', 'hell', 'dunkel']);
    assert.equal(gueltigeDarstellung('dunkel'), 'dunkel');
    assert.equal(gueltigeDarstellung('lila'), 'auto');
    assert.equal(gueltigeDarstellung(null), 'auto');
    assert.equal(themeAttribut('hell'), 'light');
    assert.equal(themeAttribut('dunkel'), 'dark');
    assert.equal(themeAttribut('auto'), null);
    assert.equal(istDunkel('auto', true), true);
    assert.equal(istDunkel('hell', true), false);
    assert.equal(istDunkel('dunkel', false), true);
    assert.equal(themeFarben('auto').length, 2);
  });

  // src/theme-init.js läuft vor allen Modulen als klassisches Skript und wiederholt dieselben Regeln: beide müssen übereinstimmen.
  const skript = readFileSync(new URL('../../src/theme-init.js', import.meta.url), 'utf8');

  function themeInitAusfuehren(gespeichert, { speicherKaputt = false } = {}) {
    const attribute = new Map();
    const metas = [{ name: 'theme-color', content: '#FFF7EC', media: '(prefers-color-scheme: light)', entfernt: false }, { name: 'theme-color', content: '#1F1B2E', media: '(prefers-color-scheme: dark)', entfernt: false }];
    const neu = [];
    const document = {
      documentElement: { setAttribute: (k, v) => attribute.set(k, v), removeAttribute: (k) => attribute.delete(k) },
      querySelectorAll: () => metas.map((m) => ({ remove: () => (m.entfernt = true) })),
      createElement: () => {
        const el = { attrs: {}, setAttribute: (k, v) => (el.attrs[k] = v) };
        return el;
      },
      head: { append: (el) => neu.push(el.attrs) },
    };
    const localStorage = {
      getItem: (k) => {
        if (speicherKaputt) throw new Error('gesperrt');
        return k === DARSTELLUNG_SCHLUESSEL ? gespeichert : null;
      },
    };
    vm.runInNewContext(skript, { document, localStorage });
    const uebrig = metas.filter((m) => !m.entfernt).map(({ content, media }) => ({ farbe: content, media }));
    return { theme: attribute.get('data-theme') ?? null, farben: [...uebrig, ...neu.map((a) => ({ farbe: a.content, media: a.media ?? null }))] };
  }

  for (const gespeichert of [null, 'auto', 'hell', 'dunkel', 'lila']) {
    test(`theme-init.js stimmt mit domain/darstellung.js überein (gespeichert: ${gespeichert})`, () => {
      const wahl = gueltigeDarstellung(gespeichert);
      assert.deepEqual(themeInitAusfuehren(gespeichert), { theme: themeAttribut(wahl), farben: themeFarben(wahl) });
    });
  }

  test('theme-init.js folgt bei gesperrtem Speicher dem Telefon', () => {
    assert.deepEqual(themeInitAusfuehren('dunkel', { speicherKaputt: true }), { theme: null, farben: themeFarben('auto') });
  });
});
