/**
 * Moteur de jetons QR dynamiques tournants cote frontend et maquette (ENP).
 * Implementation RFC 2104 HMAC-SHA256 synchrone et regles anti-fraude pures.
 * Attribution : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */

export const PREFIXE_JETON_PRESENCE = 'ENP-PRESENCE:v1';
export const DUREE_ROTATION_MS = 6000;
export const FENETRE_VALIDITE_MS = 8000;
const TOLERANCE_HORLOGE_FUTUR_MS = 1000;
const CLE_EMPREINTE_APPAREIL = 'enp_qr_device_fingerprint_v1';

const K_SHA256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Bytes(message: Uint8Array): Uint8Array {
  const bitLen = message.length * 8;
  const paddedLen = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^
        ((e >>> 11) | (e << 21)) ^
        ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K_SHA256[i] + w[i]) >>> 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^
        ((a >>> 13) | (a << 19)) ^
        ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    result += alphabet[(triple >>> 18) & 0x3f];
    result += alphabet[(triple >>> 12) & 0x3f];
    if (i + 1 < bytes.length) result += alphabet[(triple >>> 6) & 0x3f];
    if (i + 2 < bytes.length) result += alphabet[triple & 0x3f];
  }
  return result;
}

export function hmacSha256Base64Url(secret: string, data: string): string {
  const encoder = new TextEncoder();
  let keyBytes: Uint8Array = encoder.encode(secret);
  const dataBytes = encoder.encode(data);

  if (keyBytes.length > 64) {
    keyBytes = sha256Bytes(keyBytes);
  }

  const blockKey = new Uint8Array(64);
  blockKey.set(keyBytes);

  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = blockKey[i] ^ 0x5c;
    iKeyPad[i] = blockKey[i] ^ 0x36;
  }

  const innerInput = new Uint8Array(64 + dataBytes.length);
  innerInput.set(iKeyPad, 0);
  innerInput.set(dataBytes, 64);
  const innerHash = sha256Bytes(innerInput);

  const outerInput = new Uint8Array(64 + 32);
  outerInput.set(oKeyPad, 0);
  outerInput.set(innerHash, 64);
  return toBase64Url(sha256Bytes(outerInput));
}

function comparerTempsConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface JetonPresenceClient {
  token: string;
  seanceId: number;
  timestampMs: number;
  counter: number;
  expireDansMs: number;
}

export type CodeErreurValidationQr =
  | 'format_invalide'
  | 'signature_invalide'
  | 'expire'
  | 'session_fermee'
  | 'non_inscrit'
  | 'deja_emarge'
  | 'appareil_partage';

export interface ValidationJetonClient {
  valide: boolean;
  seanceId?: number;
  timestampMs?: number;
  counter?: number;
  tokenAgeMs?: number;
  codeErreur?: CodeErreurValidationQr;
  erreur?: string;
}

export function genererJetonPresenceClient(
  seanceId: number,
  counter: number,
  secretKey: string,
  nowMs: number = Date.now(),
): JetonPresenceClient {
  const timestampMs = Math.floor(nowMs);
  const signature = hmacSha256Base64Url(
    secretKey,
    `${seanceId}:${timestampMs}:${counter}`,
  );
  return {
    token: `${PREFIXE_JETON_PRESENCE}.${seanceId}.${timestampMs}.${counter}.${signature}`,
    seanceId,
    timestampMs,
    counter,
    expireDansMs: DUREE_ROTATION_MS,
  };
}

export function parserJetonPresence(token: string): {
  seanceId: number;
  timestampMs: number;
  counter: number;
  signatureHmac: string;
} | null {
  if (typeof token !== 'string') return null;
  const match =
    /^ENP-PRESENCE:v1\.(\d+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]{20,128})$/.exec(
      token.trim(),
    );
  if (!match) return null;
  const seanceId = Number(match[1]);
  const timestampMs = Number(match[2]);
  const counter = Number(match[3]);
  if (
    !Number.isSafeInteger(seanceId) ||
    seanceId <= 0 ||
    !Number.isSafeInteger(timestampMs) ||
    timestampMs <= 0 ||
    !Number.isSafeInteger(counter) ||
    counter < 1
  ) {
    return null;
  }
  return { seanceId, timestampMs, counter, signatureHmac: match[4] };
}

export function validerJetonPresenceClient(
  token: string,
  secretKey: string,
  maxAgeMs: number = FENETRE_VALIDITE_MS,
  nowMs: number = Date.now(),
): ValidationJetonClient {
  const meta = parserJetonPresence(token);
  if (!meta) {
    return {
      valide: false,
      codeErreur: 'format_invalide',
      erreur: 'QR Code invalide ou non reconnu par la plateforme ENP.',
    };
  }

  const attendue = hmacSha256Base64Url(
    secretKey,
    `${meta.seanceId}:${meta.timestampMs}:${meta.counter}`,
  );
  if (!comparerTempsConstant(meta.signatureHmac, attendue)) {
    return {
      valide: false,
      codeErreur: 'signature_invalide',
      erreur: 'QR Code invalide ou signature non reconnue.',
    };
  }

  const tokenAgeMs = Math.floor(nowMs) - meta.timestampMs;
  if (tokenAgeMs < -TOLERANCE_HORLOGE_FUTUR_MS || tokenAgeMs > maxAgeMs) {
    return {
      valide: false,
      seanceId: meta.seanceId,
      timestampMs: meta.timestampMs,
      counter: meta.counter,
      tokenAgeMs,
      codeErreur: 'expire',
      erreur: "Ce code a expiré. Veuillez rescanner l'écran du tableau.",
    };
  }

  return {
    valide: true,
    seanceId: meta.seanceId,
    timestampMs: meta.timestampMs,
    counter: meta.counter,
    tokenAgeMs: Math.max(0, tokenAgeMs),
  };
}

export interface ContexteSessionScan {
  statut: 'ouverte' | 'pause' | 'fermee';
  secretKey: string;
  etudiantsInscrits: number[];
  etudiantsScannes: number[];
  appareilsParEtudiant: Record<string, number>;
}

export function evaluerReglesScan(
  token: string,
  etudiantId: number,
  deviceFingerprint: string,
  session: ContexteSessionScan,
  nowMs: number = Date.now(),
): ValidationJetonClient {
  if (session.statut !== 'ouverte') {
    return {
      valide: false,
      codeErreur: 'session_fermee',
      erreur: "L'émargement a été clôturé par l'enseignant.",
    };
  }

  const checkToken = validerJetonPresenceClient(
    token,
    session.secretKey,
    FENETRE_VALIDITE_MS,
    nowMs,
  );
  if (!checkToken.valide) {
    return checkToken;
  }

  if (!session.etudiantsInscrits.includes(etudiantId)) {
    return {
      valide: false,
      codeErreur: 'non_inscrit',
      erreur: "Vous n'êtes pas inscrit à cette unité d'enseignement.",
    };
  }

  if (session.etudiantsScannes.includes(etudiantId)) {
    return {
      valide: false,
      codeErreur: 'deja_emarge',
      erreur: 'Vous avez déjà émargé pour cette séance.',
    };
  }

  const proprietaireAppareil = session.appareilsParEtudiant[deviceFingerprint];
  if (proprietaireAppareil !== undefined && proprietaireAppareil !== etudiantId) {
    return {
      valide: false,
      codeErreur: 'appareil_partage',
      erreur: 'Cet appareil a déjà été utilisé pour un émargement pour cette séance.',
    };
  }

  return checkToken;
}

export function obtenirEmpreinteAppareil(): string {
  try {
    const existant = window.localStorage.getItem(CLE_EMPREINTE_APPAREIL);
    if (existant && existant.length >= 16 && existant.length <= 64) {
      return existant;
    }
    const octets = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(octets);
    } else {
      for (let i = 0; i < octets.length; i++) {
        octets[i] = Math.floor(Math.random() * 256);
      }
    }
    const empreinte =
      'enp-' +
      Array.from(octets)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    window.localStorage.setItem(CLE_EMPREINTE_APPAREIL, empreinte);
    return empreinte;
  } catch {
    return 'enp-device-session-fallback-0001';
  }
}

export function formaterHeureExacte(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formaterHeureCourte(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--h--';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}h${mm}`;
}

export function calculerPourcentagePresence(presents: number, inscrits: number): number {
  if (inscrits <= 0) return 0;
  return Math.min(100, Math.round((presents / inscrits) * 100));
}
