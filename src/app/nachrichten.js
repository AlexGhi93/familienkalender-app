// Nachrichten an die Krabbelstube bzw. den Kindergarten: fertige, freundliche Texte für typische Situationen
// (krank, später, früher abholen, jemand anderes holt ab …). Reine Textbausteine ohne DOM, damit alle Fälle testbar sind.
// Der Text wird vor dem Senden im Formular angezeigt und kann dort noch frei geändert werden.
import { addDays, isWerktag } from '../domain/dates.js';
import { datumLang } from './format-de.js';

export const GRUSSFORMELN = Object.freeze(['Liebe Grüße', 'Viele Grüße', 'Mit freundlichen Grüßen']);

/** Vorschläge für „Ansteckende Krankheit“ (frei änderbar). */
export const KRANKHEITEN = Object.freeze(['Hand-Fuß-Mund-Krankheit', 'Bindehautentzündung', 'Scharlach', 'Windpocken', 'Läuse', 'Corona', 'Grippe']);

/**
 * Anlässe in drei Gruppen. `felder`: welche Angaben das Formular zusätzlich braucht
 * (zeit = Uhrzeit, person = wer abholt, datum = ein Tag, krankheit = Name der Krankheit); `wann`: Heute/Morgen wählbar.
 */
export const ANLAESSE = Object.freeze([
  { id: 'unwohl', gruppe: 'krank', emoji: '🤒', titel: 'Fühlt sich nicht wohl', felder: [], wann: true },
  { id: 'muede', gruppe: 'krank', emoji: '😴', titel: 'Schlecht geschlafen', felder: [], wann: false },
  { id: 'fieber', gruppe: 'krank', emoji: '🌡️', titel: 'Fieber', felder: [], wann: true },
  { id: 'magen', gruppe: 'krank', emoji: '🤢', titel: 'Magen-Darm', felder: [], wann: true },
  { id: 'erkaeltung', gruppe: 'krank', emoji: '🤧', titel: 'Stark erkältet', felder: [], wann: true },
  { id: 'ansteckend', gruppe: 'krank', emoji: '🦠', titel: 'Ansteckende Krankheit', felder: ['krankheit'], wann: false },
  { id: 'laenger', gruppe: 'krank', emoji: '📅', titel: 'Länger krank', felder: ['datum'], wann: false },
  { id: 'gesund', gruppe: 'krank', emoji: '💪', titel: 'Wieder gesund', felder: ['datum'], wann: false },
  { id: 'spaeter', gruppe: 'zeit', emoji: '🕘', titel: 'Kommt später', felder: ['zeit'], wann: true },
  { id: 'arzt', gruppe: 'zeit', emoji: '🩺', titel: 'Arzttermin', felder: ['zeit'], wann: true },
  { id: 'frueher', gruppe: 'zeit', emoji: '🏃', titel: 'Früher abholen', felder: ['zeit'], wann: true },
  { id: 'abholer', gruppe: 'zeit', emoji: '👵', titel: 'Jemand anderes holt ab', felder: ['person', 'zeit'], wann: true },
  { id: 'frei', gruppe: 'sonst', emoji: '🏖️', titel: 'Urlaub / freie Tage', felder: ['datum'], wann: false },
  { id: 'familie', gruppe: 'sonst', emoji: '👪', titel: 'Familiäre Gründe', felder: [], wann: true },
]);

export const GRUPPEN = Object.freeze([
  ['krank', 'Krank'],
  ['zeit', 'Bringen & Abholen'],
  ['sonst', 'Sonstiges'],
]);

const gross = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Grammatik der Einrichtung: „in die Krabbelstube“, aber „in den Kindergarten“. */
function einrichtungsFormen(einrichtung) {
  return einrichtung === 'Kindergarten'
    ? { team: 'Kindergarten-Team', indie: 'in den Kindergarten', name: 'Kindergarten' }
    : { team: 'Krabbelstuben-Team', indie: 'in die Krabbelstube', name: 'Krabbelstube' };
}

/** Name und Pronomen: ohne Angabe zum Kind wird statt „sie“/„er“ der Name wiederholt (nie falsch). */
function personFormen(kindname, geschlecht) {
  const name = String(kindname ?? '').trim() || 'unser Kind';
  const er = geschlecht === 'w' ? 'sie' : geschlecht === 'm' ? 'er' : name;
  return { name, Name: gross(name), er, Er: gross(er) };
}

/** Nächster Werktag nach `datum` (für „kommt am … wieder“). */
export function naechsterWerktag(datum) {
  let tag = addDays(datum, 1);
  while (!isWerktag(tag)) tag = addDays(tag, 1);
  return tag;
}

/** „morgen“, wenn `datum` der Tag nach `heute` ist, sonst „am Montag, 13. Oktober“. */
function anTag(datum, heute) {
  return datum === addDays(heute, 1) ? 'morgen' : `am ${datumLang(datum)}`;
}

function satz(anlass, w) {
  const { Name, name, er, Er, indie, wann, zeit, person, datum, krankheit, heute } = w;
  const uhr = zeit ? `${zeit} Uhr` : '…';
  switch (anlass) {
    case 'unwohl':
      return `${Name} fühlt sich leider nicht wohl und bleibt deshalb ${wann} zu Hause. Wir melden uns, sobald ${er} wieder ${indie} kommen kann.`;
    case 'muede':
      return `${Name} hat heute Nacht leider nicht genug geschlafen und ist sehr müde. Deshalb kommt ${er} heute nicht ${indie}.`;
    case 'fieber':
      return `${Name} hat Fieber und bleibt ${wann} zu Hause. ${Er} kommt erst wieder, wenn ${er} mindestens 24 Stunden fieberfrei ist.`;
    case 'magen':
      return `${Name} hat leider Magen-Darm-Beschwerden (Erbrechen bzw. Durchfall). Damit sich niemand ansteckt, bleibt ${er} ${wann} zu Hause und kommt erst wieder, wenn ${er} 48 Stunden beschwerdefrei ist.`;
    case 'erkaeltung':
      return `${Name} ist stark erkältet und hustet viel. Damit ${er} sich gut auskurieren kann, bleibt ${er} ${wann} zu Hause.`;
    case 'ansteckend':
      return `${Name} hat ${krankheit ? `leider ${krankheit}` : 'leider eine ansteckende Krankheit'} (ärztlich bestätigt) und bleibt zu Hause, bis die Ärztin bzw. der Arzt das Okay gibt. Falls nötig, können die anderen Eltern gern informiert werden.`;
    case 'laenger':
      return datum
        ? `${Name} ist leider krank und bleibt voraussichtlich bis einschließlich ${datumLang(datum)} zu Hause. ${Er} kommt dann ${anTag(naechsterWerktag(datum), heute)} wieder. Wir melden uns, falls sich daran etwas ändert.`
        : `${Name} ist leider krank und bleibt voraussichtlich ein paar Tage zu Hause. Wir melden uns, sobald ${er} wieder kommen kann.`;
    case 'gesund':
      return `${Name} ist wieder gesund und kommt ${datum ? anTag(datum, heute) : 'morgen'} wieder ${indie}. Danke für das Verständnis!`;
    case 'spaeter':
      return `${Name} kommt ${wann} etwas später ${indie}, voraussichtlich gegen ${uhr}.`;
    case 'arzt':
      return `${Name} hat ${wann} um ${uhr} einen Arzttermin und kommt danach ${indie}. Falls es länger dauert, melden wir uns.`;
    case 'frueher':
      return `Wir holen ${name} ${wann} schon um ${uhr} ab.`;
    case 'abholer': {
      const wer = person?.trim() || '…';
      return `${gross(wann)} holt ${wer} ${name}${zeit ? ` gegen ${uhr}` : ''} ab. ${gross(wer)} kann sich bei Bedarf gern ausweisen.`;
    }
    case 'frei':
      return datum
        ? `${Name} hat bis einschließlich ${datumLang(datum)} frei (Familienurlaub) und kommt ${anTag(naechsterWerktag(datum), heute)} wieder ${indie}.`
        : `${Name} hat ein paar Tage frei (Familienurlaub). Wir sagen rechtzeitig Bescheid, wann ${er} wiederkommt.`;
    case 'familie':
      return `${Name} bleibt ${wann} aus familiären Gründen zu Hause.`;
    default:
      throw new Error(`Unbekannter Anlass: ${anlass}`);
  }
}

/** Standard-Unterschrift, wenn in den Einstellungen nichts eingetragen ist. */
export function standardUnterschrift(kindname) {
  const name = String(kindname ?? '').trim();
  return name ? `Die Eltern von ${name}` : 'Die Eltern';
}

/**
 * Fertige Nachricht. `anlass` = id aus ANLAESSE; `angaben` = { kindname, geschlecht ('w' | 'm' | ''), einrichtung ('Krabbelstube' | 'Kindergarten'),
 * gruss, unterschrift, tag ('heute' | 'morgen'), zeit ('HH:MM'), person, datum ('JJJJ-MM-TT'), krankheit, heute ('JJJJ-MM-TT') }.
 */
export function nachrichtText(anlass, angaben = {}) {
  const e = einrichtungsFormen(angaben.einrichtung);
  const p = personFormen(angaben.kindname, angaben.geschlecht);
  const gruss = GRUSSFORMELN.includes(angaben.gruss) ? angaben.gruss : GRUSSFORMELN[0];
  const unterschrift = String(angaben.unterschrift ?? '').trim() || standardUnterschrift(angaben.kindname);
  const kern = satz(anlass, { ...p, indie: e.indie, wann: angaben.tag === 'morgen' ? 'morgen' : 'heute', zeit: angaben.zeit, person: angaben.person, datum: angaben.datum, krankheit: angaben.krankheit?.trim(), heute: angaben.heute });
  return `Liebes ${e.team},\n\n${kern}\n\n${gruss}\n${unterschrift}`;
}

/** Betreff für E-Mails, z. B. „Iris – heute nicht in der Krabbelstube“. */
export function nachrichtBetreff(anlass, angaben = {}) {
  const { Name } = personFormen(angaben.kindname, angaben.geschlecht);
  const titel = ANLAESSE.find((a) => a.id === anlass)?.titel ?? 'Nachricht';
  return `${Name}: ${titel}`;
}

/** Telefonnummer für wa.me: nur Ziffern mit Ländervorwahl; eine österreichische 0 am Anfang wird zu 43. Leer, wenn unbrauchbar. */
export function whatsappNummer(telefon) {
  let n = String(telefon ?? '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = `43${n.slice(1)}`;
  return /^\d{7,15}$/.test(n) ? n : '';
}

/** Links zum Senden: WhatsApp, SMS (iPhone und Android) und E-Mail. Fehlt die Angabe, ist der Link null. */
export function sendeLinks({ telefon = '', email = '', text, betreff }) {
  const t = encodeURIComponent(text);
  const wa = whatsappNummer(telefon);
  const sms = String(telefon ?? '').replace(/[^\d+]/g, '');
  return {
    whatsapp: wa ? `https://wa.me/${wa}?text=${t}` : null,
    sms: sms ? `sms:${sms}?&body=${t}` : null,
    email: email ? `mailto:${String(email).trim()}?subject=${encodeURIComponent(betreff)}&body=${t}` : null,
  };
}
