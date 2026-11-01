// Autos (Task 3): Push-Erinnerungen 30 und 7 Tage vor dem Termin um 09:00 (Wien) an beide Telefone, einmal „überfällig“, die Karte
// „🚗 Auto“ auf Heute und das Neuzeichnen nach einem Lesen im Hintergrund. Erfundene Autos, keine echten Daten.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planeErinnerungen, planQuellen, quellenGeaendert } from '../../src/push/plan.js';
import { autoKarteModel } from '../../src/app/views/autos-faellig.js';
import { heuteModel } from '../../src/app/views/heute-model.js';
import { nurHintergrundGeaendert } from '../../src/app/hintergrund.js';
import { createStore } from '../../src/app/store.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { autoAnlegen, autoAusVorlage, autosText, leereAutos } from '../../src/domain/autos.js';
import { seedDemo } from '../../src/app/seed.js';
import { apiAttrappe, zustand } from './hilfen.js';

const A = 'auto0001'; // neu gekauft (EZ 10.01.2026)
const B = 'auto0002'; // Gebrauchtwagen
const autoA = { id: A, name: 'Testauto', neuGekauft: true, ezDatum: '2026-01-10' };
const autoB = { id: B, name: 'Zweitauto', neuGekauft: false, ezDatum: '2015-05-05' };
const r = (id, auto, felder) => ({ id, auto, aktiv: true, ...felder });
const VIGNETTE = r('regvig01', A, { typ: 'vignette', name: 'Vignette' });
// Ölwechsel alle 15.000 km ab dem letzten (234 km) → bei 15.234 km; mit 400 km in 9 Tagen (44,4 km/Tag) ab 10.10. etwa am 13.12.2026
const OEL = r('regoel01', A, { typ: 'oelwechsel', name: 'Ölwechsel', intervallKm: 15000 });
const historieA = (mehr = []) => ({
  2026: {
    v: 1,
    auto: A,
    jahr: 2026,
    arbeiten: [{ id: 'arboel01', auto: A, typ: 'oelwechsel', datum: '2026-01-20', km: 234, details: {} }, ...mehr],
    km: [
      { datum: '2026-10-01', km: 12000 },
      { datum: '2026-10-10', km: 12400 },
    ],
  },
});

/** state.autos wie im Store: frisch gelesen (Standard), mit den angegebenen Autos, Regeln, Sätzen und Verlauf-Teilen. */
function autosTeil({ autos = [autoA], regeln = [VIGNETTE, OEL], saetze = [], historie = { [A]: historieA() }, frisch = true, ...mehr } = {}) {
  return { daten: { v: 1, autos, regeln, saetze, jahre: {} }, historie, status: frisch ? 'geladen' : 'gespeichert', warnungen: [], unlesbar: { shards: [] }, frisch, ...mehr };
}
const mitAutos = (teil, extra = {}) => zustand({ settings: { kontoErinnerung: '' }, autos: teil, ...extra });
const plane = (state, iso) => planeErinnerungen(state, { jetzt: new Date(iso) });
const autoPlan = async (state, iso) => (await plane(state, iso)).filter((p) => p.titel.startsWith('🚗'));
const kurz = (plan) => plan.map((p) => [new Date(p.um).toISOString(), p.titel, p.text]);

/** Feste Zufallsfolge (für Kennungen aus den Vorlagen). */
function folge(start) {
  let x = start;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('Auto-Erinnerungen im Push-Plan', () => {
  test('Vignette 2027: 30 und 7 Tage vor dem 13.01.2027 (online gekauft gilt sie erst ab dem 18. Tag) um 09:00, an beide Telefone', async () => {
    const plan = (await autoPlan(mitAutos(autosTeil({ regeln: [VIGNETTE] })), '2026-12-01T08:00:00+01:00'));
    assert.deepEqual(kurz(plan), [
      ['2026-12-14T08:00:00.000Z', '🚗 Testauto: Vignette', 'Vignette 2027 kaufen – online bis 13.01., im Geschäft bis 31.01.'],
      ['2027-01-06T08:00:00.000Z', '🚗 Testauto: Vignette', 'Vignette 2027 kaufen – online bis 13.01., im Geschäft bis 31.01.'],
    ]);
    for (const p of plan) {
      assert.equal('nur' in p, false);
      assert.equal(p.ziel, `#/autos/${A}`);
      assert.equal(p.ttl, 21600);
      assert.ok(/^[A-Za-z0-9_-]{22}$/.test(p.id));
    }
    assert.deepEqual(plan.map((p) => p.art), ['auto30', 'auto7']);
  });

  test('Vignette über den Jahreswechsel (Review Focus 5): dieselben Kennungen im Dezember und im Januar, keine doppelten; gekauft → keine', async () => {
    const state = mitAutos(autosTeil({ regeln: [VIGNETTE] }));
    const dez = await autoPlan(state, '2026-12-01T08:00:00+01:00');
    const jan = await autoPlan(state, '2027-01-02T08:00:00+01:00');
    assert.deepEqual(jan.map((p) => [p.id, p.um]), [[dez[1].id, dez[1].um]]);
    assert.notEqual(dez[0].id, dez[1].id);
    // nach dem 13.01. überfällig: EINE Erinnerung am nächsten Tag um 09:00 (online ist es zu spät, im Geschäft geht es noch)
    const spaet = await autoPlan(state, '2027-01-20T10:00:00+01:00');
    assert.deepEqual(kurz(spaet), [['2027-01-21T08:00:00.000Z', '🚗 Testauto: Vignette', 'Vignette 2027 kaufen – im Geschäft bis 31.01.']]);
    assert.equal(spaet[0].art, 'autoUeber');
    // ab Februar die Vignette 2028: nichts im Fenster
    assert.deepEqual(await autoPlan(state, '2027-02-01T08:00:00+01:00'), []);
    // schon gekauft (Vignette 2027 eingetragen) → die nächste ist 2028
    const gekauft = mitAutos(autosTeil({ regeln: [VIGNETTE], historie: { [A]: historieA([{ id: 'arbvig01', auto: A, typ: 'vignette', datum: '2026-12-03', details: { jahr: 2027 } }]) } }));
    assert.deepEqual(await autoPlan(gekauft, '2026-12-05T08:00:00+01:00'), []);
  });

  test('km-Regel mit geschätztem Termin: Erinnerungen 30 und 7 Tage vor dem geschätzten Datum, Text „bei ca. … km (etwa …)“', async () => {
    const plan = await autoPlan(mitAutos(autosTeil({ regeln: [OEL] })), '2026-10-14T08:00:00+02:00');
    assert.deepEqual(kurz(plan), [
      ['2026-11-13T08:00:00.000Z', '🚗 Testauto: Ölwechsel', 'bei ca. 15.200 km (etwa 13.12.2026)'],
      ['2026-12-06T08:00:00.000Z', '🚗 Testauto: Ölwechsel', 'bei ca. 15.200 km (etwa 13.12.2026)'],
    ]);
  });

  test('überfällig, wenn der Plan entsteht: genau eine Erinnerung am nächsten Tag um 09:00, „überfällig seit …“', async () => {
    const brems = r('regbre01', B, { typ: 'bremsfluessigkeit', name: 'Bremsflüssigkeit', intervallMonate: 24 });
    const historie = { [B]: { 2024: { v: 1, auto: B, jahr: 2024, arbeiten: [{ id: 'arbbre01', auto: B, typ: 'bremsfluessigkeit', datum: '2024-10-01', details: {} }], km: [] } } };
    const state = mitAutos(autosTeil({ autos: [autoB], regeln: [brems], historie }));
    const plan = await autoPlan(state, '2026-10-14T08:00:00+02:00');
    assert.deepEqual(kurz(plan), [['2026-10-15T07:00:00.000Z', '🚗 Zweitauto: Bremsflüssigkeit', 'überfällig seit 01.10.2026']]);
    // am Abend neu gerechnet: dieselbe Kennung (ersetzt die Meldung auf dem Telefon), am nächsten Morgen um 09:00
    const abend = await autoPlan(state, '2026-10-14T21:00:00+02:00');
    assert.deepEqual([abend[0].id, abend[0].um], [plan[0].id, plan[0].um]);
  });

  test('ohne Erinnerung („unbekannt“), ohne Datum (km ohne Geschwindigkeit) oder abgeschaltete Regel → nichts', async () => {
    const zuend = r('regzue01', B, { typ: 'zuendkerzen', name: 'Zündkerzen', intervallKm: 30000 }); // Gebrauchtwagen ohne Erledigung → unbekannt
    const oelB = r('regoel02', B, { typ: 'oelwechsel', name: 'Ölwechsel', intervallKm: 15000 }); // nur ein km-Punkt → kein Datum
    const filter = (aktiv) => r('regluf01', B, { typ: 'luftfilter', name: 'Luftfilter', intervallMonate: 12, ersteFaelligkeit: '2026-11-20', aktiv });
    const historie = { [B]: { 2026: { v: 1, auto: B, jahr: 2026, arbeiten: [{ id: 'arboel02', auto: B, typ: 'oelwechsel', datum: '2026-03-01', km: 80000, details: {} }], km: [] } } };
    const mit = (regeln) => mitAutos(autosTeil({ autos: [autoB], regeln, historie }));
    assert.deepEqual(await autoPlan(mit([zuend, oelB, filter(false)]), '2026-10-14T08:00:00+02:00'), []);
    // Gegenprobe: dieselbe Regel eingeschaltet erinnert (21.10. und 13.11.)
    assert.deepEqual(kurz(await autoPlan(mit([filter(true)]), '2026-10-14T08:00:00+02:00')).map((x) => [x[0], x[2]]), [
      ['2026-10-21T07:00:00.000Z', 'fällig am 20.11.2026 (in 30 Tagen)'],
      ['2026-11-13T08:00:00.000Z', 'fällig am 20.11.2026 (in 7 Tagen)'],
    ]);
  });

  test('Autos nicht frisch gelesen (Schnappschuss, Lesefehler) → keine Auto-Erinnerungen, der übrige Plan bleibt genau gleich', async () => {
    const termine = [{ id: 't1', typ: 'arzt', subtyp: 'zahnarzt', date: '2026-10-20', time: '09:00', mitnehmen: [], kosten: null }];
    const jetzt = '2026-10-14T08:00:00+02:00';
    const frisch = await plane(mitAutos(autosTeil({ regeln: [OEL] }), { termine }), jetzt);
    const alt = await plane(mitAutos(autosTeil({ regeln: [OEL], frisch: false }), { termine }), jetzt);
    const ohne = await plane(zustand({ settings: { kontoErinnerung: '' }, termine }), jetzt);
    assert.equal(frisch.filter((p) => p.titel.startsWith('🚗')).length, 2);
    assert.deepEqual(alt, ohne);
    assert.deepEqual(frisch.filter((p) => !p.titel.startsWith('🚗')), ohne);
    // kaputte Autos im Zustand verhindern den übrigen Plan nicht
    assert.deepEqual(await plane(mitAutos({ frisch: true, daten: { autos: [{ id: 'x' }], regeln: 'kaputt' }, historie: null }, { termine }), jetzt), ohne);
  });

  test('eigene Änderung noch nicht gespeichert: der Plan nimmt den zuletzt GESPEICHERTEN Stand (bestaetigt), wie das andere Telefon', async () => {
    const teil = autosTeil({ regeln: [OEL], bestaetigt: { daten: { v: 1, autos: [autoA], regeln: [], saetze: [], jahre: {} }, historie: {} } });
    assert.deepEqual(await autoPlan(mitAutos(teil), '2026-10-14T08:00:00+02:00'), []);
  });

  test('Kennungen stabil: je Regel, Termin und Abstand; ein neuer Termin (Pickerl-Monat geändert) ersetzt die alten', async () => {
    const pickerl = (fixMonat) => r('regpik01', A, { typ: 'pickerl', name: 'Pickerl', fixMonat });
    const jetzt = '2026-10-14T08:00:00+02:00';
    const a = await autoPlan(mitAutos(autosTeil({ regeln: [pickerl('2026-11')] })), jetzt);
    const b = await autoPlan(mitAutos(autosTeil({ regeln: [pickerl('2026-11')] })), '2026-10-20T08:00:00+02:00');
    assert.deepEqual(kurz(a).map((x) => x[2]), ['fällig am 30.11.2026 (in 30 Tagen)', 'fällig am 30.11.2026 (in 7 Tagen)']);
    assert.deepEqual(b.map((p) => p.id), a.map((p) => p.id));
    const neu = await autoPlan(mitAutos(autosTeil({ regeln: [pickerl('2026-12')] })), jetzt);
    assert.equal(neu.some((p) => a.some((q) => q.id === p.id)), false);
    assert.deepEqual(kurz(neu).map((x) => x[2]), ['fällig am 31.12.2026 (in 30 Tagen)']); // 7 Tage vorher (24.12.) liegt nach dem Fenster (60 Tage)
  });

  test('Zeitumstellung: 09:00 Wien am 25.10.2026 (Winterzeit) und am 28.03.2027 (Sommerzeit); Winterreifen erst ab 15.10.', async () => {
    const saetze = [
      { id: 'satzsom1', auto: A, name: 'Sommer', art: 'sommer' },
      { id: 'satzwin1', auto: A, name: 'Winter', art: 'winter' },
    ];
    const reifen = r('regrei01', A, { typ: 'reifenwechsel', name: 'Reifenwechsel (saisonal)' });
    const historie = { [A]: { 2026: { v: 1, auto: A, jahr: 2026, arbeiten: [{ id: 'arbrei01', auto: A, typ: 'reifenwechsel', datum: '2026-04-10', km: 3000, details: { montiert: 'satzsom1', rotiert: false } }], km: [] } } };
    const herbst = await autoPlan(mitAutos(autosTeil({ regeln: [reifen], saetze, historie })), '2026-09-20T08:00:00+02:00');
    // 30 Tage vorher (02.10.) liegt vor dem 15.10.: nur die eine eine Woche vorher, am Tag der Umstellung
    assert.deepEqual(kurz(herbst), [['2026-10-25T08:00:00.000Z', '🚗 Testauto: Reifenwechsel (saisonal)', 'Winterreifen montieren – fällig am 01.11.2026 (in 7 Tagen)']]);
    // ohne Reifensätze: kein saisonaler Reifenwechsel
    assert.deepEqual(await autoPlan(mitAutos(autosTeil({ regeln: [reifen], saetze: [], historie })), '2026-09-20T08:00:00+02:00'), []);
    const wischer = r('regwis01', B, { typ: 'wischer', name: 'Wischerblätter', intervallMonate: 12, ersteFaelligkeit: '2027-04-04' });
    const fruehling = await autoPlan(mitAutos(autosTeil({ autos: [autoB], regeln: [wischer], historie: {} })), '2027-03-01T08:00:00+01:00');
    assert.deepEqual(kurz(fruehling).map((x) => x[0]), ['2027-03-05T08:00:00.000Z', '2027-03-28T07:00:00.000Z']);
  });
});

describe('Wann der Plan wegen der Autos neu gesendet wird (planQuellen)', () => {
  const basis = (teil) => ({ ...mitAutos(teil), geladen: true, nurSnapshot: false, schicht: { katalog: null, monate: {}, status: {}, vorgeladen: '2026-10' } });
  const JETZT = new Date('2026-10-14T08:00:00+02:00');

  test('neue Daten, neuer Verlauf oder „frisch“ ändert sich → neu senden; Status, Warnungen oder ein neues autos-Objekt → nicht', () => {
    const s = basis(autosTeil());
    const q = planQuellen(s, JETZT);
    assert.equal(quellenGeaendert(planQuellen({ ...s, autos: { ...s.autos, status: 'laedt' } }, JETZT), q), false);
    assert.equal(quellenGeaendert(planQuellen({ ...s, autos: { ...s.autos, warnungen: ['x'] } }, JETZT), q), false);
    assert.equal(quellenGeaendert(planQuellen({ ...s, autos: { ...s.autos, daten: { ...s.autos.daten } } }, JETZT), q), true);
    assert.equal(quellenGeaendert(planQuellen({ ...s, autos: { ...s.autos, historie: { ...s.autos.historie } } }, JETZT), q), true);
    assert.equal(quellenGeaendert(planQuellen({ ...s, autos: { ...s.autos, frisch: false } }, JETZT), q), true);
    // nicht frisch: weitere Lesefehler (jedes Mal ein neues autos-Objekt) senden nicht erneut (keine Schleife, Re-Review N6)
    const nf = planQuellen({ ...s, autos: { ...s.autos, frisch: false } }, JETZT);
    assert.equal(quellenGeaendert(planQuellen({ ...s, autos: { ...s.autos, frisch: false, status: 'fehler', warnungen: ['Lesefehler'] } }, JETZT), nf), false);
  });

  test('N6: ein Lesen der Autos im Hintergrund mit unveränderten Daten (oder dauerhaft scheiternd) stößt keinen neuen Plan an', async () => {
    const t = apiAttrappe();
    const paket = autoAusVorlage('fiat500', { ezDatum: '2017-07-01' }, { zufall: folge(7) });
    await t.api.ereignisse.schreibe('kan', { id: 'fkautos', description: autosText(autoAnlegen(leereAutos(), paket)) });
    let kaputt = false;
    const ereignisse = { ...t.api.ereignisse, holen: async (k, id) => (kaputt && id === 'fkautos' ? Promise.reject(new Error('HTTP 500')) : t.api.ereignisse.holen(k, id)) };
    const jetzt = () => JETZT;
    const store = createStore(createGoogleAdapter({ api: { ereignisse }, kalender: { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' }, jetzt }), { jetzt });
    await store.laden();
    await store.schichtVorladen();
    await store.autosLaden();
    const q = planQuellen(store.getState(), JETZT);
    assert.ok(q);
    assert.equal(await store.autosFrischLesen(), true);
    assert.equal(quellenGeaendert(planQuellen(store.getState(), JETZT), q), false, 'unverändert gelesen');
    kaputt = true;
    await store.autosFrischLesen();
    const q2 = planQuellen(store.getState(), JETZT);
    assert.equal(quellenGeaendert(q2, q), true, 'nicht mehr frisch: einmal neu (ohne Auto-Erinnerungen)');
    await store.autosFrischLesen();
    await store.autosLaden();
    assert.equal(quellenGeaendert(planQuellen(store.getState(), JETZT), q2), false, 'jeder weitere Fehler: kein neuer Plan');
  });
});

describe('Karte „🚗 Auto“ auf Heute', () => {
  const HEUTE = '2026-10-14';
  const brems = r('regbre01', B, { typ: 'bremsfluessigkeit', name: 'Bremsflüssigkeit', intervallMonate: 24 });
  const filter = r('regluf01', B, { typ: 'luftfilter', name: 'Luftfilter', intervallMonate: 12, ersteFaelligkeit: '2026-11-02' });
  const innen = r('reginn01', B, { typ: 'innenraumfilter', name: 'Innenraumfilter', intervallMonate: 12, ersteFaelligkeit: '2026-10-20' });
  const wischer = r('regwis01', B, { typ: 'wischer', name: 'Wischerblätter', intervallMonate: 12, ersteFaelligkeit: '2026-10-25' });
  const keil = r('regkei01', B, { typ: 'keilriemen', name: 'Keilrippenriemen', intervallMonate: 12, ersteFaelligkeit: '2027-06-01' }); // ok
  const historieB = { [B]: { 2024: { v: 1, auto: B, jahr: 2024, arbeiten: [{ id: 'arbbre01', auto: B, typ: 'bremsfluessigkeit', datum: '2024-10-01', details: {} }], km: [] } } };

  test('nur bald oder überfällig; überfällige zuerst, dann nach Datum; höchstens 3 Zeilen und „+N weitere“; Link auf das Auto', () => {
    const teil = autosTeil({ autos: [autoA, autoB], regeln: [OEL, filter, innen, wischer, keil, brems], historie: { [A]: historieA(), ...historieB } });
    const k = autoKarteModel(teil, HEUTE);
    assert.deepEqual(
      k.zeilen.map((z) => [z.titel, z.status, z.text, z.ziel]),
      [
        ['Zweitauto: Bremsflüssigkeit', 'ueberfaellig', 'überfällig seit 01.10.2026', `#/autos/${B}`],
        ['Zweitauto: Innenraumfilter', 'bald', 'fällig am 20.10.2026 (in 6 Tagen)', `#/autos/${B}`],
        ['Zweitauto: Wischerblätter', 'bald', 'fällig am 25.10.2026 (in 11 Tagen)', `#/autos/${B}`],
      ],
    );
    assert.deepEqual([k.anzahl, k.mehr], [4, 1]); // Luftfilter (02.11.) ist der vierte; Ölwechsel (13.12.) und Keilriemen sind ok
  });

  test('nichts bald oder überfällig, keine Autos oder unlesbar → keine Karte; aus dem Schnappschuss (nicht frisch) trotzdem', () => {
    assert.equal(autoKarteModel(autosTeil({ regeln: [OEL] }), HEUTE), null);
    assert.equal(autoKarteModel(autosTeil({ autos: [] }), HEUTE), null);
    assert.equal(autoKarteModel(undefined, HEUTE), null);
    const alt = autoKarteModel(autosTeil({ autos: [autoB], regeln: [brems], historie: historieB, frisch: false }), HEUTE);
    assert.equal(alt.zeilen.length, 1);
    assert.equal(alt.mehr, 0);
  });

  test('heuteModel enthält die Karte; Vignette und km-Zeile haben eigene Texte', () => {
    const teil = autosTeil({ regeln: [VIGNETTE] });
    const m = heuteModel(mitAutos(teil), new Date('2026-12-20T08:00:00+01:00'));
    assert.deepEqual(m.autos.zeilen.map((z) => [z.titel, z.text]), [['Testauto: Vignette', 'Vignette 2027 kaufen – online bis 13.01., im Geschäft bis 31.01.']]);
    const km = autoKarteModel(autosTeil({ regeln: [OEL] }), '2026-11-20');
    assert.deepEqual(km.zeilen.map((z) => z.text), ['bei ca. 15.200 km (etwa 13.12.2026)']);
    assert.equal(heuteModel(mitAutos(autosTeil({ regeln: [OEL] })), new Date('2026-10-14T08:00:00+02:00')).autos, null);
  });

  test('die Beispieldaten zeigen am Tag der visuellen Basis (14.10.2026, morgens und abends) keine Karte', () => {
    {
      const heute = '2026-10-14';
      const demo = seedDemo(heute);
      assert.equal(autoKarteModel({ ...demo.autos, frisch: false }, heute), null);
    }
  });
});

describe('Neuzeichnen nach einem Lesen der Autos im Hintergrund', () => {
  const HEUTE = '2026-10-14';
  const brems = r('regbre01', B, { typ: 'bremsfluessigkeit', name: 'Bremsflüssigkeit', intervallMonate: 24 });
  const historieB = { [B]: { 2024: { v: 1, auto: B, jahr: 2024, arbeiten: [{ id: 'arbbre01', auto: B, typ: 'bremsfluessigkeit', datum: '2024-10-01', details: {} }], km: [] } } };
  const konto = { v: 1 }; // derselbe Kontostand in allen Zuständen: es ändern sich nur die Autos
  const s = (teil) => ({ geladen: true, konto, autos: teil });

  test('auf Heute nur, wenn sich die Karte ändert (sonst ginge z. B. die Tastatur zu); auf anderen Seiten nie', () => {
    const ohne = s(autosTeil({ regeln: [OEL] }));
    const laedt = s({ ...ohne.autos, status: 'laedt' });
    const andereDaten = s(autosTeil({ regeln: [OEL, VIGNETTE] })); // anderes, aber nichts fällig
    const mitKarte = s(autosTeil({ autos: [autoB], regeln: [brems], historie: historieB }));
    const ansicht = { seite: 'heute', kontoAnsicht: 'kontostand', heute: HEUTE };
    assert.equal(nurHintergrundGeaendert(ohne, laedt, ansicht), true);
    assert.equal(nurHintergrundGeaendert(ohne, andereDaten, ansicht), true);
    assert.equal(nurHintergrundGeaendert(ohne, mitKarte, ansicht), false);
    assert.equal(nurHintergrundGeaendert(mitKarte, ohne, ansicht), false);
    assert.equal(nurHintergrundGeaendert(ohne, mitKarte, { ...ansicht, seite: 'konto' }), true);
    assert.equal(nurHintergrundGeaendert(ohne, mitKarte, { ...ansicht, seite: 'autos' }), false);
  });
});
