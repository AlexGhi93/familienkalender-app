// Öffentliche Konfiguration. Die Client-ID ist kein Geheimnis (sie steht in jeder OAuth-Anfrage); ein Client-Secret
// wird nirgends gebraucht und darf hier nie stehen.
export const CONFIG = Object.freeze({
  clientId: '154849350786-nv47ddiarefk30v8qull88cpuj2nu8t3.apps.googleusercontent.com',
  scopes: Object.freeze([
    'https://www.googleapis.com/auth/calendar.app.created',
    'https://www.googleapis.com/auth/calendar.calendarlist',
  ]),
  apiBasis: 'https://www.googleapis.com/calendar/v3',
  zeitzone: 'Europe/Vienna',
});
