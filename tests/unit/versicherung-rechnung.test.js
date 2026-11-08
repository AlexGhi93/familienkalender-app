// Versicherung – die Rechnung: Verbrauch, Rest und Überschreitung je Kategorie und Kalenderjahr (Spec §5), offene Erstattungen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ERSTATTUNG_ERINNERUNG_TAGE, alleRechnungen, jahresStand, offeneErstattungen, rechnungFinden, rechnungenDesJahres } from '../../src/domain/versicherung-rechnung.js';
import { POLIZZE_VORLAGEN, leererVersicherungTeil, polizzeAusVorlage, pruefeVersicherungTeil, rechnungSetzen, rechnungTeilWechseln } from '../../src/domain/versicherung.js';

const POLIZZE = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-10-20' }, { zufall: () => 0.5 });

let nr = 0;
/** Eine Rechnung (Kennung fortlaufend); `mehr` überschreibt. */
const rechnung = (kategorie, betragCent, mehr = {}) => {
  nr += 1;
  return { id: `r${String(nr).padStart(7, '0')}`, kategorie, datum: '2026-10-25', betragCent, eingereichtAm: '2026-10-26', ...mehr };
};
const kat = (stand, id) => stand.kategorien.find((k) => k.id === id);

describe('jahresStand: Verbrauch und Rest (Spec §5)', () => {
  test('ohne Rechnungen: alles frei, in der Reihenfolge der Polizze', () => {
    const s = jahresStand(POLIZZE, [], 2026);
    assert.deepEqual(s.kategorien.map((k) => [k.id, k.limitCent, k.verbrauchtCent, k.restCent, k.ueberschrittenCent]), [
      ['arzt', 160000, 0, 160000, 0],
      ['physio', 49000, 0, 49000, 0],
      ['psycho', 41500, 0, 41500, 0],
      ['medi', 41500, 0, 41500, 0],
      ['heil', 22400, 0, 22400, 0],
    ]);
    assert.deepEqual(s.gesamt, { maximumCent: 314400, verbrauchtCent: 0, restCent: 314400, ueberschrittenCent: 0, ohneKategorieCent: 0 });
    assert.deepEqual(s.rechnungen, []);
  });

  test('Verbrauch = erstattet, wenn eingetragen, sonst der Rechnungsbetrag; eingereicht und erstattet getrennt', () => {
    const offen = rechnung('physio', 12000);
    const bezahlt = rechnung('physio', 10000, { erstattetCent: 8000, erstattetAm: '2026-11-05' });
    const s = jahresStand(POLIZZE, [offen, bezahlt], 2026);
    assert.deepEqual(kat(s, 'physio'), { id: 'physio', limitCent: 49000, verbrauchtCent: 20000, eingereichtCent: 12000, erstattetCent: 8000, restCent: 29000, ueberschrittenCent: 0 });
    assert.deepEqual([s.gesamt.verbrauchtCent, s.gesamt.restCent], [20000, 294400]);
  });

  test('Review Focus 1: erstattet 0 → Verbrauch 0; erstattet > Betrag → Verbrauch = erstattet; nie ein negativer Rest', () => {
    const null0 = rechnung('medi', 5000, { erstattetCent: 0, erstattetAm: '2026-11-01' });
    let s = jahresStand(POLIZZE, [null0], 2026);
    assert.deepEqual([kat(s, 'medi').verbrauchtCent, kat(s, 'medi').erstattetCent, kat(s, 'medi').eingereichtCent, kat(s, 'medi').restCent], [0, 0, 0, 41500]);
    const mehr = rechnung('heil', 20000, { erstattetCent: 30000, erstattetAm: '2026-11-01' });
    s = jahresStand(POLIZZE, [mehr], 2026);
    assert.deepEqual(kat(s, 'heil'), { id: 'heil', limitCent: 22400, verbrauchtCent: 30000, eingereichtCent: 0, erstattetCent: 30000, restCent: 0, ueberschrittenCent: 7600 });
    for (const k of s.kategorien) assert.ok(k.restCent >= 0 && k.ueberschrittenCent >= 0, k.id);
    assert.equal(s.gesamt.restCent, 314400 - 22400, 'C2: nur bis zum Limit angerechnet');
  });

  test('nur das gefragte Jahr zählt (Jahr = Jahr des Rechnungsdatums, nicht des Einreichens)', () => {
    const alt = rechnung('arzt', 50000, { datum: '2025-12-30', eingereichtAm: '2026-01-05' });
    const neu = rechnung('arzt', 7000, { datum: '2026-01-02', eingereichtAm: '2026-01-03' });
    assert.equal(kat(jahresStand(POLIZZE, [alt, neu], 2026), 'arzt').verbrauchtCent, 7000);
    assert.equal(kat(jahresStand(POLIZZE, [alt, neu], 2025), 'arzt').verbrauchtCent, 50000);
  });

  test('Rest einer Kategorie höchstens der Gesamtrest', () => {
    // Arzt 1.600 € voll, Physio 490 €, Psycho 415 €, Medikamente 415 € → zusammen 2.920 €, Gesamtrest 224 €
    const liste = [rechnung('arzt', 160000), rechnung('physio', 49000), rechnung('psycho', 41500), rechnung('medi', 41500)];
    const s = jahresStand(POLIZZE, liste, 2026);
    assert.equal(s.gesamt.restCent, 314400 - 292000);
    assert.equal(kat(s, 'heil').restCent, 22400);
    const s2 = jahresStand(POLIZZE, [...liste, rechnung('heil', 10000)], 2026);
    assert.deepEqual([s2.gesamt.restCent, kat(s2, 'heil').restCent], [12400, 12400]);
    const s3 = jahresStand({ ...POLIZZE, maximumCent: 300000 }, liste, 2026);
    assert.deepEqual([s3.gesamt.restCent, kat(s3, 'heil').restCent, kat(s3, 'arzt').restCent], [8000, 8000, 0]);
  });
});

describe('jahresStand: Überschreitung (Review Focus 3)', () => {
  test('Limit unter den schon gemachten Verbrauch gesenkt → Rest 0, überschritten = was über dem Limit liegt', () => {
    const r = rechnung('physio', 30000);
    const s = jahresStand({ ...POLIZZE, kategorien: POLIZZE.kategorien.map((k) => (k.id === 'physio' ? { ...k, limitCent: 20000 } : k)) }, [r], 2026);
    assert.deepEqual([kat(s, 'physio').restCent, kat(s, 'physio').ueberschrittenCent], [0, 10000]);
    assert.deepEqual(s.rechnungen, [{ id: r.id, kategorie: 'physio', verbrauchtCent: 30000, ueberschrittenCent: 10000 }]);
    assert.equal(s.gesamt.ueberschrittenCent, 10000);
    assert.equal(s.gesamt.restCent, 314400 - 20000, 'C2: was über dem Limit liegt, frisst den Gesamtrest nicht');
  });

  test('Maximum unter den Verbrauch gesenkt → Gesamtrest 0, die Rechnung, die das Maximum sprengt, trägt den Anteil', () => {
    const a = rechnung('arzt', 100000, { datum: '2026-03-01', eingereichtAm: '2026-03-02' });
    const b = rechnung('physio', 40000, { datum: '2026-04-01', eingereichtAm: '2026-04-02' });
    const s = jahresStand({ ...POLIZZE, maximumCent: 120000 }, [b, a], 2026); // Reihenfolge der Liste egal: nach Datum
    assert.deepEqual(s.gesamt, { maximumCent: 120000, verbrauchtCent: 140000, restCent: 0, ueberschrittenCent: 20000, ohneKategorieCent: 0 });
    assert.deepEqual([kat(s, 'arzt').ueberschrittenCent, kat(s, 'physio').ueberschrittenCent], [0, 20000]);
    assert.deepEqual(s.rechnungen.map((x) => [x.id, x.ueberschrittenCent]), [[a.id, 0], [b.id, 20000]]);
    for (const k of s.kategorien) assert.equal(k.restCent, 0, `${k.id}: höchstens der Gesamtrest`);
  });

  test('Limit- und Maximum-Anteil zählen nicht doppelt: über dem Maximum zählt nur, was innerhalb der Limits liegt', () => {
    // Arzt 2.000 € (Limit 1.600 → 400 € drüber), Physio 490 €, Psycho 415 €, Medi 415 €, Heil 300 € (Limit 224 → 76 € drüber)
    // innerhalb der Limits: 1.600 + 490 + 415 + 415 + 224 = 3.144 € = genau das Maximum → kein Anteil über dem Maximum
    const liste = [rechnung('arzt', 200000), rechnung('physio', 49000), rechnung('psycho', 41500), rechnung('medi', 41500), rechnung('heil', 30000)];
    const s = jahresStand(POLIZZE, liste, 2026);
    assert.equal(s.gesamt.ueberschrittenCent, 40000 + 7600);
    assert.equal(s.gesamt.verbrauchtCent, 362000);
    assert.equal(s.gesamt.restCent, 0);
    // eine weitere Medikamenten-Rechnung: über dem Limit UND über dem Maximum – zählt einmal
    const s2 = jahresStand(POLIZZE, [...liste, rechnung('medi', 1000)], 2026);
    assert.equal(s2.gesamt.ueberschrittenCent, 40000 + 7600 + 1000);
    assert.equal(kat(s2, 'medi').ueberschrittenCent, 1000);
  });

  test('Summe der Überschreitungen der Kategorien (und ohne Kategorie) = Gesamt-Überschreitung; Rechnungen gleich', () => {
    const liste = [rechnung('arzt', 150000), rechnung('arzt', 30000), rechnung('physio', 60000), rechnung('heil', 22400), rechnung('psycho', 50000), rechnung('alt', 1234)];
    const s = jahresStand({ ...POLIZZE, maximumCent: 250000 }, liste, 2026);
    const summe = s.kategorien.reduce((x, k) => x + k.ueberschrittenCent, 0) + s.gesamt.ohneKategorieCent;
    assert.equal(s.gesamt.ueberschrittenCent, summe);
    assert.equal(s.rechnungen.reduce((x, r) => x + r.ueberschrittenCent, 0), summe);
    assert.equal(s.gesamt.verbrauchtCent, liste.reduce((x, r) => x + r.betragCent, 0));
  });

  test('gleiches Datum: nach Einreichdatum, dann Kennung – unabhängig von der Reihenfolge der Liste', () => {
    const a = rechnung('heil', 20000, { datum: '2026-05-01', eingereichtAm: '2026-05-02', id: 'b0000001' });
    const b = rechnung('heil', 20000, { datum: '2026-05-01', eingereichtAm: '2026-05-02', id: 'a0000001' });
    const s1 = jahresStand(POLIZZE, [a, b], 2026);
    const s2 = jahresStand(POLIZZE, [b, a], 2026);
    assert.deepEqual(s1, s2);
    assert.deepEqual(s1.rechnungen.map((x) => [x.id, x.ueberschrittenCent]), [['a0000001', 0], ['b0000001', 17600]]);
  });

  test('Rechnung einer Kategorie, die es in der Polizze nicht (mehr) gibt: zählt im Gesamt, ganz als nicht erstattet', () => {
    const r = rechnung('weg', 5000);
    const s = jahresStand(POLIZZE, [r], 2026);
    assert.deepEqual(s.gesamt, { maximumCent: 314400, verbrauchtCent: 5000, restCent: 314400, ueberschrittenCent: 5000, ohneKategorieCent: 5000 });
    assert.ok(s.kategorien.every((k) => k.verbrauchtCent === 0));
    assert.deepEqual(s.rechnungen, [{ id: r.id, kategorie: 'weg', verbrauchtCent: 5000, ueberschrittenCent: 5000 }]);
  });

  test('C2: Gesamtrest = max(0, Maximum − Σ min(Verbrauch, Limit)); Rest + angerechnet + überschritten = Verbrauch', () => {
    // Arzt 2.000 € bei Limit 1.600 €: 400 € werden nie erstattet und zählen nicht gegen das Maximum
    const s = jahresStand(POLIZZE, [rechnung('arzt', 200000)], 2026);
    assert.deepEqual([s.gesamt.restCent, s.gesamt.ueberschrittenCent, kat(s, 'arzt').restCent, kat(s, 'physio').restCent], [314400 - 160000, 40000, 0, 49000]);
    // alle Kategorien je 100 € über dem Limit (Σ Limits = 3.144 €), Maximum 2.144 € → Rest 0, über dem Maximum 1.000 €
    const voll = POLIZZE.kategorien.map((k) => rechnung(k.id, k.limitCent + 10000));
    assert.equal(jahresStand(POLIZZE, voll, 2026).gesamt.ueberschrittenCent, 5 * 10000, 'bei 3.144 €: nur die Limit-Überschreitungen');
    const s2 = jahresStand({ ...POLIZZE, maximumCent: 214400 }, voll, 2026);
    assert.equal(s2.gesamt.restCent, 0);
    assert.equal(s2.gesamt.ueberschrittenCent, 5 * 10000 + 100000);
    for (const liste of [voll, [rechnung('arzt', 200000), rechnung('heil', 1000), rechnung('weg', 700)], [rechnung('medi', 41500)]]) {
      const x = jahresStand({ ...POLIZZE, maximumCent: 250000 }, liste, 2026);
      const angerechnet = Math.min(x.gesamt.maximumCent, x.kategorien.reduce((a, k) => a + Math.min(k.verbrauchtCent, k.limitCent), 0));
      assert.equal(x.gesamt.restCent, x.gesamt.maximumCent - angerechnet);
      assert.equal(angerechnet + x.gesamt.ueberschrittenCent, x.gesamt.verbrauchtCent, 'jeder Cent ist entweder angerechnet oder überschritten');
    }
  });

  test('ohne Polizze → null; ungültiges Jahr wirft', () => {
    assert.equal(jahresStand(null, [], 2026), null);
    assert.throws(() => jahresStand(POLIZZE, [], '2026'), /Jahr/);
  });

  test('die Vorlage selbst: Limits und Maximum in Cent wie in der Polizze (Spec §2)', () => {
    const v = POLIZZE_VORLAGEN.medplusBasic;
    assert.deepEqual(v.kategorien.map((k) => k.limitCent), [160000, 49000, 41500, 41500, 22400]);
    assert.equal(v.maximumCent, 314400);
  });
});

describe('rechnungenDesJahres / alleRechnungen (C1: Rechnungen aus den Quartal-Teilen)', () => {
  const HEUTE = '2026-12-31';
  const teil = (jahr, quartal, ...liste) => liste.reduce((t, r) => rechnungSetzen(t, r, { heute: HEUTE }), leererVersicherungTeil(jahr, quartal));
  const a = rechnung('arzt', 1000, { datum: '2026-02-01', eingereichtAm: '2026-02-02' });
  const b = rechnung('arzt', 2000, { datum: '2026-11-01', eingereichtAm: '2026-11-02' });
  const c = rechnung('physio', 3000, { datum: '2025-12-30', eingereichtAm: '2026-01-02' });
  const teile = { 2025: { 4: teil(2025, 4, c) }, 2026: { 1: teil(2026, 1, a), 4: teil(2026, 4, b) } };

  test('alle Quartale eines Jahres in Reihenfolge der Quartale; fehlende Quartale/Jahre zählen leer', () => {
    assert.deepEqual(rechnungenDesJahres(teile, 2026).map((r) => r.id), [a.id, b.id]);
    assert.deepEqual(rechnungenDesJahres(teile, 2025).map((r) => r.id), [c.id]);
    assert.deepEqual(rechnungenDesJahres(teile, 2024), []);
    assert.deepEqual(rechnungenDesJahres(undefined, 2026), []);
    assert.equal(kat(jahresStand(POLIZZE, rechnungenDesJahres(teile, 2026), 2026), 'arzt').verbrauchtCent, 3000);
  });

  test('alleRechnungen: über alle Jahre (für offene Erstattungen und Erinnerungen)', () => {
    assert.deepEqual(alleRechnungen(teile).map((r) => r.id).sort(), [a.id, b.id, c.id].sort());
    assert.deepEqual(alleRechnungen({}), []);
  });
});

describe('offeneErstattungen', () => {
  test('nur ohne Erstattung; Erinnerung 30 Tage nach dem Einreichen; fällig ab diesem Tag; sortiert', () => {
    assert.equal(ERSTATTUNG_ERINNERUNG_TAGE, 30);
    const a = rechnung('arzt', 1000, { eingereichtAm: '2026-10-10' });
    const b = rechnung('medi', 1000, { eingereichtAm: '2026-09-01' });
    const c = rechnung('medi', 1000, { eingereichtAm: '2026-09-01', erstattetCent: 800, erstattetAm: '2026-10-01' });
    const d = rechnung('heil', 1000, { eingereichtAm: '2026-10-20', erstattetCent: 0, erstattetAm: '2026-10-25' });
    const liste = offeneErstattungen([a, b, c, d], '2026-11-09');
    assert.deepEqual(liste.map((x) => [x.rechnung.id, x.erinnerungAm, x.tageOffen, x.faellig]), [
      [b.id, '2026-10-01', 69, true],
      [a.id, '2026-11-09', 30, true],
    ]);
    assert.equal(offeneErstattungen([a], '2026-11-08')[0].faellig, false);
    assert.deepEqual(offeneErstattungen([], '2026-11-08'), []);
  });

  test('ohne gültiges „heute“ wirft sie', () => {
    assert.throws(() => offeneErstattungen([], undefined));
  });
});

describe('Fix-Runde 2: Rechnungen nach ihrem eigenen Datum, ohne Doppelte (Review M1, M3)', () => {
  const HEUTE = '2026-12-31';
  const r = (id, datum, mehr = {}) => ({ id, kategorie: 'arzt', datum, betragCent: 1000, eingereichtAm: datum, ...mehr });
  const teil = (jahr, quartal, ...liste) => liste.reduce((t, x) => rechnungSetzen(t, x, { heute: HEUTE }), leererVersicherungTeil(jahr, quartal));
  /** Teil mit Rechnungen, die nicht hineingehören (wie von einem beschädigten oder fremden Schreiber), über den Text gelesen. */
  const falschAbgelegt = (jahr, quartal, ...liste) => {
    const kurz = (x) => ({ i: x.id, k: x.kategorie, d: Number(x.datum.replaceAll('-', '')), b: x.betragCent, e: Number(x.eingereichtAm.replaceAll('-', '')) });
    return pruefeVersicherungTeil(JSON.stringify({ v: 1, j: jahr, q: quartal, r: liste.map(kurz) }), { jahr, quartal }).teil;
  };

  test('M1: Rechnung im falschen Teil zählt in ihrem echten Jahr, nicht im Jahr des Teils', () => {
    const falsch = r('falsch01', '2025-01-15');
    const teile = { 2026: { 4: falschAbgelegt(2026, 4, falsch) } };
    assert.deepEqual(rechnungenDesJahres(teile, 2025).map((x) => x.id), ['falsch01']);
    assert.deepEqual(rechnungenDesJahres(teile, 2026), []);
    assert.equal(jahresStand(POLIZZE, rechnungenDesJahres(teile, 2025), 2025).gesamt.verbrauchtCent, 1000);
  });

  test('M1: und bleibt änderbar – rechnungFinden nennt den Teil, in dem sie steht; Ändern = Verschieben an den richtigen Ort', () => {
    const falsch = r('falsch01', '2025-01-15');
    const teile = { 2026: { 4: falschAbgelegt(2026, 4, falsch) } };
    const f = rechnungFinden(teile, 'falsch01');
    assert.deepEqual([f.rechnung.datum, f.von, f.richtig, f.weitere], ['2025-01-15', { jahr: 2026, quartal: 4 }, false, []]);
    assert.equal(rechnungFinden(teile, 'gibtsnix'), null);
    const plan = rechnungTeilWechseln({ ...f.rechnung, betragCent: 1200 }, f.von, { heute: HEUTE });
    assert.deepEqual([plan.nach, plan.jahrEintragen], [{ jahr: 2025, quartal: 1 }, 2025]);
    const neu = plan.inNeu(leererVersicherungTeil(2025, 1));
    const alt = plan.ausAlt(teile[2026][4]);
    assert.deepEqual([neu.rechnungen.map((x) => x.betragCent), alt.rechnungen], [[1200], []]);
  });

  test('M3: abgebrochenes Verschieben (in beiden Teilen richtig abgelegt) → einmal; die zuletzt geschriebene Fassung gilt (Zeitstempel)', () => {
    const alt = r('dopp0001', '2026-02-10');
    const neu = r('dopp0001', '2026-05-10', { betragCent: 2000 });
    const teile = { 2026: { 1: teil(2026, 1, alt), 2: teil(2026, 2, neu) } };
    // ohne Zeitstempel: Ersatzregel – der spätere Teil (Jahr, dann Quartal) gilt
    assert.deepEqual(rechnungenDesJahres(teile, 2026).map((x) => [x.id, x.betragCent]), [['dopp0001', 2000]]);
    const s = jahresStand(POLIZZE, rechnungenDesJahres(teile, 2026), 2026);
    assert.deepEqual([s.gesamt.verbrauchtCent, s.rechnungen.map((x) => x.id)], [2000, ['dopp0001']]);
    // mit Zeitstempeln: der zuletzt geschriebene Teil gilt, auch wenn er früher im Jahr liegt
    const geschrieben = { 2026: { 1: '2026-12-02T10:00:00.000Z', 2: '2026-12-01T10:00:00.000Z' } };
    assert.deepEqual(rechnungenDesJahres(teile, 2026, { geschrieben }).map((x) => x.betragCent), [1000]);
    const f = rechnungFinden(teile, 'dopp0001', { geschrieben });
    assert.deepEqual([f.von, f.richtig, f.weitere], [{ jahr: 2026, quartal: 1 }, true, [{ jahr: 2026, quartal: 2 }]], 'weitere = wo noch eine Kopie steht (zum Aufräumen)');
  });

  test('M3: richtig abgelegt schlägt falsch abgelegt – auch wenn der falsche Teil jünger ist', () => {
    const richtig = r('dopp0002', '2026-02-10');
    const daneben = r('dopp0002', '2026-02-10', { betragCent: 9999 });
    const teile = { 2026: { 1: teil(2026, 1, richtig), 3: falschAbgelegt(2026, 3, daneben) } };
    const geschrieben = { 2026: { 1: '2026-01-01T00:00:00.000Z', 3: '2026-12-01T00:00:00.000Z' } };
    assert.deepEqual(rechnungenDesJahres(teile, 2026, { geschrieben }).map((x) => x.betragCent), [1000]);
    assert.deepEqual(rechnungFinden(teile, 'dopp0002', { geschrieben }).weitere, [{ jahr: 2026, quartal: 3 }]);
  });

  test('M3: über Jahresgrenzen – dieselbe Kennung in 2025 und 2026 zählt nur einmal (in einem Jahr)', () => {
    const alt = r('dopp0003', '2026-01-05');
    const neu = r('dopp0003', '2025-12-30', { eingereichtAm: '2026-01-05' });
    const teile = { 2025: { 4: teil(2025, 4, neu) }, 2026: { 1: teil(2026, 1, alt) } };
    const geschrieben = { 2025: { 4: '2026-01-06T00:00:00.000Z' }, 2026: { 1: '2026-01-05T00:00:00.000Z' } };
    assert.deepEqual([rechnungenDesJahres(teile, 2025, { geschrieben }).length, rechnungenDesJahres(teile, 2026, { geschrieben }).length], [1, 0]);
    assert.deepEqual(alleRechnungen(teile, { geschrieben }).map((x) => x.datum), ['2025-12-30']);
    assert.deepEqual(alleRechnungen(teile).map((x) => x.datum), ['2026-01-05'], 'ohne Zeitstempel: der spätere Teil');
  });
});

describe('Fix-Runde 1 Task 2: die höchste Fassung gilt (I2)', () => {
  const r1 = (mehr) => ({ id: 'rech0001', kategorie: 'physio', datum: '2026-10-28', betragCent: 9000, eingereichtAm: '2026-10-30', ...mehr });
  const teilMit = (jahr, quartal, r) => rechnungSetzen(leererVersicherungTeil(jahr, quartal), r, { heute: '2026-11-08' });

  test('zwei richtig abgelegte Fassungen: die höhere gewinnt – auch gegen einen neueren Zeitstempel des Teils und gegen die Ersatzregel', () => {
    const teile = { 2026: { 3: teilMit(2026, 3, r1({ datum: '2026-09-30', betragCent: 7777, fassung: 11 })), 4: teilMit(2026, 4, r1({ fassung: 10 })) } };
    const geschrieben = { 2026: { 3: '2026-11-08T07:00:00Z', 4: '2026-11-08T09:00:00Z' } };
    for (const g of [undefined, geschrieben]) {
      assert.deepEqual(rechnungenDesJahres(teile, 2026, { geschrieben: g }).map((x) => x.betragCent), [7777]);
      assert.deepEqual(alleRechnungen(teile, { geschrieben: g }).length, 1);
      const f = rechnungFinden(teile, 'rech0001', { geschrieben: g });
      assert.deepEqual([f.von, f.weitere], [{ jahr: 2026, quartal: 3 }, [{ jahr: 2026, quartal: 4 }]]);
    }
  });

  test('mit Fassung vor ohne (ältere Daten), sogar vor einer richtig abgelegten; ohne Fassung auf beiden Seiten die bisherigen Regeln', () => {
    const falsch = { ...leererVersicherungTeil(2026, 3), rechnungen: [r1({ betragCent: 5, fassung: 0 })] };
    const teile = { 2026: { 3: falsch, 4: teilMit(2026, 4, r1()) } };
    assert.deepEqual(rechnungenDesJahres(teile, 2026).map((x) => x.betragCent), [5]);
    const alt = { 2026: { 3: { ...falsch, rechnungen: [r1({ betragCent: 5 })] }, 4: teilMit(2026, 4, r1()) } };
    assert.deepEqual(rechnungenDesJahres(alt, 2026).map((x) => x.betragCent), [9000], 'richtig abgelegt gilt wie bisher');
  });
});
