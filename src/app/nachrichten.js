// Nachrichten an die Krabbelstube bzw. den Kindergarten: fertige, freundliche Texte für typische Situationen
// (krank, einfach zu Hause, später, früher abholen …), jeweils kurz, ausführlich oder herzlich. Reine Textbausteine ohne DOM, damit alle Fälle testbar sind.
// Der Text wird vor dem Senden im Formular angezeigt und kann dort noch frei geändert werden.
import { addDays, isWerktag } from '../domain/dates.js';
import { isFeiertag } from '../domain/feiertage.js';
import { EMAIL_FORM, GRUSSFORMELN, MAX_ANREDE, MAX_EMAIL, MAX_TELEFON, MAX_UNTERSCHRIFT, TELEFON_ZEICHEN } from '../domain/settings.js';
import { datumLang } from './format-de.js';

export { GRUSSFORMELN }; // steht bei den Einstellungen (die Grußformel wird dort gespeichert und geprüft)

/** Vorschläge für „Ansteckende Krankheit“ (frei änderbar). */
export const KRANKHEITEN = Object.freeze(['die Hand-Fuß-Mund-Krankheit', 'eine Bindehautentzündung', 'Scharlach', 'die Windpocken', 'Läuse', 'Corona', 'die Grippe']); // mit Artikel: „hat leider die Windpocken“

/**
 * Anlässe in vier Gruppen. `felder`: welche Angaben das Formular zusätzlich braucht
 * (zeit = Uhrzeit, person = wer abholt, datum = ein Tag, krankheit = Name der Krankheit); `wann`: Heute/Morgen wählbar.
 */
export const ANLAESSE = Object.freeze([
  { id: 'unwohl', gruppe: 'krank', emoji: '🤒', titel: 'Fühlt sich nicht wohl', felder: [], wann: true },
  { id: 'fieber', gruppe: 'krank', emoji: '🌡️', titel: 'Fieber', felder: [], wann: true },
  { id: 'magen', gruppe: 'krank', emoji: '🤢', titel: 'Magen-Darm', felder: [], wann: true },
  { id: 'erkaeltung', gruppe: 'krank', emoji: '🤧', titel: 'Stark erkältet', felder: [], wann: true },
  { id: 'ansteckend', gruppe: 'krank', emoji: '🦠', titel: 'Ansteckende Krankheit', felder: ['krankheit'], wann: false },
  { id: 'laenger', gruppe: 'krank', emoji: '📅', titel: 'Länger krank', felder: ['datum'], wann: false },
  { id: 'gesund', gruppe: 'krank', emoji: '💪', titel: 'Wieder gesund', felder: ['datum'], wann: false },
  { id: 'muede', gruppe: 'zuhause', emoji: '😴', titel: 'Schlecht geschlafen', felder: [], wann: false },
  { id: 'ruhetag', gruppe: 'zuhause', emoji: '😌', titel: 'Ruhetag', felder: [], wann: true },
  { id: 'wirfrei', gruppe: 'zuhause', emoji: '🏡', titel: 'Wir haben frei', felder: [], wann: true },
  { id: 'besuch', gruppe: 'zuhause', emoji: '🤗', titel: 'Familienbesuch', felder: [], wann: true },
  { id: 'ausflug', gruppe: 'zuhause', emoji: '🚗', titel: 'Familienausflug', felder: [], wann: true },
  { id: 'feier', gruppe: 'zuhause', emoji: '🎉', titel: 'Familienfeier', felder: [], wann: true },
  { id: 'spaeter', gruppe: 'zeit', emoji: '🕘', titel: 'Kommt später', felder: ['zeit'], wann: true },
  { id: 'arzt', gruppe: 'zeit', emoji: '🩺', titel: 'Arzttermin', felder: ['zeit'], wann: true },
  { id: 'frueher', gruppe: 'zeit', emoji: '🏃', titel: 'Früher abholen', felder: ['zeit'], wann: true },
  { id: 'abholer', gruppe: 'zeit', emoji: '👵', titel: 'Jemand anderes holt ab', felder: ['person', 'zeit'], wann: true },
  { id: 'vormittags', gruppe: 'zeit', emoji: '🍽️', titel: 'Nur vormittags', felder: ['zeit'], wann: true },
  { id: 'termin', gruppe: 'zeit', emoji: '📋', titel: 'Termin', felder: ['zeit'], wann: true },
  { id: 'frei', gruppe: 'sonst', emoji: '🏖️', titel: 'Urlaub / freie Tage', felder: ['datum'], wann: false },
  { id: 'familie', gruppe: 'sonst', emoji: '👪', titel: 'Familiäre Gründe', felder: [], wann: true },
]);

export const GRUPPEN = Object.freeze([
  ['krank', 'Krank'],
  ['zuhause', 'Einfach zu Hause'],
  ['zeit', 'Bringen & Abholen'],
  ['sonst', 'Sonstiges'],
]);

/** Tonarten der Texte: „normal“ (Ausführlich) ist der Standard. */
export const TONARTEN = Object.freeze([
  ['kurz', 'Kurz'],
  ['normal', 'Ausführlich'],
  ['herzlich', 'Herzlich'],
]);

const gross = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** Grammatik der Einrichtung: „in die Krabbelstube“, aber „in den Kindergarten“; `inder` für „in der Krabbelstube“/„im Kindergarten“. */
export function einrichtungsFormen(einrichtung) {
  return einrichtung === 'Kindergarten'
    ? { team: 'Kindergarten-Team', indie: 'in den Kindergarten', inder: 'im Kindergarten', name: 'Kindergarten', an: 'an den Kindergarten', der: 'des Kindergartens' }
    : { team: 'Krabbelstuben-Team', indie: 'in die Krabbelstube', inder: 'in der Krabbelstube', name: 'Krabbelstube', an: 'an die Krabbelstube', der: 'der Krabbelstube' };
}

/**
 * Name und Pronomen: ohne Angabe zum Kind wird statt „sie“/„er“ der Name wiederholt (nie falsch).
 * `er` = Nominativ, `akk` = Akkusativ („wir holen sie/ihn“), `dat` = Dativ („es geht ihr/ihm besser“; ohne Namen „unserem Kind“).
 */
function personFormen(kindname, geschlecht) {
  const eigen = String(kindname ?? '').trim();
  const name = eigen || 'unser Kind';
  const er = geschlecht === 'w' ? 'sie' : geschlecht === 'm' ? 'er' : name;
  const akk = geschlecht === 'w' ? 'sie' : geschlecht === 'm' ? 'ihn' : name;
  const dat = geschlecht === 'w' ? 'ihr' : geschlecht === 'm' ? 'ihm' : eigen || 'unserem Kind';
  return { name, Name: gross(name), er, Er: gross(er), akk, dat };
}

/** Nächster Werktag nach `datum` (für „kommt am … wieder“): ohne Wochenende und ohne österreichische Feiertage. */
export function naechsterWerktag(datum) {
  let tag = addDays(datum, 1);
  while (!isWerktag(tag) || isFeiertag(tag)) tag = addDays(tag, 1);
  return tag;
}

/** „heute“, „morgen“ oder „am Montag, 13. Oktober“. */
function anTag(datum, heute) {
  if (datum === heute) return 'heute';
  return datum === addDays(heute, 1) ? 'morgen' : `am ${datumLang(datum)}`;
}

/** Die drei Fassungen eines Anlasses: { kurz, normal, herzlich }. */
function fassungen(anlass, w) {
  const { Name, name, er, Er, akk, dat, indie, inder, wann, zeit, person, datum, krankheit, heute } = w;
  const uhr = zeit ? `${zeit} Uhr` : '…';
  switch (anlass) {
    case 'unwohl':
      return {
        kurz: `${Name} fühlt sich nicht wohl und bleibt ${wann} zu Hause.`,
        normal: `${Name} fühlt sich leider nicht wohl und bleibt deshalb ${wann} zu Hause. Wir melden uns, sobald ${er} wieder ${indie} kommen kann.`,
        herzlich: `${Name} fühlt sich leider nicht so gut und darf sich ${wann} zu Hause ausruhen. Sobald es ${dat} besser geht, kommt ${er} gern wieder ${indie}. Danke für das Verständnis!`,
      };
    case 'fieber':
      return {
        kurz: `${Name} hat Fieber und bleibt ${wann} zu Hause.`,
        normal: `${Name} hat Fieber und bleibt ${wann} zu Hause. ${Er} kommt erst wieder, wenn ${er} mindestens 24 Stunden fieberfrei ist.`,
        herzlich: `${Name} hat leider Fieber und bleibt ${wann} zu Hause, um sich gut auszukurieren. ${Er} kommt erst wieder, wenn ${er} mindestens 24 Stunden fieberfrei ist. Danke für das Verständnis!`,
      };
    case 'magen':
      return {
        kurz: `${Name} hat Magen-Darm und bleibt ${wann} zu Hause, bis ${er} 48 Stunden beschwerdefrei ist.`,
        normal: `${Name} hat leider Magen-Darm-Beschwerden (Erbrechen bzw. Durchfall). Damit sich niemand ansteckt, bleibt ${er} ${wann} zu Hause und kommt erst wieder, wenn ${er} 48 Stunden beschwerdefrei ist.`,
        herzlich: `${Name} hat leider Magen-Darm-Beschwerden. Damit sich niemand ansteckt, bleibt ${er} ${wann} zu Hause und kommt erst wieder, wenn ${er} 48 Stunden beschwerdefrei ist. Wir hoffen, dass es schnell besser wird!`,
      };
    case 'erkaeltung':
      return {
        kurz: `${Name} ist stark erkältet und bleibt ${wann} zu Hause.`,
        normal: `${Name} ist stark erkältet und hustet viel. Damit ${er} sich gut auskurieren kann, bleibt ${er} ${wann} zu Hause.`,
        herzlich: `${Name} hat sich eine starke Erkältung eingefangen und hustet viel. Damit ${er} sich gut auskurieren kann, bleibt ${er} ${wann} zu Hause. Wir melden uns, sobald ${er} wieder fit ist.`,
      };
    case 'ansteckend': {
      const was = krankheit || 'eine ansteckende Krankheit';
      return {
        kurz: `${Name} hat ${was} (ärztlich bestätigt) und bleibt bis zum Okay der Ärztin bzw. des Arztes zu Hause.`,
        normal: `${Name} hat leider ${was} (ärztlich bestätigt) und bleibt zu Hause, bis die Ärztin bzw. der Arzt das Okay gibt. Falls nötig, können die anderen Eltern gern informiert werden.`,
        herzlich: `${Name} hat leider ${was} (ärztlich bestätigt). ${Er} bleibt zu Hause, bis die Ärztin bzw. der Arzt das Okay gibt. Gern dürfen auch die anderen Eltern informiert werden, damit sie auf erste Anzeichen achten können. Danke!`,
      };
    }
    case 'laenger': {
      if (!datum) {
        return {
          kurz: `${Name} ist krank und bleibt ein paar Tage zu Hause.`,
          normal: `${Name} ist leider krank und bleibt voraussichtlich ein paar Tage zu Hause. Wir melden uns, sobald ${er} wieder kommen kann.`,
          herzlich: `${Name} ist leider noch krank und braucht etwas mehr Zeit, um sich zu erholen. Wir melden uns, sobald ${er} wieder ${indie} kommen kann.`,
        };
      }
      const bis = datumLang(datum);
      const zurueck = anTag(naechsterWerktag(datum), heute);
      return {
        kurz: `${Name} ist krank und bleibt bis einschließlich ${bis} zu Hause. ${Er} kommt ${zurueck} wieder.`,
        normal: `${Name} ist leider krank und bleibt voraussichtlich bis einschließlich ${bis} zu Hause. ${Er} kommt dann ${zurueck} wieder. Wir melden uns, falls sich daran etwas ändert.`,
        herzlich: `${Name} ist leider noch krank und braucht etwas mehr Zeit, um sich zu erholen. ${Er} bleibt voraussichtlich bis einschließlich ${bis} zu Hause und kommt ${zurueck} wieder ${indie}. Wir melden uns, falls sich etwas ändert.`,
      };
    }
    case 'gesund': {
      const tag = datum ? anTag(datum, heute) : 'morgen';
      return {
        kurz: `${Name} ist wieder gesund und kommt ${tag} wieder.`,
        normal: `${Name} ist wieder gesund und kommt ${tag} wieder ${indie}. Danke für das Verständnis!`,
        herzlich: `Gute Nachrichten: ${Name} ist wieder gesund und freut sich schon, ${tag} wieder ${indie} zu kommen. Danke für die Geduld!`,
      };
    }
    case 'muede':
      return {
        kurz: `${Name} ist heute sehr müde und bleibt deshalb zu Hause.`,
        normal: `${Name} hat heute Nacht leider nicht genug geschlafen und ist sehr müde. Deshalb kommt ${er} heute nicht ${indie}.`,
        herzlich: `${Name} hatte eine unruhige Nacht und ist heute sehr müde. Damit ${er} wieder zu Kräften kommt, bleibt ${er} heute zu Hause. Danke für das Verständnis!`,
      };
    case 'ruhetag':
      return {
        kurz: `${Name} bleibt ${wann} zu Hause und macht einen Ruhetag.`,
        normal: `${Name} ist nach den letzten Tagen etwas erschöpft und darf ${wann} einen ruhigen Tag zu Hause verbringen. ${Er} ist gesund – es ist einfach eine kleine Pause.`,
        herzlich: `${Name} war in letzter Zeit sehr fleißig und ist ein bisschen erschöpft. Deshalb gibt es ${wann} einen gemütlichen Ruhetag zu Hause. Keine Sorge, ${er} ist gesund und kommt danach gern wieder ${indie}.`,
      };
    case 'wirfrei':
      return {
        kurz: `Wir haben ${wann} frei, deshalb bleibt ${name} zu Hause.`,
        normal: `Wir haben ${wann} frei und verbringen den Tag gemeinsam als Familie. Deshalb kommt ${name} nicht ${indie}.`,
        herzlich: `Wir haben ${wann} ausnahmsweise frei und genießen einen gemeinsamen Familientag. ${Name} bleibt deshalb zu Hause und kommt danach gern wieder ${indie}.`,
      };
    case 'besuch':
      return {
        kurz: `${Name} bleibt ${wann} zu Hause, weil wir Besuch haben.`,
        normal: `Bei uns ist ${wann} Familienbesuch, deshalb bleibt ${name} zu Hause und verbringt den Tag mit der Familie.`,
        herzlich: `Bei uns ist ${wann} lieber Besuch aus der Familie da, und ${name} freut sich schon sehr darauf. Deshalb bleibt ${er} zu Hause und kommt danach gern wieder ${indie}.`,
      };
    case 'ausflug':
      return {
        kurz: `${Name} kommt ${wann} nicht, wir machen einen Familienausflug.`,
        normal: `Wir machen ${wann} einen Familienausflug, deshalb kommt ${name} nicht ${indie}.`,
        herzlich: `Wir machen ${wann} einen gemeinsamen Familienausflug, und ${name} freut sich schon riesig darauf. Deshalb kommt ${er} nicht ${indie}. Bis bald!`,
      };
    case 'feier':
      return {
        kurz: `${Name} bleibt ${wann} wegen einer Familienfeier zu Hause.`,
        normal: `Wir haben ${wann} eine Familienfeier, deshalb bleibt ${name} zu Hause.`,
        herzlich: `Bei uns wird ${wann} in der Familie gefeiert, und ${name} ist natürlich mit dabei. Deshalb kommt ${er} nicht ${indie}. Bis bald!`,
      };
    case 'spaeter':
      return {
        kurz: `${Name} kommt ${wann} gegen ${uhr}.`,
        normal: `${Name} kommt ${wann} etwas später ${indie}, voraussichtlich gegen ${uhr}.`,
        herzlich: `Bei uns wird es ${wann} etwas später: ${Name} kommt voraussichtlich gegen ${uhr} ${indie}. Danke für das Verständnis!`,
      };
    case 'arzt':
      return {
        kurz: `${Name} hat ${wann} um ${uhr} einen Arzttermin und kommt danach.`,
        normal: `${Name} hat ${wann} um ${uhr} einen Arzttermin und kommt danach ${indie}. Falls es länger dauert, melden wir uns.`,
        herzlich: `${Name} hat ${wann} um ${uhr} einen Arzttermin. Danach bringen wir ${akk} gern ${indie}. Falls es länger dauert, geben wir kurz Bescheid. Danke!`,
      };
    case 'frueher':
      return {
        kurz: `Wir holen ${name} ${wann} um ${uhr} ab.`,
        normal: `Wir holen ${name} ${wann} schon um ${uhr} ab.`,
        herzlich: `Kurze Info: Wir holen ${name} ${wann} schon um ${uhr} ab. Vielen Dank und bis später!`,
      };
    case 'abholer': {
      const wer = person?.trim() || '…';
      const um = zeit ? ` gegen ${uhr}` : '';
      return {
        kurz: `${gross(wann)} holt ${wer} ${name}${um} ab.`,
        normal: `${gross(wann)} holt ${wer} ${name}${um} ab. ${gross(wer)} kann sich bei Bedarf gern ausweisen.`,
        herzlich: `Kurze Info: ${gross(wann)} holt ${wer} ${name}${um} ab. ${gross(wer)} kann sich bei Bedarf gern ausweisen. Danke!`,
      };
    }
    case 'vormittags':
      return {
        kurz: `Wir holen ${name} ${wann} nach dem Mittagessen${zeit ? ` um ${uhr}` : ''} ab.`,
        normal: `${Name} bleibt ${wann} nur bis nach dem Mittagessen ${inder}. Wir holen ${akk}${zeit ? ` gegen ${uhr}` : ' direkt nach dem Mittagessen'} ab.`,
        herzlich: `Kurze Info: ${Name} bleibt ${wann} nur am Vormittag ${inder}. Wir holen ${akk}${zeit ? ` gegen ${uhr}` : ' nach dem Mittagessen'} ab. Danke!`,
      };
    case 'termin':
      return {
        kurz: `${Name} hat ${wann} um ${uhr} einen Termin und kommt danach ${indie}.`,
        normal: `Wir haben ${wann} um ${uhr} einen wichtigen Termin, zu dem ${name} mitkommt. Danach bringen wir ${akk} ${indie}. Falls es länger dauert, melden wir uns.`,
        herzlich: `Wir haben ${wann} um ${uhr} einen Termin, zu dem ${name} mitkommen muss. Danach bringen wir ${akk} gern ${indie}. Falls es länger dauert, geben wir kurz Bescheid. Danke!`,
      };
    case 'frei': {
      if (!datum) {
        return {
          kurz: `${Name} hat ein paar Tage frei.`,
          normal: `${Name} hat ein paar Tage frei (Familienurlaub). Wir sagen rechtzeitig Bescheid, wann ${er} wiederkommt.`,
          herzlich: `Wir machen ein paar Tage Familienurlaub. Wir sagen rechtzeitig Bescheid, wann ${name} wieder ${indie} kommt. Bis bald!`,
        };
      }
      const bis = datumLang(datum);
      const zurueck = anTag(naechsterWerktag(datum), heute);
      return {
        kurz: `${Name} hat bis einschließlich ${bis} frei und kommt ${zurueck} wieder.`,
        normal: `${Name} hat bis einschließlich ${bis} frei (Familienurlaub) und kommt ${zurueck} wieder ${indie}.`,
        herzlich: `Wir machen Familienurlaub: ${Name} hat bis einschließlich ${bis} frei und kommt ${zurueck} erholt wieder ${indie}. Bis bald!`,
      };
    }
    case 'familie':
      return {
        kurz: `${Name} bleibt ${wann} zu Hause.`,
        normal: `${Name} bleibt ${wann} aus familiären Gründen zu Hause.`,
        herzlich: `${Name} bleibt ${wann} aus familiären Gründen zu Hause. Danke für das Verständnis!`,
      };
    default:
      throw new Error(`Unbekannter Anlass: ${anlass}`);
  }
}

/** Standard-Unterschrift, wenn in den Einstellungen nichts eingetragen ist. */
export function standardUnterschrift(kindname) {
  const name = String(kindname ?? '').trim();
  return name ? `Die Eltern von ${name}` : 'Die Eltern';
}

/** Anrede ohne Satzzeichen am Ende (das Komma setzt die Nachricht selbst). */
const anredeBereinigt = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[\s,;:.!?]+$/, '');

/**
 * Fertige Nachricht. `anlass` = id aus ANLAESSE; `angaben` = { kindname, geschlecht ('w' | 'm' | ''), einrichtung ('Krabbelstube' | 'Kindergarten'),
 * anrede ('' = „Liebes …-Team“), ton (id aus TONARTEN, sonst „normal“), gruss, unterschrift, tag ('heute' | 'morgen'), zeit ('HH:MM'), person,
 * datum ('JJJJ-MM-TT'), krankheit, heute ('JJJJ-MM-TT') }.
 */
export function nachrichtText(anlass, angaben = {}) {
  const e = einrichtungsFormen(angaben.einrichtung);
  const p = personFormen(angaben.kindname, angaben.geschlecht);
  const anrede = anredeBereinigt(angaben.anrede) || `Liebes ${e.team}`;
  const ton = TONARTEN.some(([id]) => id === angaben.ton) ? angaben.ton : 'normal';
  const gruss = GRUSSFORMELN.includes(angaben.gruss) ? angaben.gruss : GRUSSFORMELN[0];
  const unterschrift = String(angaben.unterschrift ?? '').trim() || standardUnterschrift(angaben.kindname);
  const kern = fassungen(anlass, { ...p, indie: e.indie, inder: e.inder, wann: angaben.tag === 'morgen' ? 'morgen' : 'heute', zeit: angaben.zeit, person: angaben.person, datum: angaben.datum, krankheit: angaben.krankheit?.trim(), heute: angaben.heute })[ton];
  return `${anrede},\n\n${kern}\n\n${gruss}\n${unterschrift}`;
}

/** Betreff für E-Mails, z. B. „Iris – heute nicht in der Krabbelstube“. */
export function nachrichtBetreff(anlass, angaben = {}) {
  const { Name } = personFormen(angaben.kindname, angaben.geschlecht);
  const titel = ANLAESSE.find((a) => a.id === anlass)?.titel ?? 'Nachricht';
  return `${Name}: ${titel}`;
}

/** Nur Ziffern und „+“; die oft geschriebene „(0)“ nach der Ländervorwahl („+43 (0)664 …“) fällt weg. */
const telefonZiffern = (telefon) => String(telefon ?? '').replace(/\(0\)/g, '').replace(/[^\d+]/g, '');

/** Telefonnummer für wa.me: nur Ziffern mit Ländervorwahl; eine österreichische 0 am Anfang wird zu 43. Leer, wenn unbrauchbar. */
export function whatsappNummer(telefon) {
  let n = telefonZiffern(telefon);
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = `43${n.slice(1)}`;
  return /^\d{7,15}$/.test(n) ? n : '';
}

/** Links zum Senden: WhatsApp, SMS (iPhone und Android) und E-Mail. Fehlt die Angabe, ist der Link null. */
export function sendeLinks({ telefon = '', email = '', text, betreff }) {
  const t = encodeURIComponent(text);
  const wa = whatsappNummer(telefon);
  const sms = telefonZiffern(telefon);
  return {
    whatsapp: wa ? `https://wa.me/${wa}?text=${t}` : null,
    sms: sms ? `sms:${sms}?&body=${t}` : null,
    email: email ? `mailto:${String(email).trim()}?subject=${encodeURIComponent(betreff)}&body=${t}` : null,
  };
}

// Eingaben in „Mehr“ → „Nachrichten“ prüfen: { wert } zum Speichern oder { fehler } mit dem Grund (für die Meldung).
const einzeilig = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Telefonnummer der Einrichtung: '' = keine; sonst mit Vorwahl (0… oder +43 …) und 7 bis 15 Ziffern, damit WhatsApp und SMS sie finden. */
export function telefonEingabe(text) {
  const t = einzeilig(text);
  if (t === '') return { wert: '' };
  if (!TELEFON_ZEICHEN.test(t)) return { fehler: 'Telefon: bitte nur Ziffern, Leerzeichen und + - / ( ) verwenden.' };
  if (t.length > MAX_TELEFON) return { fehler: `Telefon: höchstens ${MAX_TELEFON} Zeichen.` };
  const ziffern = telefonZiffern(t);
  if (!/^[+0]/.test(ziffern) || !whatsappNummer(t)) return { fehler: 'Telefon: bitte die ganze Nummer mit Vorwahl eingeben, z. B. 0664 1234567 oder +43 664 1234567.' };
  return { wert: t };
}

/** E-Mail-Adresse der Einrichtung: '' = keine; sonst etwas@etwas.etwas. */
export function emailEingabe(text) {
  const t = String(text ?? '').trim();
  if (t === '') return { wert: '' };
  if (t.length > MAX_EMAIL) return { fehler: `E-Mail: höchstens ${MAX_EMAIL} Zeichen.` };
  if (!EMAIL_FORM.test(t)) return { fehler: 'E-Mail: das ist keine gültige Adresse (so sieht eine aus: name@beispiel.at).' };
  return { wert: t };
}

/** Unterschrift: eine Zeile; '' = Standard („Die Eltern von …“). */
export function unterschriftEingabe(text) {
  const t = einzeilig(text);
  if (t.length > MAX_UNTERSCHRIFT) return { fehler: `Unterschrift: höchstens ${MAX_UNTERSCHRIFT} Zeichen.` };
  return { wert: t };
}

/** Anrede: eine Zeile ohne Satzzeichen am Ende; '' = Standard („Liebes Krabbelstuben-Team“). */
export function anredeEingabe(text) {
  const t = anredeBereinigt(text);
  if (t.length > MAX_ANREDE) return { fehler: `Anrede: höchstens ${MAX_ANREDE} Zeichen.` };
  return { wert: t };
}
