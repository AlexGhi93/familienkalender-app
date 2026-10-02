export const CALENDARS = Object.freeze({
  TERMINE: 'termine',
  ABWESENHEIT: 'abwesenheit',
  ANWESENHEIT: 'anwesenheit',
});

export const CALENDAR_NAMES = Object.freeze({
  termine: 'Familie · Termine',
  abwesenheit: 'Familie · Abwesenheit',
  anwesenheit: 'Familie · Anwesenheit',
});

/** farbe = App-Palette, colorId = nächstliegende der 11 Google-Kalenderfarben. */
export const TYPES = Object.freeze({
  kita_essen: { id: 'kita_essen', emoji: '🏫', farbe: '#2F9E5B', colorId: '10', calendar: 'anwesenheit' },
  kita_ohne: { id: 'kita_ohne', emoji: '🏫', farbe: '#8FD0A2', colorId: '2', calendar: 'anwesenheit' },
  abwesend: { id: 'abwesend', emoji: '🧸', farbe: '#F5A04A', colorId: '6', calendar: 'abwesenheit' },
  krank: { id: 'krank', emoji: '🤒', farbe: '#EF6B6B', colorId: '11', calendar: 'abwesenheit' },
  schliess: { id: 'schliess', emoji: '🔒', farbe: '#A7A2B2', colorId: '8', calendar: 'abwesenheit' },
  urlaub: { id: 'urlaub', emoji: '✈️', farbe: '#28B5C4', colorId: '7', calendar: 'termine' },
  arzt: { id: 'arzt', emoji: '🩺', farbe: '#8B6CD6', colorId: '3', calendar: 'termine' },
  familie: { id: 'familie', emoji: '🎈', farbe: '#F4C842', colorId: '5', calendar: 'termine' },
  urlaub_check: { id: 'urlaub_check', emoji: '🏖️', farbe: '#28B5C4', colorId: '7', calendar: 'termine' },
});

/** Typen, die als ein Ganztags-Ereignis pro Tag gespeichert werden. */
export const TAGES_TYPEN = Object.freeze(['kita_essen', 'kita_ohne', 'abwesend', 'krank', 'schliess']);

export const ARZT_SUBTYPEN = Object.freeze({
  kinderarzt: { id: 'kinderarzt', emoji: '🩺', label: 'Kinderarzt', mitnehmen: ['e-card', 'EKP', 'Impfpass'] },
  impfung: { id: 'impfung', emoji: '💉', label: 'Impfung', mitnehmen: ['e-card', 'Impfpass'] },
  augenarzt: { id: 'augenarzt', emoji: '👁️', label: 'Augenarzt', mitnehmen: ['e-card', 'Überweisung'] },
  zahnarzt: { id: 'zahnarzt', emoji: '🦷', label: 'Zahnarzt', mitnehmen: ['e-card'] },
  ekp: { id: 'ekp', emoji: '📒', label: 'EKP-Untersuchung', mitnehmen: ['e-card', 'EKP'] },
  sonstiger_arzt: { id: 'sonstiger_arzt', emoji: '🩺', label: 'Arzt', mitnehmen: ['e-card'] },
});
