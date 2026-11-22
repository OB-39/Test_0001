import {
  DUREE_ROTATION_MS,
  genererJetonPresence,
  validerJetonPresence,
} from './qr-presence-crypto.util';

/**
 * Tests unitaires Jest du moteur cryptographique d'emargement par QR Code dynamique.
 * Attribution : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */
describe('qr-presence-crypto.util', () => {
  const SECRET = 'enp-lome-cle-secrete-test-hmac-sha256-2026';

  it('TC-01 : genere et valide un jeton dans la fenetre de 8 secondes', () => {
    const t0 = 1_760_000_000_000;
    const genere = genererJetonPresence(42, 3, SECRET, t0);

    expect(genere.token).toMatch(
      /^ENP-PRESENCE:v1\.42\.1760000000000\.3\.[A-Za-z0-9_-]+$/,
    );
    expect(genere.expireDansMs).toBe(DUREE_ROTATION_MS);

    const validation = validerJetonPresence(genere.token, SECRET, 8000, t0 + 3500);
    expect(validation.valide).toBe(true);
    expect(validation.seanceId).toBe(42);
    expect(validation.counter).toBe(3);
    expect(validation.tokenAgeMs).toBe(3500);
  });

  it('TC-02 : rejette tout jeton expire au-dela de 8 secondes (tentative partage WhatsApp)', () => {
    const t0 = 1_760_000_000_000;
    const genere = genererJetonPresence(42, 4, SECRET, t0);

    const validation = validerJetonPresence(genere.token, SECRET, 8000, t0 + 9000);
    expect(validation.valide).toBe(false);
    expect(validation.codeErreur).toBe('expire');
    expect(validation.erreur).toContain('QR Code expire');
  });

  it('TC-03 : rejette un jeton falsifie ou signe avec une mauvaise cle', () => {
    const t0 = 1_760_000_000_000;
    const genere = genererJetonPresence(42, 5, SECRET, t0);

    const modifie = genere.token.replace('.42.', '.99.');
    expect(validerJetonPresence(modifie, SECRET, 8000, t0 + 1000)).toEqual(
      expect.objectContaining({
        valide: false,
        codeErreur: 'signature_invalide',
      }),
    );

    const mauvaiseCle = validerJetonPresence(
      genere.token,
      'autre-cle-secrete-invalide-123456',
      8000,
      t0 + 1000,
    );
    expect(mauvaiseCle.valide).toBe(false);
    expect(mauvaiseCle.codeErreur).toBe('signature_invalide');
  });

  it('rejette un format de QR code non conforme', () => {
    const res = validerJetonPresence('https://exemple.tg/faux-qr', SECRET);
    expect(res.valide).toBe(false);
    expect(res.codeErreur).toBe('format_invalide');
  });
});
