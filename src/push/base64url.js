// base64url ohne Auffüllzeichen (so schreiben Web-Push-Schlüssel und -Nachrichten ihre Bytes).

export function bytesZuB64u(bytes) {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function b64uZuBytes(text) {
  const normal = String(text).replaceAll('-', '+').replaceAll('_', '/');
  const roh = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4));
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return bytes;
}
