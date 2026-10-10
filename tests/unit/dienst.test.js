// „Wer bringt, wer holt?“: Wochenplan, Ausnahmen, Wechsel per Tipp, Prüfung der Einstellungen und was „Heute“/das Tages-Blatt zeigen.
// Ausführen: node --test tests/unit/dienst.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dienstFuer, dienstGenutzt, mitAusnahme, mitPlan, naechstePerson, planFuer } from '../../src/domain/dienst.js';
import { DEFAULT_SETTINGS, MAX_DIENST_AUSNAHMEN, normalizeSettings } from '../../src/domain/settings.js';
import { addDays } from '../../src/domain/dates.js';
import { einstellungenAusEreignis } from '../../src/calendar/mapping.js';
import { betreuungstag, dienstHeute, dienstTag } from '../../src/app/views/dienst-model.js';
import { tagModel } from '../../src/app/views/tag-model.js';
import { heuteModel } from '../../src/app/views/heute-model.js';
import { leereListe } from '../../src/domain/einkauf.js';
import { leeresKonto } from '../../src/domain/konto.js';

// 2026-10-12 = Montag, 2026-10-13 = Dienstag, 2026-10-17 = Samstag, 2026-10-26 = Nationalfeiertag (Montag)
const MO = '2026-10-12';
const DI = '2026-10-13';
const SA = '2026-10-17';

/** Einstellungen mit Wochenplan: Mo bringt Mama, Di–Fr Papa; abholen Mo–Do Mama, Fr niemand. */
function einstellungen(extra = {}) {
  return normalizeSettings({
    dienstplan: { b: ['mama', 'papa', 'papa', 'papa', 'papa', '', ''], h: ['mama', 'mama', 'mama', 'mama', '', '', ''] },
    ...extra,
  });
}

const zustand = (settings, extra = {}) => ({ settings, tage: {}, urlaub: [], termine: [], ...extra });
/** Zeitpunkt zu Wiener Ortszeit im Oktober 2026 vor der Zeitumstellung (UTC+2). */
const wien = (datum, zeit) => new Date(`${datum}T${zeit}:00+02:00`);

test('naechstePerson: — → Papa → Mama → —', () => {
  assert.equal(naechstePerson(''), 'papa');
  assert.equal(naechstePerson('papa'), 'mama');
  assert.equal(naechstePerson('mama'), '');
  assert.equal(naechstePerson(undefined), 'papa');
  let p = '';
  for (let i = 0; i < 3; i += 1) p = naechstePerson(p);
  assert.equal(p, '', 'nach drei Tipps wieder am Anfang');
});

test('Standard: niemand eingetragen, Erinnerung an beide', () => {
  const s = normalizeSettings();
  assert.deepEqual(s.dienstplan, { b: ['', '', '', '', '', '', ''], h: ['', '', '', '', '', '', ''] });
  assert.deepEqual(s.dienstAusnahmen, {});
  assert.equal(s.dienstErinnerung, 'beide');
  assert.deepEqual(dienstFuer(MO, s), { b: '', h: '' });
  assert.equal(dienstGenutzt(s), false);
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS.dienstplan.b), 'der Standard lässt sich nicht verändern');
  s.dienstplan.b[0] = 'papa';
  assert.equal(normalizeSettings().dienstplan.b[0], '', 'jede Normalisierung liefert eine eigene Kopie');
});

test('dienstFuer: Wochenplan je Wochentag, Ausnahme geht vor (auch „niemand“)', () => {
  const s = einstellungen();
  assert.deepEqual(dienstFuer(MO, s), { b: 'mama', h: 'mama' });
  assert.deepEqual(dienstFuer(DI, s), { b: 'papa', h: 'mama' });
  assert.deepEqual(dienstFuer('2026-10-16', s), { b: 'papa', h: '' });

  const mitAus = einstellungen({ dienstAusnahmen: { [DI]: { h: 'papa' }, [MO]: { b: '' } } });
  assert.deepEqual(dienstFuer(DI, mitAus), { b: 'papa', h: 'papa' }, 'nur die geänderte Rolle weicht ab');
  assert.deepEqual(dienstFuer(MO, mitAus), { b: '', h: 'mama' }, 'eine leere Ausnahme heißt: an diesem Tag niemand');
  assert.deepEqual(dienstFuer('2026-10-19', mitAus), { b: 'mama', h: 'mama' }, 'der nächste Montag folgt wieder dem Plan');
});

test('dienstFuer: Wochentage ohne Betreuung haben keinen Plan, Ausnahmen gelten trotzdem', () => {
  const s = einstellungen({ erwartung: [1, 2, 3, 4], dienstplan: { b: ['mama', 'papa', '', '', '', 'papa', ''], h: ['', '', '', '', '', '', ''] } });
  assert.deepEqual(planFuer(MO, s), { b: '', h: '' }, 'Montag ist nicht mehr erwartet: der alte Eintrag zählt nicht');
  assert.deepEqual(dienstFuer(SA, s), { b: '', h: '' });
  assert.deepEqual(dienstFuer(SA, { ...s, dienstAusnahmen: { [SA]: { b: 'mama' } } }), { b: 'mama', h: '' });
});

test('dienstGenutzt: Wochenplan oder einzelne Tage', () => {
  assert.equal(dienstGenutzt(einstellungen()), true);
  assert.equal(dienstGenutzt(normalizeSettings({ dienstAusnahmen: { [DI]: { b: 'papa' } } })), true);
  assert.equal(dienstGenutzt(normalizeSettings({ dienstAusnahmen: { [DI]: { b: '' } } })), false, 'nur „niemand“ zählt nicht');
  assert.equal(dienstGenutzt(normalizeSettings({ erwartung: [0], dienstplan: { b: ['', 'papa', '', '', '', '', ''], h: ['', '', '', '', '', '', ''] } })), false, 'Eintrag nur an einem nicht erwarteten Tag');
});

test('mitPlan: ändert genau einen Wochentag, ohne die Einstellungen zu verändern', () => {
  const s = einstellungen();
  const plan = mitPlan(s, 4, 'h', 'papa');
  assert.deepEqual(plan.h, ['mama', 'mama', 'mama', 'mama', 'papa', '', '']);
  assert.deepEqual(plan.b, s.dienstplan.b);
  assert.equal(s.dienstplan.h[4], '', 'Original unverändert');
  assert.doesNotThrow(() => normalizeSettings({ ...s, dienstplan: plan }));
});

test('mitAusnahme: setzt einen Tag, gleich wie der Plan = keine Ausnahme', () => {
  const s = einstellungen();
  const a1 = mitAusnahme(s, DI, 'b', 'mama', MO);
  assert.deepEqual(a1, { [DI]: { b: 'mama' } });
  assert.deepEqual(s.dienstAusnahmen, {}, 'Original unverändert');

  const s2 = { ...s, dienstAusnahmen: a1 };
  const a2 = mitAusnahme(s2, DI, 'h', '', MO);
  assert.deepEqual(a2, { [DI]: { b: 'mama', h: '' } }, 'zweite Rolle am selben Tag; „niemand“ ist eine echte Ausnahme');

  const a3 = mitAusnahme({ ...s, dienstAusnahmen: a2 }, DI, 'b', 'papa', MO);
  assert.deepEqual(a3, { [DI]: { h: '' } }, 'zurück auf den Plan: die Rolle fällt weg');
  const a4 = mitAusnahme({ ...s, dienstAusnahmen: a3 }, DI, 'h', 'mama', MO);
  assert.deepEqual(a4, {}, 'nichts mehr abweichend: der Tag fällt ganz weg');
});

test('mitAusnahme: drei Tipps auf „Heute“ kommen wieder beim Plan an (keine Ausnahme übrig)', () => {
  let s = einstellungen();
  for (let i = 0; i < 3; i += 1) {
    const person = naechstePerson(dienstFuer(DI, s).b);
    s = { ...s, dienstAusnahmen: mitAusnahme(s, DI, 'b', person, DI) };
  }
  assert.deepEqual(s.dienstAusnahmen, {});
  assert.equal(dienstFuer(DI, s).b, 'papa');
});

test('mitAusnahme: räumt beim Speichern auf (älter als heute − 7 Tage fällt weg)', () => {
  const heute = '2026-10-20';
  const s = einstellungen({
    dienstAusnahmen: { '2026-10-12': { b: 'papa' }, '2026-10-13': { b: 'mama' }, '2026-10-19': { h: 'papa' } },
  });
  const a = mitAusnahme(s, '2026-10-21', 'b', 'mama', heute);
  assert.deepEqual(Object.keys(a), ['2026-10-13', '2026-10-19', '2026-10-21'], 'genau heute − 7 bleibt, davor fällt weg; sortiert');
});

test('mitAusnahme: höchstens 60 Tage, die ältesten fliegen zuerst raus', () => {
  const heute = '2026-01-05';
  const ausnahmen = {};
  for (let i = 0; i < MAX_DIENST_AUSNAHMEN; i += 1) ausnahmen[addDays(heute, i)] = { b: 'papa' };
  const s = einstellungen({ dienstAusnahmen: ausnahmen });
  const neu = addDays(heute, 100);
  const a = mitAusnahme(s, neu, 'h', 'papa', heute);
  const tage = Object.keys(a);
  assert.equal(tage.length, MAX_DIENST_AUSNAHMEN);
  assert.equal(tage[0], addDays(heute, 1), 'der älteste Tag ist weg');
  assert.equal(tage.at(-1), neu);
  assert.doesNotThrow(() => normalizeSettings({ ...s, dienstAusnahmen: a }));
});

test('normalizeSettings: gültige Werte bleiben, Ausnahmen werden sortiert, leere Tage fallen weg', () => {
  const s = normalizeSettings({
    dienstplan: { b: ['papa', '', 'mama', '', '', '', ''], h: ['', '', '', '', 'papa', '', ''] },
    dienstAusnahmen: { '2026-10-14': { h: 'mama' }, '2026-10-13': { b: '', h: 'papa' }, '2026-10-15': {} },
    dienstErinnerung: 'dienst',
  });
  assert.deepEqual(s.dienstplan.b, ['papa', '', 'mama', '', '', '', '']);
  assert.deepEqual(Object.keys(s.dienstAusnahmen), ['2026-10-13', '2026-10-14']);
  assert.deepEqual(s.dienstAusnahmen['2026-10-13'], { b: '', h: 'papa' });
  assert.equal(s.dienstErinnerung, 'dienst');
});

test('normalizeSettings: mehr als 60 Ausnahmen – die neuesten 60 bleiben', () => {
  const ausnahmen = {};
  for (let i = 0; i < 65; i += 1) ausnahmen[addDays('2026-01-01', i)] = { b: 'mama' };
  const s = normalizeSettings({ dienstAusnahmen: ausnahmen });
  const tage = Object.keys(s.dienstAusnahmen);
  assert.equal(tage.length, 60);
  assert.equal(tage[0], addDays('2026-01-01', 5));
});

test('normalizeSettings: Ungültiges wirft', () => {
  const leer = ['', '', '', '', '', '', ''];
  const ungueltig = [
    { dienstplan: null },
    { dienstplan: [] },
    { dienstplan: { b: leer } },
    { dienstplan: { b: leer, h: ['', '', ''] } },
    { dienstplan: { b: leer, h: [...leer.slice(1), 'oma'] } },
    { dienstplan: { b: leer, h: leer, x: leer } },
    { dienstplan: { b: leer, h: [...leer.slice(1), null] } },
    { dienstAusnahmen: [] },
    { dienstAusnahmen: null },
    { dienstAusnahmen: { '2026-02-30': { b: 'papa' } } },
    { dienstAusnahmen: { morgen: { b: 'papa' } } },
    { dienstAusnahmen: { '2026-10-13': 'papa' } },
    { dienstAusnahmen: { '2026-10-13': { x: 'papa' } } },
    { dienstAusnahmen: { '2026-10-13': { b: 'Papa' } } },
    { dienstErinnerung: 'papa' },
    { dienstErinnerung: '' },
    { dienstErinnerung: true },
  ];
  for (const teil of ungueltig) assert.throws(() => normalizeSettings(teil), /Ungültige Einstellung: dienst/, JSON.stringify(teil));
});

test('aus Google gelesen: ein ungültiges Feld fällt auf den Standard zurück, der Rest bleibt', () => {
  const daten = {
    v: 1,
    bringzeit: '08:00',
    dienstplan: { b: ['papa', 'papa', 'papa', 'papa', 'papa', '', ''], h: ['mama', 'mama', 'mama', 'mama', 'mama', '', ''] },
    dienstAusnahmen: { '2026-10-13': { b: 'opa' } },
    dienstErinnerung: 'dienst',
  };
  const { settings, warnungen } = einstellungenAusEreignis({ description: JSON.stringify(daten) });
  assert.deepEqual(warnungen, ['dienstAusnahmen']);
  assert.deepEqual(settings.dienstAusnahmen, {});
  assert.equal(settings.dienstplan.b[0], 'papa');
  assert.equal(settings.dienstErinnerung, 'dienst');
  assert.equal(settings.bringzeit, '08:00');

  const alt = einstellungenAusEreignis({ description: JSON.stringify({ v: 1, bringzeit: '08:00' }) });
  assert.deepEqual(alt.warnungen, [], 'Einstellungen einer älteren Version (ohne die neuen Felder) sind gültig');
  assert.equal(alt.settings.dienstErinnerung, 'beide');
});

test('betreuungstag: erwarteter Wochentag, kein Feiertag, nicht krank/abwesend/geschlossen/Urlaub', () => {
  const s = einstellungen();
  assert.equal(betreuungstag(zustand(s), MO), true);
  assert.equal(betreuungstag(zustand(s), SA), false, 'Samstag nicht erwartet');
  assert.equal(betreuungstag(zustand(s), '2026-10-26'), false, 'Nationalfeiertag');
  for (const typ of ['krank', 'abwesend', 'schliess']) assert.equal(betreuungstag(zustand(s, { tage: { [MO]: { typ } } }), MO), false, typ);
  assert.equal(betreuungstag(zustand(s, { tage: { [MO]: { typ: 'kita_essen' } } }), MO), true);
  assert.equal(betreuungstag(zustand(s, { urlaub: [{ id: 'u', start: MO, end: DI }] }), DI), false, 'Urlaub');
});

test('dienstTag: Personen, Namen und Uhrzeiten; leer, wenn niemand eingetragen', () => {
  const t = dienstTag(zustand(einstellungen({ bringzeit: '07:45' })), DI);
  assert.deepEqual(t.b, { rolle: 'b', person: 'papa', emoji: '👨', name: 'Papa', zeit: '07:45' });
  assert.deepEqual(t.h, { rolle: 'h', person: 'mama', emoji: '👩', name: 'Mama', zeit: '15:30' });
  assert.equal(t.leer, false);
  const leer = dienstTag(zustand(normalizeSettings()), DI);
  assert.equal(leer.leer, true);
  assert.equal(leer.b.name, null);
  assert.equal(dienstTag(zustand(einstellungen(), { tage: { [DI]: { typ: 'krank' } } }), DI), null);
});

test('dienstHeute: morgens nur heute, ab der Abholzeit auch morgen', () => {
  const st = zustand(einstellungen());
  assert.deepEqual(dienstHeute(st, wien(MO, '07:10')).map((z) => [z.wann, z.datum]), [['heute', MO]]);
  assert.deepEqual(dienstHeute(st, wien(MO, '15:29')).map((z) => z.wann), ['heute']);
  assert.deepEqual(dienstHeute(st, wien(MO, '15:30')).map((z) => [z.wann, z.datum]), [['heute', MO], ['morgen', DI]]);
  assert.deepEqual(dienstHeute(st, wien('2026-10-16', '19:00')).map((z) => z.wann), ['heute'], 'Freitagabend: Samstag ist kein Betreuungstag');
  assert.deepEqual(dienstHeute(st, wien('2026-10-18', '19:00')).map((z) => [z.wann, z.datum]), [['morgen', '2026-10-19']], 'Sonntagabend: nur Montag');
  assert.deepEqual(dienstHeute(st, wien('2026-10-25', '19:00')), [], 'Montag ist Nationalfeiertag');
  assert.deepEqual(dienstHeute(zustand(normalizeSettings()), wien(MO, '07:10')), [], 'nicht verwendet: keine Zeile');
  const krank = zustand(einstellungen(), { tage: { [MO]: { typ: 'krank' } } });
  assert.deepEqual(dienstHeute(krank, wien(MO, '07:10')), []);
});

test('dienstHeute: verwendet, aber heute niemand eingetragen → leere Zeile zum Festlegen', () => {
  const s = einstellungen({ dienstAusnahmen: { [MO]: { b: '', h: '' } } });
  const [z] = dienstHeute(zustand(s), wien(MO, '07:10'));
  assert.equal(z.leer, true);
  assert.equal(z.wann, 'heute');
});

test('heuteModel und tagModel liefern die Daten für „Heute“ und das Tages-Blatt', () => {
  const st = zustand(einstellungen(), { einkauf: leereListe(), konto: leeresKonto() });
  const m = heuteModel(st, wien(MO, '16:00'));
  assert.deepEqual(m.dienst.map((z) => z.wann), ['heute', 'morgen']);
  assert.equal(tagModel(st, DI, MO).dienst.b.person, 'papa');
  assert.equal(tagModel(st, MO, DI).dienst, null, 'vergangene Tage: keine Knöpfe');
  assert.equal(tagModel(st, SA, MO).dienst, null, 'kein Betreuungstag');
});
