import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  calculerPourcentagePresence,
  evaluerReglesScan,
  genererJetonPresenceClient,
  hmacSha256Base64Url,
  validerJetonPresenceClient,
} from './qrPresenceToken';

const SECRET = 'enp-lome-secret-demo-qr-presence-2026';

test('hmacSha256Base64Url matches Node crypto HMAC-SHA256 bit-for-bit', () => {
  const payload = '42:1760000000000:7';
  const expected = createHmac('sha256', SECRET).update(payload).digest('base64url');
  assert.equal(hmacSha256Base64Url(SECRET, payload), expected);
});

test('TC-01: scan normal dans la fenetre de 8 secondes est valide', () => {
  const t0 = 1_760_000_000_000;
  const jeton = genererJetonPresenceClient(1, 3, SECRET, t0);
  const res = evaluerReglesScan(
    jeton.token,
    1001,
    'enp-device-001',
    {
      statut: 'ouverte',
      secretKey: SECRET,
      etudiantsInscrits: [1001, 1002],
      etudiantsScannes: [],
      appareilsParEtudiant: {},
    },
    t0 + 3500,
  );
  assert.equal(res.valide, true);
  assert.equal(res.seanceId, 1);
  assert.equal(res.counter, 3);
  assert.equal(res.tokenAgeMs, 3500);
});

test('TC-02: scan apres 9 secondes (tentative partage photo) est rejete', () => {
  const t0 = 1_760_000_000_000;
  const jeton = genererJetonPresenceClient(1, 4, SECRET, t0);
  const res = validerJetonPresenceClient(jeton.token, SECRET, 8000, t0 + 9000);
  assert.equal(res.valide, false);
  assert.equal(res.codeErreur, 'expire');
});

test('TC-03: QR code falsifie ou modifie echoue la verification HMAC', () => {
  const t0 = 1_760_000_000_000;
  const jeton = genererJetonPresenceClient(1, 5, SECRET, t0);
  const falsifie = jeton.token.replace('.1.', '.99.');
  const res = validerJetonPresenceClient(falsifie, SECRET, 8000, t0 + 1000);
  assert.equal(res.valide, false);
  assert.equal(res.codeErreur, 'signature_invalide');
});

test('TC-04: double emargement du meme etudiant est bloque', () => {
  const t0 = 1_760_000_000_000;
  const jeton = genererJetonPresenceClient(1, 6, SECRET, t0);
  const res = evaluerReglesScan(
    jeton.token,
    1001,
    'enp-device-001',
    {
      statut: 'ouverte',
      secretKey: SECRET,
      etudiantsInscrits: [1001, 1002],
      etudiantsScannes: [1001],
      appareilsParEtudiant: { 'enp-device-001': 1001 },
    },
    t0 + 2000,
  );
  assert.equal(res.valide, false);
  assert.equal(res.codeErreur, 'deja_emarge');
});

test('TC-05: meme appareil utilise pour deux matricules differents est bloque', () => {
  const t0 = 1_760_000_000_000;
  const jeton = genererJetonPresenceClient(1, 7, SECRET, t0);
  const res = evaluerReglesScan(
    jeton.token,
    1002,
    'enp-device-partage',
    {
      statut: 'ouverte',
      secretKey: SECRET,
      etudiantsInscrits: [1001, 1002],
      etudiantsScannes: [1001],
      appareilsParEtudiant: { 'enp-device-partage': 1001 },
    },
    t0 + 2000,
  );
  assert.equal(res.valide, false);
  assert.equal(res.codeErreur, 'appareil_partage');
});

test('TC-06: scan apres cloture de la seance est rejete', () => {
  const t0 = 1_760_000_000_000;
  const jeton = genererJetonPresenceClient(1, 8, SECRET, t0);
  const res = evaluerReglesScan(
    jeton.token,
    1002,
    'enp-device-002',
    {
      statut: 'fermee',
      secretKey: SECRET,
      etudiantsInscrits: [1001, 1002],
      etudiantsScannes: [],
      appareilsParEtudiant: {},
    },
    t0 + 1000,
  );
  assert.equal(res.valide, false);
  assert.equal(res.codeErreur, 'session_fermee');
});

test('calculerPourcentagePresence calcule correctement le taux borne entre 0 et 100', () => {
  assert.equal(calculerPourcentagePresence(0, 0), 0);
  assert.equal(calculerPourcentagePresence(45, 60), 75);
  assert.equal(calculerPourcentagePresence(65, 60), 100);
});
