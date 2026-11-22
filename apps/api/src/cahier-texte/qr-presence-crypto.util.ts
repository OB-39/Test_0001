import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Utilitaire cryptographique pour l'emargement par QR Code dynamique tournant (ENP).
 * Conception institutionnelle : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */

export const PREFIXE_JETON_PRESENCE = 'ENP-PRESENCE:v1';
export const DUREE_ROTATION_MS = 6000;
export const FENETRE_VALIDITE_DEFAUT_MS = 8000;
const TOLERANCE_HORLOGE_FUTUR_MS = 1000;

export interface JetonPresenceGenere {
  token: string;
  seanceId: number;
  timestampMs: number;
  counter: number;
  expireDansMs: number;
}

export type CodeErreurJetonPresence =
  | 'format_invalide'
  | 'signature_invalide'
  | 'expire';

export interface ResultatValidationJetonPresence {
  valide: boolean;
  seanceId?: number;
  timestampMs?: number;
  counter?: number;
  tokenAgeMs?: number;
  codeErreur?: CodeErreurJetonPresence;
  erreur?: string;
}

export function genererGraineSession(): string {
  return randomBytes(32).toString('hex');
}

export function calculerSignatureHmac(
  seanceId: number,
  timestampMs: number,
  counter: number,
  secretKey: string,
): string {
  const payload = `${seanceId}:${timestampMs}:${counter}`;
  return createHmac('sha256', secretKey).update(payload).digest('base64url');
}

export function genererJetonPresence(
  seanceId: number,
  counter: number,
  secretKey: string,
  nowMs: number = Date.now(),
): JetonPresenceGenere {
  if (!Number.isSafeInteger(seanceId) || seanceId <= 0) {
    throw new Error('seanceId doit etre un entier positif');
  }
  if (!Number.isSafeInteger(counter) || counter < 1) {
    throw new Error('counter doit etre un entier superieur ou egal a 1');
  }
  if (!secretKey || secretKey.trim().length < 16) {
    throw new Error('secretKey invalide pour la signature HMAC');
  }

  const timestampMs = Math.floor(nowMs);
  const signatureHmac = calculerSignatureHmac(
    seanceId,
    timestampMs,
    counter,
    secretKey,
  );
  const token = `${PREFIXE_JETON_PRESENCE}.${seanceId}.${timestampMs}.${counter}.${signatureHmac}`;

  return {
    token,
    seanceId,
    timestampMs,
    counter,
    expireDansMs: DUREE_ROTATION_MS,
  };
}

export function extraireMetadonneesJeton(token: string): {
  seanceId: number;
  timestampMs: number;
  counter: number;
  signatureHmac: string;
} | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  const match =
    /^ENP-PRESENCE:v1\.(\d+)\.(\d+)\.(\d+)\.([A-Za-z0-9_-]{20,128})$/.exec(
      trimmed,
    );
  if (!match) return null;

  const seanceId = Number(match[1]);
  const timestampMs = Number(match[2]);
  const counter = Number(match[3]);
  const signatureHmac = match[4];

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

  return { seanceId, timestampMs, counter, signatureHmac };
}

export function validerJetonPresence(
  token: string,
  secretKey: string,
  maxAgeMs: number = FENETRE_VALIDITE_DEFAUT_MS,
  nowMs: number = Date.now(),
): ResultatValidationJetonPresence {
  const meta = extraireMetadonneesJeton(token);
  if (!meta) {
    return {
      valide: false,
      codeErreur: 'format_invalide',
      erreur: 'QR Code invalide ou non reconnu par la plateforme ENP.',
    };
  }

  if (!secretKey || secretKey.trim().length < 16) {
    return {
      valide: false,
      codeErreur: 'signature_invalide',
      erreur: 'Signature cryptographique invalide.',
    };
  }

  const attendue = calculerSignatureHmac(
    meta.seanceId,
    meta.timestampMs,
    meta.counter,
    secretKey,
  );
  const recuBuf = Buffer.from(meta.signatureHmac, 'utf8');
  const attenduBuf = Buffer.from(attendue, 'utf8');

  if (
    recuBuf.length !== attenduBuf.length ||
    !timingSafeEqual(recuBuf, attenduBuf)
  ) {
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
      erreur: "QR Code expire. Veuillez rescanner l'ecran du professeur.",
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
