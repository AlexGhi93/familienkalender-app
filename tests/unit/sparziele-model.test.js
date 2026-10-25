// View-Modell der Seite „Sparziele“ im Konto-Tab (ohne DOM): Kopf, Zielkarten mit Stand und Status, „Frei verfügbar“, Verlauf pro Monat
// (Summe stimmt), abgeschlossene Ziele (Ausblenden), Sperren (unlesbar / nicht geladen), Formular-Entwurf und Bedarf pro Monat.
// Alle erwarteten Zahlen kommen aus der Domäne (sparVerlauf) oder aus kleinen, hier erfundenen Beispielen – nie aus der Machette.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bedarfVorschau, entwurfZuZiel, monatText, sparzieleModel, zielEntwurf, zielBisText, verschiebungFrage, zielLoeschFrage, zieleSperre, zielSymbole, SYMBOL_NAMEN } from '../../src/app/views/sparziele-model.js';
import { KONTO_ANSICHTEN, kontoAnsichtLesen, kontoAnsichtSpeichern } from '../../src/app/views/fixkosten-model.js';
import { nurHintergrundGeaendert } from '../../src/app/hintergrund.js';
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, ZIEL_EMOJIS, sparVerlauf, zielLoeschen } from '../../src/domain/sparziele.js';
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
    assert.equal(entwurfZuZiel({ ...e, tag: '31' }, HEUTE).fehler, 'Den 31. gibt es im Juni 2027 nicht.', 'unmöglicher Tag: klare Meldung mit Monat');
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

describe('Task 3, Fix-Runde 1 (m-1, m-5, m-7)', () => {
  const leer = { v: 1, z: [], m: [] };
  test('m-1: am Monatsletzten (Kontostand beider schon da) beginnt ein neues Ziel nächsten Monat: Zieldatum in diesem Monat → Fehler schon in der Vorschau', () => {
    const k = konto({ '2026-09': 500_000, '2026-10': 600_000 });
    const e = { ...zielEntwurf(null, '2026-10-31'), name: 'Rad', betrag: '1.000', monat: '10', jahr: '2026' };
    const v = bedarfVorschau(e, { daten: leer, konto: k, heute: '2026-10-31' });
    assert.deepEqual(v, { fehler: 'Das Zieldatum liegt vor dem ersten Sparmonat – bitte einen späteren Monat wählen.' });
    assert.equal(entwurfZuZiel(e, '2026-10-31', { konto: k }).fehler, v.fehler);
    const nov = bedarfVorschau({ ...e, monat: '11' }, { daten: leer, konto: k, heute: '2026-10-31' });
    assert.deepEqual(nov, { ab: 'November 2026', monate: '1 Monat', proMonat: `${betragText(100_000)} pro Monat` });
  });

  test('m-1: ungültiger Betrag → Fehler in der Vorschau; leerer Betrag → noch nichts', () => {
    const e = { ...zielEntwurf(null, HEUTE), name: '', betrag: 'abc', monat: '09', jahr: '2027' };
    assert.deepEqual(bedarfVorschau(e, { daten: leer, konto: konto({}), heute: HEUTE }), { fehler: 'Bitte einen Zielbetrag zwischen 1 € und 999.999 € eingeben.' });
    assert.equal(bedarfVorschau({ ...e, betrag: ' ' }, { daten: leer, konto: konto({}), heute: HEUTE }), null);
  });

  test('m-1: „Ab“ beim Ändern = Monat nach dem letzten Kontostand (aus der Rechnung)', () => {
    const b = bedarfVorschau(zielEntwurf(demo.ziele.z[0], HEUTE), { daten: demo.ziele, konto: demo.konto, heute: HEUTE });
    assert.equal(b.ab, monatText(sparVerlauf(demo.ziele, demo.konto, HEUTE).ziele[0].ab));
    assert.equal(b.ab, 'Oktober 2026');
  });

  test('m-5: „Frei“-Ziele tragen einen Titel (ohne „offen“) für die Meldung', () => {
    const m = sparzieleModel(mitDemo(), HEUTE);
    assert.deepEqual(m.frei.ziele.map((z) => z.titel), ['🚗 Auto', '🏖️ Sommerurlaub']);
  });

  test('m-7: Sperre und Symbole ohne das ganze Modell', () => {
    assert.equal(zieleSperre({ status: 'geladen', unlesbar: false }), null);
    assert.equal(zieleSperre({ status: 'gespeichert', unlesbar: false }), null);
    assert.equal(zieleSperre({ status: 'fehler', unlesbar: false }), TEXT_ZIELE_NICHT_GELADEN);
    assert.equal(zieleSperre({ status: 'geladen', unlesbar: true }), TEXT_ZIELE_GESPERRT);
    assert.deepEqual(zielSymbole({ kindname: 'Kiki' }), sparzieleModel(zustand({ settings: { kindname: 'Kiki' }, ziele: zieleZustand(leer) }), HEUTE).symbole);
  });
});

describe('sparzieleModel: Ausgleich, wieder öffnen, vorläufiges Datum', () => {
  // Auto 23.000 € bis 07.2028, Urlaub 1.500 € bis 07.2027 (ab 02.2027); +2.000 € Februar–Juni, Juli +500 € (Urlaub bezahlt)
  const k = konto({ '2027-01': 1_800_000, '2027-02': 2_000_000, '2027-03': 2_200_000, '2027-04': 2_400_000, '2027-05': 2_600_000, '2027-06': 2_800_000, '2027-07': 2_850_000 });
  const autoZ = ziel('auto0001', { name: 'Auto', emoji: '🚗', zielCents: 2_300_000, datum: '2028-07', erstellt: '2027-02' });
  const urlaubZ = (mehr = {}) => ziel('url00001', { name: 'Urlaub', emoji: '🏖️', zielCents: 150_000, datum: '2027-07', erstellt: '2027-02', ...mehr });

  test('„… bezahlt (aus dem Ziel)“ mit −Betrag: die Zeilen ergeben weiter genau „gespart“; zurückgelegt + Frei = 10.500 €', () => {
    const daten = { v: 1, beginn: '2027-02', z: [autoZ, urlaubZ({ beendet: { monat: '2027-07', art: 'ausgegeben' } })], m: [] };
    const v = sparVerlauf(daten, k, '2027-07-31');
    const m = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(daten) }), '2027-07-31');
    const jul = m.verlauf[0];
    const d = v.monate[0];
    assert.equal(jul.monat, '2027-07');
    assert.equal(jul.teile[0].text, '🏖️ Urlaub bezahlt (aus dem Ziel)');
    assert.equal(jul.teile[0].cents, -d.ausgleich);
    assert.equal(jul.teile.reduce((s2, z) => s2 + z.cents, 0), 50_000);
    assert.match(jul.ausgleich, /^Ausgleich: /);
    assert.equal(v.summeZiele + v.frei, 1_050_000);
    for (const [i, monat] of m.verlauf.entries()) if (v.monate[i].gespart !== null) assert.equal(monat.teile.reduce((s2, z) => s2 + z.cents, 0), v.monate[i].gespart, monat.monat);
  });

  test('Ausgleich in einem Monat ohne Ersparnis (gespart = −Ausgleich): nur die Zeile „bezahlt“, Summe stimmt', () => {
    const k2 = konto({ '2027-01': 1_800_000, '2027-02': 2_000_000, '2027-03': 1_900_000 });
    const daten = { v: 1, beginn: '2027-02', z: [urlaubZ({ zielCents: 100_000, datum: '2027-02' })], m: [] };
    const m = sparzieleModel(zustand({ konto: k2, ziele: zieleZustand(daten) }), '2027-03-31');
    const mar = m.verlauf[0];
    assert.equal(mar.gespartCents, -100_000);
    assert.deepEqual(mar.teile.map((t) => [t.text, t.cents]), [['🏖️ Urlaub bezahlt (aus dem Ziel)', -100_000]]);
    assert.equal(mar.keineVeraenderung, false);
  });

  test('abgeschlossen: nur automatisch abgeschlossene lassen sich ändern (wieder öffnen) und doch zurück zu Frei geben', () => {
    const daten = { v: 1, beginn: '2027-02', z: [autoZ, urlaubZ(), urlaubZ({ id: 'url00002', name: 'Fest', beendet: { monat: '2027-07', art: 'ausgegeben' } })], m: [] };
    const m = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(daten) }), '2027-08-05');
    const auto = m.abgeschlossen.find((a) => a.id === 'url00001');
    const hand = m.abgeschlossen.find((a) => a.id === 'url00002');
    assert.equal(auto.automatisch, true);
    assert.equal(auto.kannAendern, true);
    assert.equal(auto.kannZurueckZuFrei, true);
    assert.equal(hand.kannAendern, false);
    assert.equal(hand.kannZurueckZuFrei, false);
    const gesperrt = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(daten, { unlesbar: true }) }), '2027-08-05');
    assert.ok(gesperrt.abgeschlossen.every((a) => !a.kannAendern && !a.kannZurueckZuFrei));
  });

  test('vorläufiges Datum im Zielmonat: „schließt am 1. … – Datum verschoben? ✎ ändern“', () => {
    const daten = { v: 1, beginn: '2027-02', z: [autoZ, urlaubZ({ vorlaeufig: true })], m: [] };
    const juni = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(daten) }), '2027-06-15');
    assert.equal(juni.ziele[1].hinweis, 'Datum noch vorläufig (✎ ändern, sobald es fix ist)');
    const juli = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(daten) }), '2027-07-15');
    assert.equal(juli.ziele[1].hinweis, 'schließt am 1. August 2027 – Datum verschoben? ✎ ändern');
    assert.equal(juli.ziele[0].hinweis, null);
  });
});

describe('1.1.1: Löschen-Rückfrage und „Rückgängig“ für Verschiebungen', () => {
  const k = konto({ '2026-09': 800_000, '2026-10': 900_000 }); // Oktober +1.000 €
  const heute = '2026-11-05';

  test('zielLoeschFrage: laufend mit Geld → sagt, dass das Geld zu Frei geht (Betrag aus der Domäne); laufend ohne Geld; abgeschlossen ohne Geld; sonst null', () => {
    const d = { v: 1, z: [ziel('aaaa0001'), ziel('bbbb0001', { erstellt: '2026-12' }), ziel('cccc0001', { datum: '2026-09', erstellt: '2026-09' })], m: [] };
    const s = zustand({ konto: k, ziele: zieleZustand(d) });
    const gespart = sparVerlauf(d, k, heute).ziele[0].gespart;
    assert.ok(gespart > 0);
    assert.deepEqual(zielLoeschFrage(s, heute, 'aaaa0001'), {
      titel: 'Sparziel löschen?',
      text: `„Ziel aaaa0001“ wird gelöscht. Das bisher zugeteilte Geld (${betragText(gespart)}) geht zu „Frei verfügbar“ – von dort kannst du es einem anderen Ziel geben.`,
      ja: 'Löschen',
      knopf: 'Löschen',
    });
    assert.deepEqual(zielLoeschFrage(s, heute, 'bbbb0001'), { titel: 'Sparziel löschen?', text: '„Ziel bbbb0001“ hat noch kein Geld bekommen und wird gelöscht.', ja: 'Löschen', knopf: 'Löschen' });
    assert.deepEqual(zielLoeschFrage(s, heute, 'cccc0001'), { titel: 'Endgültig löschen?', text: '„Ziel cccc0001“ hat nie Geld bekommen und wird endgültig gelöscht.', ja: 'Endgültig löschen', knopf: 'Endgültig löschen' });
    // abgeschlossen mit Geld → nicht löschbar
    const fertig = { v: 1, z: [ziel('aaaa0001', { beendet: { monat: '2026-11', art: 'ausgegeben' } })], m: [] };
    assert.equal(zielLoeschFrage(zustand({ konto: k, ziele: zieleZustand(fertig) }), heute, 'aaaa0001'), null);
    assert.equal(zielLoeschFrage(s, heute, 'gibtsnix'), null);
  });

  test('Verlauf: jede Verschiebung trägt Kennung und – nur zu einem laufenden Ziel, nicht gesperrt – „Rückgängig“ (nur laufender Monat)', () => {
    const d = {
      v: 1,
      z: [ziel('aaaa0001'), ziel('bbbb0001', { beendet: { monat: '2026-11', art: 'frei' } })],
      m: [
        { id: 'v0000001', monat: '2026-11', ziel: 'aaaa0001', cents: 5000 },
        { id: 'v0000002', monat: '2026-11', ziel: 'bbbb0001', cents: 3000 },
        { id: 'v0000003', monat: '2026-10', ziel: 'aaaa0001', cents: 2000 },
      ],
    };
    const m = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(d) }), heute);
    const [a, b] = m.verlauf.find((x) => x.monat === '2026-11').verschoben;
    assert.equal(a.id, 'v0000001');
    assert.equal(a.rueckgaengig, true);
    assert.equal(b.id, 'v0000002');
    assert.equal(b.rueckgaengig, false, 'Ziel abgeschlossen');
    const [alt] = m.verlauf.find((x) => x.monat === '2026-10').verschoben;
    assert.equal(alt.id, 'v0000003');
    assert.equal(alt.rueckgaengig, false, 'aus einem früheren Monat: bleibt fest');
    const gesperrt = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(d, { status: 'fehler' }) }), heute);
    assert.equal(gesperrt.verlauf.find((x) => x.monat === '2026-11').verschoben[0].rueckgaengig, false, 'gesperrt');
  });

  test('verschiebungFrage (I2, N1): Wirkung aus einer Probe-Rechnung – nur für Verschiebungen des laufenden Monats', () => {
    // 12.000 € bis Dezember 2026, je +2.000 € ab Januar; 500 € im Januar aus Frei verschoben, Rückgängig am 20.04.
    const k2 = konto({ '2025-12': 1_000_000, '2026-01': 1_200_000, '2026-02': 1_400_000, '2026-03': 1_600_000 });
    const d = { v: 1, z: [ziel('aaaa0001', { zielCents: 1_200_000, datum: '2026-12', erstellt: '2026-01' })], m: [{ id: 'v0000001', monat: '2026-01', ziel: 'aaaa0001', cents: 50_000 }] };
    const h = '2026-04-20';
    const s = zustand({ konto: k2, ziele: zieleZustand(d) });
    assert.equal(verschiebungFrage(s, h, 'v0000001'), null, 'eine Verschiebung aus dem Januar bleibt fest');
    // im laufenden Monat (noch kein Kontostand) wirkt sie genau mit ihrem Betrag
    const jetzt = { ...d, m: [{ id: 'v0000002', monat: '2026-04', ziel: 'aaaa0001', cents: 10_000 }] };
    assert.equal(verschiebungFrage(zustand({ konto: k2, ziele: zieleZustand(jetzt) }), h, 'v0000002'), `„Frei verfügbar“ steigt dadurch um ${betragText(10_000)}; „Ziel aaaa0001“ hat danach ${betragText(10_000)} weniger.`);
    assert.equal(verschiebungFrage(s, h, 'gibtsnix'), null);
    // am Monatsletzten mit schon eingetragenem Kontostand: die Probe-Rechnung stimmt ebenso (Frei und Ziel genau um den Betrag)
    const k3 = konto({ '2025-12': 1_000_000, '2026-01': 1_200_000, '2026-02': 1_400_000, '2026-03': 1_600_000, '2026-04': 1_800_000 });
    const s3 = zustand({ konto: k3, ziele: zieleZustand(jetzt) });
    const vorher = sparVerlauf(jetzt, k3, '2026-04-30');
    const nachher = sparVerlauf({ ...jetzt, m: [] }, k3, '2026-04-30');
    assert.equal(nachher.frei - vorher.frei, 10_000);
    assert.equal(verschiebungFrage(s3, '2026-04-30', 'v0000002'), `„Frei verfügbar“ steigt dadurch um ${betragText(10_000)}; „Ziel aaaa0001“ hat danach ${betragText(10_000)} weniger.`);
  });

  test('zielLoeschFrage (N2): am Monatsletzten mit eingetragenem Kontostand nennt sie die tatsächliche Wirkung aus einer Probe-Rechnung', () => {
    // A und B je 3.000 € bis Dezember, ab September; September +1.000 €, Oktober +500 € (anteilig); gelöscht wird A am 31.10.
    const k4 = konto({ '2026-08': 800_000, '2026-09': 900_000, '2026-10': 950_000 });
    const d = { v: 1, z: [ziel('aaaa0001', { zielCents: 300_000, datum: '2026-12', erstellt: '2026-09' }), ziel('bbbb0001', { zielCents: 300_000, datum: '2026-12', erstellt: '2026-09' })], m: [] };
    const h = '2026-10-31';
    const vorher = sparVerlauf(d, k4, h);
    const nachher = sparVerlauf(zielLoeschen(d, 'aaaa0001', { heute: h, konto: k4 }), k4, h);
    const frei = nachher.frei - vorher.frei;
    const andere = nachher.ziele[1].gespart - vorher.ziele[1].gespart;
    const gespart = vorher.ziele[0].gespart;
    assert.ok(frei !== gespart && andere > 0, `der Oktober-Anteil wird neu verteilt (gespart ${gespart}, Frei +${frei}, B +${andere})`);
    assert.equal(frei + andere, gespart, 'nichts verloren');
    const f = zielLoeschFrage(zustand({ konto: k4, ziele: zieleZustand(d) }), h, 'aaaa0001');
    assert.equal(f.text, `„Ziel aaaa0001“ wird gelöscht. „Frei verfügbar“ steigt dadurch um ${betragText(frei)}, die anderen Ziele bekommen zusammen ${betragText(andere)} (der Anteil dieses Monats wird neu verteilt) – von „Frei“ kannst du es einem anderen Ziel geben.`);
    assert.ok(!f.text.includes(`(${betragText(gespart)})`), 'nicht den Nennbetrag');
  });

  test('ein „gelöscht“ abgeschlossenes Ziel: keine Karte, nicht unter „Abgeschlossene“, nicht mitgezählt; im Monat eine Zeile „🗑️ … gelöscht“', () => {
    const d = { v: 1, z: [ziel('aaaa0001'), ziel('bbbb0001', { beendet: { monat: '2026-11', art: 'frei' }, geloescht: true, aus: undefined })], m: [] };
    const v = sparVerlauf(d, k, heute);
    const gespart = v.ziele[1].gespart;
    assert.ok(gespart > 0);
    for (const zeigen of [false, true]) {
      const m = sparzieleModel(zustand({ konto: k, ziele: zieleZustand(d) }), heute, { ausgeblendeteZeigen: zeigen });
      assert.deepEqual(m.ziele.map((z) => z.id), ['aaaa0001']);
      assert.deepEqual(m.abgeschlossen, []);
      assert.equal(m.ausgeblendet, 0);
      const nov = m.verlauf.find((x) => x.monat === '2026-11');
      assert.deepEqual(nov.abschluesse, [{ text: `🗑️ Ziel bbbb0001 gelöscht – ${betragText(gespart)} zurück zu „Frei“`, cents: gespart, betrag: `+${betragText(gespart)} → Frei` }]);
    }
    // nur noch „gelöschte“ Ziele: die Seite gilt als leer (Hinweis „Noch keine Sparziele“)
    const nurGeloescht = { ...d, z: [d.z[1]] };
    assert.equal(sparzieleModel(zustand({ konto: k, ziele: zieleZustand(nurGeloescht) }), heute).leer, true);
  });
});
