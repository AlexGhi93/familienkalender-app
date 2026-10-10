// Öffentliche Konfiguration. Die Client-ID ist kein Geheimnis (sie steht in jeder OAuth-Anfrage); ein Client-Secret
// braucht nur der Login-Dienst (als Cloudflare-Secret) und darf hier nie stehen.
export const CONFIG = Object.freeze({
  clientId: '154849350786-nv47ddiarefk30v8qull88cpuj2nu8t3.apps.googleusercontent.com',
  scopes: Object.freeze([
    'https://www.googleapis.com/auth/calendar.app.created',
    'https://www.googleapis.com/auth/calendar.calendarlist',
  ]),
  apiBasis: 'https://www.googleapis.com/calendar/v3',
  zeitzone: 'Europe/Vienna',
  // Push-Dienst (Cloudflare Worker): Adresse und öffentlicher VAPID-Schlüssel, beides öffentlich. Leer = „noch nicht eingerichtet“.
  push: Object.freeze({ dienst: 'https://familienkalender-push.fk-h2vq8eei.workers.dev', vapidPublic: 'BOTDTS3msWMWwaqZiZE-pMoyZD56AMvnJw17RqGIXBhExZZmbGWj5QvJklUzbvLwJZv2lRx-QtxrAlZOt5P8Sws' }),
  // Login-Dienst (eigener Cloudflare Worker, Quelle in login-dienst/): hält Telefone dauerhaft angemeldet, statt jede Stunde
  // „Verbinden“ zu verlangen. Leer = aus (bisheriges Verhalten, Notbremse: login-dienst/README.md). Die Adresse steht auch
  // in der CSP von index.html.
  login: Object.freeze({ dienst: 'https://familienkalender-login.fk-h2vq8eei.workers.dev' }),
});
