import { ROLES_KEY } from '../auth/roles.decorator';
import { ComptesController } from './comptes.controller';

describe('ComptesController', () => {
  const users = {
    listerComptes: jest.fn(),
    supprimerCompte: jest.fn(),
  };
  const campusScope = { forScolarite: jest.fn() };
  const controller = new ComptesController(
    users as never,
    campusScope as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    campusScope.forScolarite.mockResolvedValue(7);
  });

  it('limite la suppression aux profils admin et Scolarité', async () => {
    const supprimer = Object.getOwnPropertyDescriptor(
      ComptesController.prototype,
      'supprimer',
    )?.value;
    expect(Reflect.getMetadata(ROLES_KEY, supprimer)).toEqual([
      'scolarite',
      'admin',
    ]);
    users.supprimerCompte.mockResolvedValue(undefined);

    await controller.supprimer(15, {
      headers: {},
      utilisateur: { id: 8, roles: ['scolarite'], activeRole: 'scolarite' },
    });

    expect(campusScope.forScolarite).toHaveBeenCalledWith(8, ['scolarite']);
    expect(users.supprimerCompte).toHaveBeenCalledWith(15, 8, 'scolarite', 7);
  });

  it('permet à la Scolarité de consulter tous les comptes sans élargir ses actions', async () => {
    users.listerComptes.mockResolvedValue([]);

    await controller.lister({
      headers: {},
      utilisateur: { id: 8, roles: ['scolarite'], activeRole: 'scolarite' },
    });

    expect(campusScope.forScolarite).toHaveBeenCalledWith(8, ['scolarite']);
    expect(users.listerComptes).toHaveBeenCalledWith(7, true);
  });

  it('ne force pas l’inclusion hors périmètre pour un autre profil', async () => {
    users.listerComptes.mockResolvedValue([]);
    campusScope.forScolarite.mockResolvedValueOnce(null);

    await controller.lister({
      headers: {},
      utilisateur: { id: 8, roles: ['admin'], activeRole: 'admin' },
    });

    expect(users.listerComptes).toHaveBeenCalledWith(null, false);
  });

  it('ne résout pas de campus pour l’administration', async () => {
    users.supprimerCompte.mockResolvedValue(undefined);

    await controller.supprimer(15, {
      headers: {},
      utilisateur: { id: 8, roles: ['admin'], activeRole: 'admin' },
    });

    expect(campusScope.forScolarite).not.toHaveBeenCalled();
    expect(users.supprimerCompte).toHaveBeenCalledWith(15, 8, 'admin', null);
  });
});
