// View-Modell der Seite „Sparziele“ im Konto-Tab (ohne DOM): Kopf, Zielkarten mit Stand und Status, „Frei verfügbar“, Verlauf pro Monat
// (Summe stimmt), abgeschlossene Ziele (Ausblenden), Sperren (unlesbar / nicht geladen), Formular-Entwurf und Bedarf pro Monat.
// Alle erwarteten Zahlen kommen aus der Domäne (sparVerlauf) oder aus kleinen, hier erfundenen Beispielen – nie aus der Machette.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bedarfVorschau, entwurfZuZiel, monatText, sparzieleModel, zielEntwurf, zielBisText, SYMBOL_NAMEN } from '../../src/app/views/sparziele-model.js';
import { KONTO_ANSICHTEN, kontoAnsichtLesen, kontoAnsichtSpeichern } from '../../src/app/views/fixkosten-model.js';
import { nurHintergrundGeaendert } from '../../src/app/hintergrund.js';
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, ZIEL_EMOJIS, sparVerlauf } from '../../src/domain/sparziele.js';
import { betragText, deltaText } from '../../src/domain/konto.js';
import { seedDemo } from '../../src/app/seed.js';
import { speicherAttrappe, zustand } from './hilfen.js';

const HEUTE = '2026-10-14';
const demo = seedDemo(HEUTE);
const zieleZustand = (daten, mehr = {}) => ({ daten, status: 'geladen', unlesbar: false, warnungen: [], ...mehr });
const mitDemo = (mehr = {}, konto = demo.konto, daten = demo.ziele) => zustand({ konto, ziele: zieleZustand(daten, mehr) });

/** Konto mit Ständen beider für diese Monate (Papa + Mama = summe). */
function konto(staende) {
  const k = { v: 1, p: { papa: {}, mama: {} }, x: [] };
  for (const [monat, summe] of Object.entries(staende)) {
    k.p.papa[monat] = summe - 100_000;
    k.p.mama[monat] = 100_000;
  }
  return k;
}
const ziel = (id, mehr = {}) => ({ id, name: `Ziel ${id}`, emoji: '🎯', zielCents: 120_000, datum: '2027-09', vorlaeufig: false, erstellt: '2026-10', ...mehr });

describe('Ansicht im Konto-Tab: drei Stellungen', () => {
  test('Sparziele wird gemerkt; Unsinn bleibt Kontostand', () => {
    assert.deepEqual([...KONTO_ANSICHTEN], ['kontostand', 'fixkosten', 'sparziele']);
    const s = speicherAttrappe();
    assert.equal(kontoAnsichtSpeichern('sparziele', s), 'sparziele');
    assert.equal(kontoAnsichtLesen(s), 'sparziele');
    assert.equal(kontoAnsichtSpeichern('ziele', s), 'kontostand');
  });

  test('Sparziele neu gelesen: nur die Ansicht Sparziele wird neu gezeichnet (Kontostand-Eingabe behält die Tastatur)', () => {
    const a = { konto: { v: 1 }, ziele: { status: 'geladen' } };
    const b = { ...a, ziele: { status: 'fehler' } };
    assert.equal(nurHintergrundGeaendert(a, b, { seite: 'konto', kontoAnsicht: 'kontostand' }), true);
    assert.equal(nurHintergrundGeaendert(a, b, { seite: 'konto', kontoAnsicht: 'fixkosten' }), true);
    assert.equal(nurHintergrundGeaendert(a, b, { seite: 'konto', kontoAnsicht: 'sparziele' }), false);
    assert.equal(nurHintergrundGeaendert(a, { ...b, konto: { v: 2 } }, { seite: 'konto', kontoAnsicht: 'kontostand' }), false);
  });
});

describe('sparzieleModel: Kopf und Zielkarten (Demo)', () => {
  const v = sparVerlauf(demo.ziele, demo.konto, HEUTE);
  const m = sparzieleModel(mitDemo(), HEUTE);

  test('Kopf: zurückgelegt, nötig pro Monat, frei und Stand – alles aus sparVerlauf', () => {
    assert.equal(m.zustand, 'ok');
    assert.equal(m.gesperrt, null);
    assert.deepEqual(m.kopf, {
      zurueckgelegt: betragText(v.summeZiele),
      noetig: betragText(v.noetigGesamt),
      frei: betragText(v.frei),
      stand: `Stand: Kontostand ${monatText(v.standMonat)} (beide)`,
    });
    assert.equal(m.ohneKontostand, false);
  });

  test('nur laufende Ziele als Karten, mit Balken, Beträgen, Monaten und Status samt aria-label', () => {
    const laufend = v.ziele.filter((z) => !z.abgeschlossen);
    assert.deepEqual(m.ziele.map((k) => k.id), laufend.map((z) => z.id));
    for (const [i, k] of m.ziele.entries()) {
      const z = laufend[i];
      assert.equal(k.titel, `${z.emoji} ${z.name}`);
      assert.equal(k.offen, betragText(z.offen));
      assert.equal(k.proMonat, `${betragText(z.noetigProMonat)} / Monat`);
      assert.equal(k.monate, z.monateRest === 1 ? 'Noch 1 Monat' : `Noch ${z.monateRest} Monate`);
      const prozent = Math.floor((z.gespart / z.zielCents) * 1000) / 10;
      assert.equal(k.breite, prozent);
      assert.ok(k.stand.startsWith(`${betragText(z.gespart)} von ${betragText(z.zielCents)} · ${String(prozent).replace('.', ',')} %`));
      if (z.status === 'hinter') assert.equal(k.status.text, `⚠ ${betragText(z.plan.rueckstand)} hinter Plan`);
      assert.ok(k.beschriftung.includes(k.status.text), 'aria-label enthält den Status');
      assert.ok(k.beschriftung.includes(k.titel.split(' ').slice(1).join(' ')));
    }
  });

  test('„bis“-Text: fester Monat, vorläufig mit „ca.“, Tag als „15. Aug. 2027“', () => {
    assert.equal(zielBisText({ datum: '2028-07', vorlaeufig: false }), 'bis Juli 2028');
    assert.equal(zielBisText({ datum: '2027-07', vorlaeufig: true }), 'bis ca. Juli 2027 · vorläufig');
    assert.equal(zielBisText({ datum: '2027-08-15', vorlaeufig: false }), 'bis 15. Aug. 2027');
    const urlaub = m.ziele.find((k) => k.vorlaeufig);
    assert.match(urlaub.bis, /^bis ca\. .* · vorläufig$/);
    assert.ok(urlaub.hinweis.includes('vorläufig'));
  });

  test('Frei verfügbar: Betrag aus der Domäne; verschiebbar zu laufenden Zielen mit offenem Betrag', () => {
    assert.equal(m.frei.betrag, betragText(v.frei));
    assert.equal(m.frei.kannVerschieben, v.frei > 0);
    assert.deepEqual(m.frei.ziele.map((z) => z.id), ['demo0001', 'demo0002']);
  });
});

describe('sparzieleModel: Verlauf pro Monat', () => {
  test('jeder Monat: Kopfbetrag = gespart und Σ Aufteilungszeilen = gespart (auf den Cent)', () => {
    const v = sparVerlauf(demo.ziele, demo.konto, HEUTE);
    const m = sparzieleModel(mitDemo(), HEUTE);
    assert.deepEqual(m.verlauf.map((x) => x.monat), v.monate.map((x) => x.monat));
    for (const [i, monat] of m.verlauf.entries()) {
      const d = v.monate[i];
      assert.equal(monat.titel, monatText(d.monat));
      if (d.gespart === null) continue;
      assert.equal(monat.gespartCents, d.gespart);
      assert.equal(monat.betrag, deltaText(d.gespart));
      assert.equal(monat.teile.reduce((s, z) => s + z.cents, 0), d.gespart, d.monat);
    }
  });

  test('Plus mit weniger als nötig → anteilig mit Erklärung; mehr als nötig → „nötig“ je Ziel und Rest zu Frei', () => {
    const daten = { v: 1, beginn: '2026-10', z: [ziel('aaaa0001', { zielCents: 1_200_000, datum: '2027-09' })], m: [] };
    // Basis September, Oktober +500 € (nötig 1.000 €) → anteilig; November +20.000 € → nötig, Rest zu Frei
    const k = konto({ '2026-09': 1_000_000, '2026-10': 1_050_000, '2026-11': 3_050_000 });
    const m = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(daten) }), '2026-11-30');
    const [nov, okt] = m.verlauf;
    assert.equal(okt.hinweis, `Weniger als nötig (${betragText(100_000)}) → anteilig nach Bedarf aufgeteilt.`);
    assert.deepEqual(okt.teile.map((t) => t.text), ['🎯 Ziel aaaa0001']);
    assert.equal(nov.hinweis, null);
    assert.match(nov.teile[0].text, /^🎯 Ziel aaaa0001 \(nötig .+\)$/);
    assert.equal(nov.teile.at(-1).text, '💜 Frei verfügbar (Rest)');
    assert.equal(nov.teile.reduce((s, z) => s + z.cents, 0), 2_000_000);
  });

  test('Minus: zuerst aus Frei („(leer)“ wenn nichts da), dann anteilig aus den Zielen', () => {
    const daten = { v: 1, beginn: '2026-10', z: [ziel('aaaa0001')], m: [] };
    // Oktober +50 € (alles zum Ziel, Frei bleibt leer), November −200 €: Frei leer, das Ziel verliert seine 50 €, der Rest verfällt
    const k = konto({ '2026-09': 1_000_000, '2026-10': 1_005_000, '2026-11': 985_000 });
    const m = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(daten) }), '2026-11-30');
    const nov = m.verlauf[0];
    assert.equal(nov.art, 'minus');
    assert.equal(nov.teile[0].text, '💜 Frei verfügbar zuerst');
    assert.equal(nov.teile[0].betrag, '−0 € (leer)');
    assert.deepEqual(nov.teile.slice(1).map((t) => [t.text, t.cents]), [['🎯 Ziel aaaa0001 (anteilig)', -5_000], ['Rest nicht gedeckt (Ziele schon leer)', -15_000]]);
    assert.equal(nov.teile.reduce((s, z) => s + z.cents, 0), -20_000);
  });

  test('abgeschlossene Ziele: neueste zuerst, ausgeblendete nur auf Wunsch (mit Zahl), löschbar nur ohne Geld', () => {
    const daten = {
      ...demo.ziele,
      z: [...demo.ziele.z, { id: 'leer0001', name: 'Versehen', emoji: '🎁', zielCents: 10_000, datum: '2026-09', vorlaeufig: false, erstellt: '2026-10' }],
    };
    const m = sparzieleModel(mitDemo({}, demo.konto, daten), HEUTE);
    // „Versehen“ schloss im Oktober (nach seinem Zieldatum), ohne je Geld zu bekommen → löschbar; das Sofa hat Geld bekommen → nur ausblenden
    assert.deepEqual(m.abgeschlossen.map((a) => [a.id, a.loeschbar, a.aus]), [['leer0001', true, false], ['demo0003', false, false]]);
    assert.match(m.abgeschlossen[1].text, /^Nach dem Zieldatum abgeschlossen im September 2026 · .+ ausgegeben$/);
    const aus = { ...demo.ziele, z: demo.ziele.z.map((z) => (z.id === 'demo0003' ? { ...z, aus: true } : z)) };
    const versteckt = sparzieleModel(mitDemo({}, demo.konto, aus), HEUTE);
    assert.deepEqual(versteckt.abgeschlossen, []);
    assert.equal(versteckt.ausgeblendet, 1);
    const gezeigt = sparzieleModel(mitDemo({}, demo.konto, aus), HEUTE, { ausgeblendeteZeigen: true });
    assert.deepEqual(gezeigt.abgeschlossen.map((a) => [a.id, a.aus]), [['demo0003', true]]);
  });
});

describe('sparzieleModel: Zustände', () => {
  test('noch kein Kontostand von beiden → Hinweis „Sobald ihr beide …“; neue Ziele „neu – ab <Monat> dabei“', () => {
    const daten = { v: 1, beginn: '2026-10', z: [ziel('aaaa0001')], m: [] };
    const m = sparzieleModel(zustand({ ziele: zieleZustand(daten) }), HEUTE);
    assert.equal(m.ohneKontostand, true);
    assert.equal(m.kopf.stand, 'Stand: noch kein Kontostand von beiden');
    assert.equal(m.ziele[0].status.text, '✓ neu – ab Oktober 2026 dabei');
    assert.equal(m.ziele[0].status.art, 'neu');
  });

  test('keine Ziele → leer', () => {
    const m = sparzieleModel(zustand({ ziele: zieleZustand({ v: 1, z: [], m: [] }) }), HEUTE);
    assert.equal(m.leer, true);
    assert.deepEqual(m.ziele, []);
    assert.equal(m.frei.kannVerschieben, false);
  });

  test('Lesefehler: alter Stand bleibt sichtbar, gesperrt mit Meldung und „Nochmal versuchen“', () => {
    const m = sparzieleModel(mitDemo({ status: 'fehler', warnungen: [TEXT_ZIELE_NICHT_GELADEN] }), HEUTE);
    assert.equal(m.zustand, 'ok');
    assert.equal(m.nichtGeladen, TEXT_ZIELE_NICHT_GELADEN);
    assert.equal(m.gesperrt, TEXT_ZIELE_NICHT_GELADEN);
    assert.deepEqual(m.warnungen, []);
    assert.equal(m.ziele.length, 2);
    assert.equal(m.frei.kannVerschieben, false);
  });

  test('unlesbar: klare Meldung, gesperrt; nie gelesen: „nicht geladen“', () => {
    const u = sparzieleModel(mitDemo({ unlesbar: true, warnungen: ['x'] }, demo.konto, { v: 1, z: [], m: [] }), HEUTE);
    assert.equal(u.unlesbar, TEXT_ZIELE_GESPERRT);
    assert.equal(u.gesperrt, TEXT_ZIELE_GESPERRT);
    assert.deepEqual(u.warnungen, []);
    const n = sparzieleModel(mitDemo({ status: null }), HEUTE);
    assert.equal(n.zustand, 'nichtGeladen');
    assert.equal(n.gesperrt, TEXT_ZIELE_NICHT_GELADEN);
  });

  test('Warnungen (fremde Einträge) werden gezeigt', () => {
    const m = sparzieleModel(mitDemo({ warnungen: ['1 Sparziel konnte nicht gelesen werden'] }), HEUTE);
    assert.deepEqual(m.warnungen, ['1 Sparziel konnte nicht gelesen werden']);
  });
});

describe('Formular: Entwurf, Prüfung, Bedarf pro Monat', () => {
  test('neuer Entwurf: leer, 🎯, Datum fest, ein Jahr später; vorhandenes Ziel wird übernommen', () => {
    assert.deepEqual(zielEntwurf(null, HEUTE), { id: null, name: '', emoji: '🎯', art: 'fest', betrag: '', monat: '10', jahr: '2027', tag: '' });
    assert.deepEqual(zielEntwurf(ziel('aaaa0001', { datum: '2027-08-15', vorlaeufig: true, zielCents: 150_050 }), HEUTE), { id: 'aaaa0001', name: 'Ziel aaaa0001', emoji: '🎯', art: 'vorlaeufig', betrag: '1.500,50', monat: '08', jahr: '2027', tag: '15', erstellt: '2026-10' });
  });

  test('Entwurf → Ziel (Monat oder Tag); Fehler deutsch', () => {
    const e = { ...zielEntwurf(null, HEUTE), name: ' Neues Rad ', betrag: '1.200', monat: '06', jahr: '2027' };
    assert.deepEqual(entwurfZuZiel(e, HEUTE), { ziel: { name: 'Neues Rad', emoji: '🎯', zielCents: 120_000, datum: '2027-06', vorlaeufig: false }, fehler: null });
    assert.equal(entwurfZuZiel({ ...e, tag: '31' }, HEUTE).fehler, 'Bitte angeben, bis wann gespart wird.');
    assert.equal(entwurfZuZiel({ ...e, tag: '30', art: 'vorlaeufig' }, HEUTE).ziel.datum, '2027-06-30');
    assert.equal(entwurfZuZiel({ ...e, tag: '30', art: 'vorlaeufig' }, HEUTE).ziel.vorlaeufig, true);
    assert.equal(entwurfZuZiel({ ...e, betrag: 'abc' }, HEUTE).fehler, 'Bitte einen Zielbetrag zwischen 1 € und 999.999 € eingeben.');
    assert.equal(entwurfZuZiel({ ...e, name: '' }, HEUTE).fehler, 'Bitte einen Namen eingeben.');
    assert.match(entwurfZuZiel({ ...e, jahr: '2026', monat: '09' }, HEUTE).fehler, /Vergangenheit/);
    assert.equal(entwurfZuZiel({ ...e, id: 'aaaa0001' }, HEUTE).ziel.id, 'aaaa0001');
  });

  test('Bedarf: ab dem Startmonat (Kontostand des Monats fehlt → dieser Monat; komplett → nächster) bis zum Zielmonat', () => {
    const e = { ...zielEntwurf(null, HEUTE), name: 'Rad', betrag: '12.000', monat: '09', jahr: '2028' };
    const ohne = bedarfVorschau(e, { daten: { v: 1, z: [], m: [] }, konto: konto({}), heute: HEUTE });
    assert.deepEqual(ohne, { ab: 'Oktober 2026', monate: '24 Monate', proMonat: `${betragText(50_000)} pro Monat` });
    const komplett = bedarfVorschau(e, { daten: { v: 1, z: [], m: [] }, konto: konto({ '2026-10': 500_000 }), heute: HEUTE });
    assert.deepEqual(komplett, { ab: 'November 2026', monate: '23 Monate', proMonat: `${betragText(Math.ceil(1_200_000 / 23))} pro Monat` });
    assert.equal(bedarfVorschau({ ...e, betrag: '' }, { daten: { v: 1, z: [], m: [] }, konto: konto({}), heute: HEUTE }), null);
  });

  test('Bedarf beim Ändern: mit dem schon Gesparten des Ziels (Domäne)', () => {
    const original = demo.ziele.z[0];
    const e = { ...zielEntwurf(original, HEUTE) };
    const v = sparVerlauf(demo.ziele, demo.konto, HEUTE).ziele[0];
    const b = bedarfVorschau(e, { daten: demo.ziele, konto: demo.konto, heute: HEUTE });
    assert.equal(b.proMonat, `${betragText(v.noetigProMonat)} pro Monat`);
    assert.equal(b.monate, `${v.monateRest} Monate`);
  });

  test('Symbole: zu jedem Emoji ein Name; das Kind heißt wie in den Einstellungen', () => {
    assert.equal(SYMBOL_NAMEN.length, ZIEL_EMOJIS.length);
    const m = sparzieleModel(zustand({ settings: { kindname: 'Kiki' }, ziele: zieleZustand({ v: 1, z: [], m: [] }) }), HEUTE);
    assert.equal(m.symbole.find((s) => s.emoji === '👧').name, 'Für Kiki');
    const ohne = sparzieleModel(zustand({ ziele: zieleZustand({ v: 1, z: [], m: [] }) }), HEUTE);
    assert.equal(ohne.symbole.find((s) => s.emoji === '👧').name, 'Für Kind');
  });
});
