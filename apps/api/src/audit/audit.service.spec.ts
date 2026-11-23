import { AuditService } from './audit.service';
import { GENESIS_AUDIT_HASH } from './audit-forensic.util';

describe('AuditService', () => {
  const db = { query: jest.fn() };
  const service = new AuditService(db as never);

  beforeEach(() => jest.resetAllMocks());

  it('scelle cryptographiquement une entree avec IP, machine et localisation', async () => {
    db.query
      .mockResolvedValueOnce([]) // dernier hash
      .mockResolvedValueOnce([
        { matricule: 'DG-001', nom: 'SALAMI', prenom: 'Adekunle Akim' },
      ])
      .mockResolvedValueOnce([]); // insert

    await service.enregistrer({
      userId: 7,
      userRole: 'directeur_general',
      categorie: 'direction',
      gravite: 'sensible',
      action: 'DIRECTION_CONSULTATION',
      forensic: {
        ipAddress: '41.207.175.42',
        osNom: 'Windows 10/11',
        navigateurNom: 'Chrome 124',
        deviceFingerprint: 'MCH-DG-001',
        geoSource: 'gps_precis',
        geoLatitude: 6.17642,
        geoLongitude: 1.21238,
        geoPrecisionMetres: 12,
      },
    });

    const insertSql = db.query.mock.calls[2][0] as string;
    const insertParams = db.query.mock.calls[2][1] as unknown[];
    expect(insertSql).toContain('previous_hash');
    expect(insertSql).toContain('entry_hash');
    expect(insertSql).toContain('hmac_signature');
    expect(insertParams[2]).toBe('DG-001');
    expect(insertParams[3]).toBe('Adekunle Akim SALAMI');
    expect(insertParams[16]).toBe('41.207.175.42');
    expect(insertParams[36]).toBe(GENESIS_AUDIT_HASH);
    expect(String(insertParams[37])).toHaveLength(64);
    expect(String(insertParams[38])).toHaveLength(64);
  });

  it('filtre le journal de maniere parametree par role et utilisateur', async () => {
    db.query.mockResolvedValue([
      {
        id: 1,
        cree_le: '2026-11-22T08:00:00.000Z',
        user_id: 7,
        user_matricule: 'DG-001',
        user_nom_complet: 'Adekunle Akim SALAMI',
        user_role: 'directeur_general',
        categorie: 'direction',
        gravite: 'sensible',
        action: 'DIRECTION_CONSULTATION',
        methode_http: 'GET',
        chemin_http: '/api/v1/direction/statistiques',
        statut_http: 200,
        duree_ms: 18,
        ip_address: '41.207.175.42',
        ip_forwarded_chain: null,
        user_agent: null,
        os_nom: 'Windows 10/11',
        navigateur_nom: 'Chrome 124',
        appareil_type: 'Desktop',
        device_fingerprint: 'MCH-DG-001',
        ecran_resolution: '1920x1080',
        fuseau_horaire: 'Africa/Lome',
        langue: 'fr-FR',
        geo_source: 'gps_precis',
        geo_latitude: 6.17642,
        geo_longitude: 1.21238,
        geo_precision_m: 12,
        geo_ville: 'Lomé',
        geo_region: 'Maritime',
        geo_pays: 'Togo',
        geo_fai: 'Togocom',
        session_id: null,
        campaign_id: null,
        course_id: null,
        campus_id: null,
        objet: null,
        detail: null,
        metadata_json: null,
        previous_hash: GENESIS_AUDIT_HASH,
        entry_hash: 'a'.repeat(64),
        hmac_signature: 'b'.repeat(64),
      },
    ]);

    const res = await service.lister({
      limite: 200,
      role: 'directeur_general',
      userId: 7,
    });

    expect(res).toHaveLength(1);
    expect(res[0].ipAddress).toBe('41.207.175.42');
    expect(res[0].geoLatitude).toBe(6.17642);
    expect(db.query.mock.calls[0][1]).toEqual([7, 'directeur_general', 200]);
  });
});
