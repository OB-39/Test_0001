import { ScolariteService } from './scolarite.service';

describe('ScolariteService', () => {
  const db = { query: jest.fn(), transaction: jest.fn() };
  const resultsDb = { lire: jest.fn() };
  const campusScope = {
    forScolarite: jest.fn(),
    verifierDepartement: jest.fn(),
  };
  const service = new ScolariteService(
    db as never,
    resultsDb as never,
    campusScope as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    db.transaction.mockImplementation((work) => work(db.query));
    campusScope.forScolarite.mockResolvedValue(null);
  });

  it('liste les départements avec leur campus', async () => {
    const departements = [{ id: 4, nom: 'Informatique', campus: 'Lome' }];
    db.query.mockResolvedValueOnce(departements);

    await expect(service.departements(1, ['scolarite'])).resolves.toEqual(
      departements,
    );
    expect(db.query.mock.calls[0][0]).toContain('JOIN ref.campus');
  });

  it('limite les programmes au campus de la Scolarité', async () => {
    campusScope.forScolarite.mockResolvedValueOnce(7);
    db.query.mockResolvedValueOnce([]);

    await expect(service.programmes(1, ['scolarite'])).resolves.toEqual([]);

    expect(db.query.mock.calls[0][0]).toContain('c.id = $1');
    expect(db.query.mock.calls[0][1]).toEqual([7]);
  });

  it('vérifie le département du campus avant de créer un programme', async () => {
    campusScope.forScolarite.mockResolvedValueOnce(7);
    const programme = {
      id: 12,
      nom: 'Cycle Ingénieur',
      departmentId: 3,
      departement: 'Informatique',
      campus: 'Campus Nord',
    };
    db.query.mockResolvedValueOnce([programme]);

    await expect(
      service.creerProgramme(1, ['scolarite'], 3, ' Cycle Ingénieur '),
    ).resolves.toEqual(programme);

    expect(campusScope.verifierDepartement).toHaveBeenCalledWith(3, 7);
    expect(db.query.mock.calls[0][1]).toEqual([3, 'Cycle Ingénieur']);
  });

  it('refuse la suppression d’un programme utilisé par des cours', async () => {
    db.query.mockRejectedValueOnce({ code: '23503' });

    await expect(
      service.supprimerProgramme(1, ['scolarite'], 3),
    ).rejects.toThrow('utilisé par des cours');
  });

  it('refuse la modification d’une UE utilisée sur un autre campus', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 5 }]);

    await expect(
      service.modifierUniteEnseignement(1, ['scolarite'], 5, {
        code: 'INF500',
        intitule: 'Algorithmique',
        credits: 5,
      }),
    ).rejects.toThrow('un autre campus');

    expect(db.query.mock.calls[0][0]).toContain('d.campus_id <> $5');
  });

  it('conserve les composantes déjà rattachées à la même UE composite', async () => {
    const unite = {
      id: 5,
      code: 'PHY1120',
      intitule: 'Physique',
      credits: 8,
      modifiable: true,
      compositeParentId: null,
      composantes: [
        { id: 6, code: '1PHY1120', intitule: 'Physique 1', credits: 4 },
      ],
      programmes: [],
    };
    db.query
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([
        { id: 5, composite_parent_id: null, est_parent: true },
        { id: 6, composite_parent_id: 5, est_parent: false },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([unite]);

    await expect(
      service.modifierUniteEnseignement(1, ['scolarite'], 5, {
        code: 'PHY1120',
        intitule: 'Physique',
        credits: 8,
        composantesIds: [6],
      }),
    ).resolves.toEqual(unite);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(
      db.query.mock.calls.some(([sql]) =>
        String(sql).includes('SET composite_parent_id = $1'),
      ),
    ).toBe(true);
  });

  it('compose les compteurs et les campagnes du tableau de bord', async () => {
    const debut = new Date('2026-10-01T00:00:00Z');
    const fin = new Date('2026-11-01T00:00:00Z');
    const campagnes = [
      {
        id: 8,
        libelle: 'Évaluation S5',
        department_id: 4,
        departement: 'Informatique',
        annee_universitaire: '2026-2027',
        semestre: 5,
        version_id: 2,
        debut,
        fin,
        statut: 'ouverte',
      },
    ];
    db.query
      .mockResolvedValueOnce(campagnes)
      .mockResolvedValueOnce([{ nombre: 3 }])
      .mockResolvedValueOnce([{ inscriptions: 20, participations: 12 }]);
    resultsDb.lire.mockResolvedValueOnce([{ bulletins: 10, commentaires: 2 }]);

    await expect(service.tableauDeBord(1, ['scolarite'])).resolves.toEqual({
      campagnesOuvertes: 1,
      comptesSansMotDePasse: 3,
      commentairesAModerer: 2,
      participation: { inscriptions: 20, participations: 12, bulletins: 10 },
      campagnes: [
        {
          id: 8,
          libelle: 'Évaluation S5',
          departmentId: 4,
          departement: 'Informatique',
          anneeUniversitaire: '2026-2027',
          semestre: 5,
          versionId: 2,
          debut,
          fin,
          statut: 'ouverte',
        },
      ],
    });
    expect(resultsDb.lire.mock.calls[0][1]).toEqual([[8], expect.any(Number)]);
  });

  it('ne lit pas l’urne quand il n’y a aucune campagne', async () => {
    db.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ nombre: 0 }])
      .mockResolvedValueOnce([{ inscriptions: 0, participations: 0 }]);

    await expect(
      service.tableauDeBord(1, ['scolarite']),
    ).resolves.toMatchObject({
      campagnesOuvertes: 0,
      participation: { inscriptions: 0, participations: 0, bulletins: 0 },
    });
    expect(resultsDb.lire).not.toHaveBeenCalled();
  });
});
