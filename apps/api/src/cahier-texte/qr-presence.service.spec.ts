import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service';
import { genererJetonPresence } from './qr-presence-crypto.util';
import { QrPresenceService } from './qr-presence.service';

/**
 * Tests unitaires Jest des regles anti-fraude de QrPresenceService (ENP).
 * Attribution : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */
describe('QrPresenceService', () => {
  const SERVER_SECRET = 'enp-qr-secret-serveur-test-2026-0001';
  const SESSION_SECRET = 'a'.repeat(64);
  const COMBINED_SECRET = `${SERVER_SECRET}:${SESSION_SECRET}`;

  function creerService(mockQuery: jest.Mock, mockTransaction?: jest.Mock) {
    const db = {
      query: mockQuery,
      transaction:
        mockTransaction ??
        jest.fn(async (work: (q: jest.Mock) => Promise<unknown>) =>
          work(jest.fn().mockResolvedValue([{ scanne_a: '2026-10-02T08:05:00.000Z' }])),
        ),
    } as unknown as DatabaseService;

    const config = {
      get: jest.fn((key: string) =>
        key === 'QR_PRESENCE_SECRET' ? SERVER_SECRET : undefined,
      ),
    } as unknown as ConfigService;

    return new QrPresenceService(db, config);
  }

  const sessionOuverteRow = {
    id: 1,
    seance_id: 10,
    enseignant_id: 1003,
    statut: 'ouverte',
    session_secret: SESSION_SECRET,
    token_counter: 2,
    ouvert_a: '2026-10-02T08:00:00.000Z',
    ferme_a: null,
    duree_validite_secondes: 6,
    course_id: 401,
    code_ue: 'INF501',
    intitule_ue: 'Algorithmique avancee',
    libelle_seance: 'Cours magistral',
    date_seance: '2026-10-02',
  };

  it('TC-04 : bloque le double scan du meme etudiant pour la meme seance', async () => {
    const token = genererJetonPresence(10, 2, COMBINED_SECRET, Date.now()).token;
    const query = jest
      .fn()
      .mockResolvedValueOnce([sessionOuverteRow])
      .mockResolvedValueOnce([
        { inscrit: true, deja_scan: true, appareil_utilise: false },
      ]);

    const service = creerService(query);

    await expect(
      service.scannerPresence(1001, token, 'device-fp-abcdef123456'),
    ).rejects.toThrow(ConflictException);
  });

  it('TC-05 : bloque le meme appareil utilise pour un second matricule', async () => {
    const token = genererJetonPresence(10, 2, COMBINED_SECRET, Date.now()).token;
    const query = jest
      .fn()
      .mockResolvedValueOnce([sessionOuverteRow])
      .mockResolvedValueOnce([
        { inscrit: true, deja_scan: false, appareil_utilise: true },
      ]);

    const service = creerService(query);

    await expect(
      service.scannerPresence(1002, token, 'device-fp-partage-123456'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloque un etudiant non inscrit a l UE', async () => {
    const token = genererJetonPresence(10, 2, COMBINED_SECRET, Date.now()).token;
    const query = jest
      .fn()
      .mockResolvedValueOnce([sessionOuverteRow])
      .mockResolvedValueOnce([
        { inscrit: false, deja_scan: false, appareil_utilise: false },
      ]);

    const service = creerService(query);

    await expect(
      service.scannerPresence(1099, token, 'device-fp-non-inscrit-123'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('TC-06 : rejette un scan apres cloture de la seance par l enseignant', async () => {
    const token = genererJetonPresence(10, 2, COMBINED_SECRET, Date.now()).token;
    const query = jest.fn().mockResolvedValueOnce([
      {
        ...sessionOuverteRow,
        statut: 'fermee',
        ferme_a: '2026-10-02T08:15:00.000Z',
      },
    ]);

    const service = creerService(query);

    await expect(
      service.scannerPresence(1001, token, 'device-fp-abcdef123456'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('TC-02 : rejette un jeton expire apres 9 secondes', async () => {
    const token = genererJetonPresence(
      10,
      2,
      COMBINED_SECRET,
      Date.now() - 9000,
    ).token;
    const query = jest.fn().mockResolvedValueOnce([sessionOuverteRow]);

    const service = creerService(query);

    await expect(
      service.scannerPresence(1001, token, 'device-fp-abcdef123456'),
    ).rejects.toThrow(BadRequestException);
  });

  it('demarrerSession utilise ref.course_teacher et COALESCE(u.matricule, u.email)', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          seance_id: 10,
          course_id: 401,
          code_ue: 'UE_TEST_QR',
          intitule_ue: 'Ue_test_QR',
          libelle_seance: 'Seance test',
          date_seance: '2026-11-23',
        },
      ])
      .mockResolvedValueOnce([sessionOuverteRow])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([]);

    const service = creerService(query);
    const res = await service.demarrerSession(1003, 10);

    expect(res.codeUe).toBe('UE_TEST_QR');
    const sqlVerif = String(query.mock.calls[0]?.[0] ?? '');
    const sqlRecents = String(query.mock.calls[4]?.[0] ?? '');
    expect(sqlVerif).toContain('ref.course_teacher');
    expect(sqlVerif).not.toContain('ref.teaching_assignment');
    expect(sqlRecents).toContain('COALESCE(u.matricule, u.email)');
    expect(sqlRecents).not.toContain('u.identifiant');
  });
});
