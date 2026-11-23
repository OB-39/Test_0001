import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AuditController } from './audit.controller';

describe('AuditController', () => {
  const audit = {
    lister: jest.fn(),
    historiqueUtilisateur: jest.fn(),
    verifierIntegrite: jest.fn(),
    enregistrer: jest.fn(),
  };
  const controller = new AuditController(audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    audit.lister.mockResolvedValue([]);
    audit.historiqueUtilisateur.mockResolvedValue([]);
    audit.verifierIntegrite.mockResolvedValue({
      intact: true,
      totalVerifie: 0,
      verifieLe: '2026-11-22T08:00:00.000Z',
      anomalies: [],
    });
  });

  it('reserve strictement la lecture du journal a l administrateur uniquement', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AuditController.prototype.lister),
    ).toEqual(['admin']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AuditController.prototype.historiqueUtilisateur,
      ),
    ).toEqual(['admin']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AuditController.prototype.verifierIntegrite,
      ),
    ).toEqual(['admin']);
  });

  it('laisse l administrateur consulter le journal avec filtres', async () => {
    await controller.lister(
      '100',
      '42',
      undefined,
      'directeur_general',
      undefined,
      undefined,
      '41.207',
      undefined,
      undefined,
      undefined,
      {
        headers: {},
        utilisateur: { id: 9, roles: ['admin'], activeRole: 'admin' },
      },
    );

    expect(audit.lister).toHaveBeenCalledWith(
      expect.objectContaining({
        limite: 100,
        userId: 42,
        role: 'directeur_general',
        ip: '41.207',
      }),
    );
  });

  it('refuse une limite invalide', async () => {
    await expect(
      controller.lister(
        '501',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: {},
          utilisateur: { id: 9, roles: ['admin'], activeRole: 'admin' },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
