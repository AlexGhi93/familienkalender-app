/** 'Krabbelstube' bis zum Wechseldatum, danach 'Kindergarten'. */
export function einrichtungFor(date, settings) {
  return settings.wechseldatum && date >= settings.wechseldatum ? 'Kindergarten' : 'Krabbelstube';
}
