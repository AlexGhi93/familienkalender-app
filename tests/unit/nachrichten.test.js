// Nachrichten an Krabbelstube/Kindergarten: jeder Anlass ergibt einen Text, Grammatik je Einrichtung, sie/er/Name, Links zum Senden.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ANLAESSE, GRUPPEN, GRUSSFORMELN, KRANKHEITEN, nachrichtBetreff, nachrichtText, naechsterWerktag, sendeLinks, standardUnterschrift, whatsappNummer } from '../../src/app/nachrichten.js';

const heute = '2026-10-14'; // Mittwoch
const voll = { kindname: 'Iris', geschlecht: 'w', einrichtung: 'Krabbelstube', tag: 'heute', zeit: '09:30', person: 'Oma', datum: '2026-10-16', krankheit: 'Scharlach', heute };
const kern = (text) => text.split('\n\n')[1];

describe('Anlässe', () => {
  test('eindeutige IDs, bekannte Gruppen und Felder', () => {
    const ids = ANLAESSE.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    const gruppen = GRUPPEN.map(([id]) => id);
    for (const a of ANLAESSE) {
      assert.ok(gruppen.includes(a.gruppe), a.id);
      for (const f of a.felder) assert.ok(['zeit', 'person', 'datum', 'krankheit'].includes(f), `${a.id}: ${f}`);
      assert.equal(typeof a.wann, 'boolean');
    }
    assert.ok(KRANKHEITEN.length > 0);
    assert.ok(Object.isFrozen(ANLAESSE));
  });

  for (const a of ANLAESSE) {
    for (const einrichtung of ['Krabbelstube', 'Kindergarten']) {
      for (const angaben of [voll, { einrichtung }, { einrichtung, kindname: '  ', geschlecht: 'm' }]) {
        test(`${a.id} (${einrichtung}, ${angaben.kindname?.trim() || 'ohne Name'}) ergibt einen vollständigen Text`, () => {
          const text = nachrichtText(a.id, { ...angaben, einrichtung });
          const team = einrichtung === 'Kindergarten' ? 'Kindergarten-Team' : 'Krabbelstuben-Team';
          assert.ok(text.startsWith(`Liebes ${team},\n\n`), text);
          assert.ok(text.endsWith(`\n\nLiebe Grüße\n${standardUnterschrift(angaben.kindname)}`), text);
          assert.ok(kern(text).length > 20);
          assert.doesNotMatch(text, /undefined|null|NaN|\$\{/);
          assert.doesNotMatch(text, /  /); // keine doppelten Leerzeichen
        });
      }
    }
  }

  test('unbekannter Anlass wirft', () => {
    assert.throws(() => nachrichtText('urlaubsreif', voll), /Unbekannter Anlass/);
  });
});

describe('Grammatik der Einrichtung', () => {
  test('„in die Krabbelstube“, aber „in den Kindergarten“', () => {
    assert.match(nachrichtText('spaeter', { ...voll, einrichtung: 'Krabbelstube' }), /später in die Krabbelstube,/);
    assert.match(nachrichtText('spaeter', { ...voll, einrichtung: 'Kindergarten' }), /später in den Kindergarten,/);
    assert.match(nachrichtText('gesund', { ...voll, einrichtung: 'Kindergarten' }), /wieder in den Kindergarten\./);
    assert.match(nachrichtText('muede', { ...voll, einrichtung: 'Krabbelstube' }), /heute nicht in die Krabbelstube\./);
    assert.doesNotMatch(nachrichtText('unwohl', { ...voll, einrichtung: 'Kindergarten' }), /Krabbelstube/);
  });

  test('ohne Angabe gilt Krabbelstube', () => {
    assert.match(nachrichtText('unwohl', {}), /^Liebes Krabbelstuben-Team,/);
  });
});

describe('sie, er oder der Name', () => {
  test('weiblich, männlich, ohne Angabe', () => {
    assert.equal(kern(nachrichtText('fieber', { kindname: 'Iris', geschlecht: 'w' })), 'Iris hat Fieber und bleibt heute zu Hause. Sie kommt erst wieder, wenn sie mindestens 24 Stunden fieberfrei ist.');
    assert.equal(kern(nachrichtText('fieber', { kindname: 'Max', geschlecht: 'm' })), 'Max hat Fieber und bleibt heute zu Hause. Er kommt erst wieder, wenn er mindestens 24 Stunden fieberfrei ist.');
    assert.equal(kern(nachrichtText('fieber', { kindname: 'Kim', geschlecht: '' })), 'Kim hat Fieber und bleibt heute zu Hause. Kim kommt erst wieder, wenn Kim mindestens 24 Stunden fieberfrei ist.');
  });

  test('ohne Namen „unser Kind“ (am Satzanfang groß), Unterschrift „Die Eltern“', () => {
    const text = nachrichtText('unwohl', { tag: 'morgen' });
    assert.equal(kern(text), 'Unser Kind fühlt sich leider nicht wohl und bleibt deshalb morgen zu Hause. Wir melden uns, sobald unser Kind wieder in die Krabbelstube kommen kann.');
    assert.ok(text.endsWith('\nDie Eltern'));
    assert.equal(kern(nachrichtText('frueher', { zeit: '14:00' })), 'Wir holen unser Kind heute schon um 14:00 Uhr ab.');
  });

  test('ein klein geschriebener Name wird am Satzanfang groß', () => {
    assert.match(kern(nachrichtText('familie', { kindname: 'iris' })), /^Iris bleibt heute aus familiären Gründen zu Hause\.$/);
  });
});

describe('Angaben im Text', () => {
  test('Uhrzeit, ohne Uhrzeit „…“', () => {
    assert.match(kern(nachrichtText('spaeter', voll)), /gegen 09:30 Uhr\.$/);
    assert.match(kern(nachrichtText('arzt', { ...voll, zeit: '' })), /um … einen Arzttermin/);
  });

  test('jemand anderes holt ab', () => {
    assert.equal(kern(nachrichtText('abholer', { ...voll, tag: 'morgen', person: ' Oma ', zeit: '15:00' })), 'Morgen holt Oma Iris gegen 15:00 Uhr ab. Oma kann sich bei Bedarf gern ausweisen.');
    assert.equal(kern(nachrichtText('abholer', { kindname: 'Iris', person: 'opa Karl' })), 'Heute holt opa Karl Iris ab. Opa Karl kann sich bei Bedarf gern ausweisen.');
    assert.equal(kern(nachrichtText('abholer', { kindname: 'Iris' })), 'Heute holt … Iris ab. … kann sich bei Bedarf gern ausweisen.');
  });

  test('ansteckende Krankheit (frei änderbar)', () => {
    assert.match(kern(nachrichtText('ansteckend', { ...voll, krankheit: '  Windpocken ' })), /^Iris hat leider Windpocken \(ärztlich bestätigt\)/);
    assert.match(kern(nachrichtText('ansteckend', { ...voll, krankheit: '' })), /^Iris hat leider eine ansteckende Krankheit/);
  });

  test('länger krank: bis wann und wann sie wiederkommt', () => {
    assert.equal(
      kern(nachrichtText('laenger', { ...voll, datum: '2026-10-16' })),
      'Iris ist leider krank und bleibt voraussichtlich bis einschließlich Freitag, 16. Oktober zu Hause. Sie kommt dann am Montag, 19. Oktober wieder. Wir melden uns, falls sich daran etwas ändert.',
    );
    assert.match(kern(nachrichtText('laenger', { ...voll, datum: heute })), /Sie kommt dann morgen wieder\./);
    assert.match(kern(nachrichtText('laenger', { ...voll, datum: '' })), /ein paar Tage zu Hause\. Wir melden uns, sobald sie wieder kommen kann\.$/);
  });

  test('wieder gesund: morgen oder an einem bestimmten Tag', () => {
    assert.match(kern(nachrichtText('gesund', { ...voll, datum: '2026-10-15' })), /kommt morgen wieder/);
    assert.match(kern(nachrichtText('gesund', { ...voll, datum: '2026-10-19' })), /kommt am Montag, 19\. Oktober wieder/);
    assert.match(kern(nachrichtText('gesund', { ...voll, datum: '' })), /kommt morgen wieder/);
  });

  test('Urlaub / freie Tage', () => {
    assert.equal(kern(nachrichtText('frei', { ...voll, datum: '2026-10-16' })), 'Iris hat bis einschließlich Freitag, 16. Oktober frei (Familienurlaub) und kommt am Montag, 19. Oktober wieder in die Krabbelstube.');
    assert.match(kern(nachrichtText('frei', { kindname: 'Max', geschlecht: 'm' })), /wann er wiederkommt\.$/);
  });

  test('Grußformel und Unterschrift', () => {
    assert.ok(nachrichtText('familie', { ...voll, gruss: 'Viele Grüße' }).endsWith('\n\nViele Grüße\nDie Eltern von Iris'));
    assert.ok(nachrichtText('familie', { ...voll, gruss: 'Servus' }).endsWith('\n\nLiebe Grüße\nDie Eltern von Iris'));
    assert.ok(nachrichtText('familie', { ...voll, unterschrift: '  Anna und Ben ' }).endsWith('\nAnna und Ben'));
    assert.deepEqual(GRUSSFORMELN, ['Liebe Grüße', 'Viele Grüße', 'Mit freundlichen Grüßen']);
  });
});

describe('naechsterWerktag', () => {
  test('überspringt das Wochenende', () => {
    assert.equal(naechsterWerktag('2026-10-14'), '2026-10-15');
    assert.equal(naechsterWerktag('2026-10-16'), '2026-10-19');
    assert.equal(naechsterWerktag('2026-10-17'), '2026-10-19');
  });

  test(
    'überspringt auch Feiertage (Nationalfeiertag am Montag, 26.10.2026)',
    { todo: 'Vermuteter Fehler: naechsterWerktag (nachrichten.js:56) kennt keine Feiertage → „kommt am Montag, 26. Oktober wieder“' },
    () => {
      assert.equal(naechsterWerktag('2026-10-23'), '2026-10-27');
    },
  );
});

describe('Betreff und Senden', () => {
  test('Betreff', () => {
    assert.equal(nachrichtBetreff('fieber', { kindname: 'iris' }), 'Iris: Fieber');
    assert.equal(nachrichtBetreff('abholer', {}), 'Unser Kind: Jemand anderes holt ab');
    assert.equal(nachrichtBetreff('gibtsnicht', { kindname: 'Iris' }), 'Iris: Nachricht');
  });

  test('whatsappNummer: österreichische Schreibweisen → internationale Ziffern', () => {
    assert.equal(whatsappNummer('0664 123 4567'), '436641234567');
    assert.equal(whatsappNummer('0664/1234567'), '436641234567');
    assert.equal(whatsappNummer('+43 664 1234567'), '436641234567');
    assert.equal(whatsappNummer('0043 664 1234567'), '436641234567');
    assert.equal(whatsappNummer('+49 151 12345678'), '4915112345678');
    assert.equal(whatsappNummer('123'), '');
    assert.equal(whatsappNummer('1'.repeat(16)), '');
    assert.equal(whatsappNummer(''), '');
    assert.equal(whatsappNummer(undefined), '');
  });

  test('sendeLinks: WhatsApp, SMS und E-Mail; fehlt die Angabe, ist der Link null', () => {
    const text = 'Liebe Grüße & bis morgen?';
    const l = sendeLinks({ telefon: '0664 123 4567', email: ' kita@example.at ', text, betreff: 'Iris: Fieber' });
    assert.equal(l.whatsapp, `https://wa.me/436641234567?text=${encodeURIComponent(text)}`);
    assert.equal(l.sms, `sms:06641234567?&body=${encodeURIComponent(text)}`);
    assert.equal(l.email, `mailto:kita@example.at?subject=Iris%3A%20Fieber&body=${encodeURIComponent(text)}`);
    assert.deepEqual(sendeLinks({ text, betreff: 'x' }), { whatsapp: null, sms: null, email: null });
    assert.equal(sendeLinks({ telefon: '+43 664 1234567', text, betreff: 'x' }).sms, `sms:+436641234567?&body=${encodeURIComponent(text)}`);
    // zu kurze Nummer: kein WhatsApp-Link, SMS bleibt möglich
    const kurz = sendeLinks({ telefon: '112', text, betreff: 'x' });
    assert.equal(kurz.whatsapp, null);
    assert.ok(kurz.sms.startsWith('sms:112?'));
  });

  test('standardUnterschrift', () => {
    assert.equal(standardUnterschrift(' Iris '), 'Die Eltern von Iris');
    assert.equal(standardUnterschrift(''), 'Die Eltern');
    assert.equal(standardUnterschrift(undefined), 'Die Eltern');
  });
});
