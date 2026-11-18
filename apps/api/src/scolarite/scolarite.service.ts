import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { DatabaseQuery } from '../database/database.service';
import { CampusScopeService } from '../database/campus-scope.service';
import { ResultsDatabaseService } from '../resultats/results-database.service';
import { SEUIL_ANONYMAT } from '../resultats/resultats.constants';

interface CampagneLigne {
  id: number;
  libelle: string;
  department_id: number;
  departement: string;
  annee_universitaire: string;
  semestre: number;
  version_id: number;
  debut: Date;
  fin: Date;
  statut: string;
}

interface Compteur {
  nombre: number;
}

interface StatistiquesParticipation {
  inscriptions: number;
  participations: number;
}

export interface CampagneScolarite {
  id: number;
  libelle: string;
  departmentId: number;
  departement: string;
  anneeUniversitaire: string;
  semestre: number;
  versionId: number;
  debut: Date;
  fin: Date;
  statut: string;
}

export interface ProgrammeScolarite {
  id: number;
  nom: string;
  departmentId: number;
  departement: string;
  campus: string;
}

export interface UniteEnseignementScolarite {
  id: number;
  code: string;
  intitule: string;
  credits: number;
  modifiable: boolean;
  compositeParentId: number | null;
  composantes: {
    id: number;
    code: string;
    intitule: string;
    credits: number;
  }[];
  programmes: { id: number; nom: string; departement: string }[];
}

function codePg(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = err.code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

const CAMPAGNES = `
  SELECT c.id, c.libelle, c.department_id, d.nom AS departement,
         c.annee_universitaire, c.semestre, c.version_id, c.debut, c.fin, c.statut
  FROM evaluation.campaigns c
  JOIN ref.department d ON d.id = c.department_id`;

const CAMPAGNES_AVEC_COURS = `
  SELECT c.id AS campaign_id, co.id AS course_id
  FROM evaluation.campaigns c
  JOIN ref.department d ON d.id = c.department_id
  JOIN ref.program p ON p.department_id = c.department_id
  JOIN ref.course co ON co.program_id = p.id
    AND co.annee_universitaire = c.annee_universitaire
    AND co.semestre = c.semestre
  WHERE ($1::int IS NULL OR d.campus_id = $1)`;

@Injectable()
export class ScolariteService {
  constructor(
    private readonly db: DatabaseService,
    private readonly resultsDb: ResultsDatabaseService,
    private readonly campusScope: CampusScopeService,
  ) {}

  async departements(
    userId: number,
    roles: string[],
  ): Promise<{ id: number; nom: string; campus: string }[]> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    return this.db.query<{ id: number; nom: string; campus: string }>(
      `SELECT d.id, d.nom, c.nom AS campus
       FROM ref.department d
       JOIN ref.campus c ON c.id = d.campus_id
       WHERE ($1::int IS NULL OR c.id = $1)
       ORDER BY c.nom, d.nom`,
      [campusId],
    );
  }

  async programmes(
    userId: number,
    roles: string[],
  ): Promise<ProgrammeScolarite[]> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    return this.db.query<ProgrammeScolarite>(
      `SELECT p.id, p.nom, p.department_id AS "departmentId",
              d.nom AS departement, c.nom AS campus
       FROM ref.program p
       JOIN ref.department d ON d.id = p.department_id
       JOIN ref.campus c ON c.id = d.campus_id
       WHERE ($1::int IS NULL OR c.id = $1)
       ORDER BY d.nom, p.nom`,
      [campusId],
    );
  }

  async creerProgramme(
    userId: number,
    roles: string[],
    departmentId: number,
    nom: string,
  ): Promise<ProgrammeScolarite> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    await this.campusScope.verifierDepartement(departmentId, campusId);
    try {
      const rows = await this.db.query<ProgrammeScolarite>(
        `INSERT INTO ref.program (department_id, nom)
         VALUES ($1, $2)
         RETURNING id, nom, department_id AS "departmentId",
           (SELECT d.nom FROM ref.department d WHERE d.id = department_id) AS departement,
           (SELECT c.nom FROM ref.department d JOIN ref.campus c ON c.id = d.campus_id
            WHERE d.id = department_id) AS campus`,
        [departmentId, nom.trim()],
      );
      return rows[0];
    } catch (err) {
      if (codePg(err) === '23505') {
        throw new ConflictException(
          'Ce programme existe déjà dans ce département',
        );
      }
      if (codePg(err) === '23503') {
        throw new NotFoundException('Département introuvable');
      }
      throw err;
    }
  }

  async modifierProgramme(
    userId: number,
    roles: string[],
    id: number,
    modifications: { nom?: string; departmentId?: number },
  ): Promise<ProgrammeScolarite> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    if (modifications.departmentId !== undefined) {
      await this.campusScope.verifierDepartement(
        modifications.departmentId,
        campusId,
      );
    }
    try {
      const rows = await this.db.query<ProgrammeScolarite>(
        `UPDATE ref.program p
         SET nom = COALESCE($3, p.nom),
             department_id = COALESCE($4, p.department_id)
         WHERE p.id = $1
           AND EXISTS (
             SELECT 1 FROM ref.department current_d
             WHERE current_d.id = p.department_id
               AND ($2::int IS NULL OR current_d.campus_id = $2)
           )
         RETURNING p.id, p.nom, p.department_id AS "departmentId",
           (SELECT d.nom FROM ref.department d WHERE d.id = p.department_id) AS departement,
           (SELECT c.nom FROM ref.department d JOIN ref.campus c ON c.id = d.campus_id
            WHERE d.id = p.department_id) AS campus`,
        [
          id,
          campusId,
          modifications.nom?.trim() ?? null,
          modifications.departmentId ?? null,
        ],
      );
      if (rows[0]) return rows[0];
      throw new NotFoundException('Programme introuvable');
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      if (codePg(err) === '23505') {
        throw new ConflictException(
          'Ce programme existe déjà dans le département sélectionné',
        );
      }
      if (codePg(err) === '23503') {
        throw new NotFoundException('Département introuvable');
      }
      throw err;
    }
  }

  async supprimerProgramme(
    userId: number,
    roles: string[],
    id: number,
  ): Promise<{ ok: true }> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    try {
      const rows = await this.db.query<{ id: number }>(
        `DELETE FROM ref.program p
         USING ref.department d
         WHERE p.id = $1 AND d.id = p.department_id
           AND ($2::int IS NULL OR d.campus_id = $2)
         RETURNING p.id`,
        [id, campusId],
      );
      if (!rows.length) throw new NotFoundException('Programme introuvable');
      return { ok: true };
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      if (codePg(err) === '23503') {
        throw new ConflictException(
          'Ce programme est déjà utilisé par des cours ou des mandats et ne peut pas être supprimé',
        );
      }
      throw err;
    }
  }

  async unitesEnseignement(
    userId: number,
    roles: string[],
  ): Promise<UniteEnseignementScolarite[]> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    return this.listerUnites(this.db.query.bind(this.db), campusId);
  }

  async creerUniteEnseignement(
    userId: number,
    roles: string[],
    entree: {
      code: string;
      intitule: string;
      credits: number;
      composantesIds?: number[];
    },
  ): Promise<UniteEnseignementScolarite> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    try {
      return await this.db.transaction(async (query) => {
        const rows = await query<{ id: number }>(
          `INSERT INTO ref.ue (code, intitule, credits)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [entree.code.trim(), entree.intitule.trim(), entree.credits],
        );
        const id = rows[0].id;
        await this.enregistrerComposantes(
          query,
          id,
          entree.composantesIds ?? [],
          campusId,
        );
        const ues = await this.listerUnites(query, campusId, id);
        return ues[0];
      });
    } catch (err) {
      if (codePg(err) === '23505') {
        throw new ConflictException('Ce code UE existe déjà');
      }
      throw err;
    }
  }

  async modifierUniteEnseignement(
    userId: number,
    roles: string[],
    id: number,
    entree: {
      code: string;
      intitule: string;
      credits: number;
      composantesIds?: number[];
    },
  ): Promise<UniteEnseignementScolarite> {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    try {
      return await this.db.transaction(async (query) => {
        const rows = await query<{ id: number }>(
          `UPDATE ref.ue u
           SET code = $2, intitule = $3, credits = $4
           WHERE u.id = $1
             AND NOT EXISTS (
               SELECT 1
               FROM ref.course co
               JOIN ref.program p ON p.id = co.program_id
               JOIN ref.department d ON d.id = p.department_id
               WHERE co.ue_id = u.id
                 AND ($5::int IS NULL OR d.campus_id <> $5)
             )
           RETURNING u.id`,
          [
            id,
            entree.code.trim(),
            entree.intitule.trim(),
            entree.credits,
            campusId,
          ],
        );
        if (!rows[0]) {
          const exists = await query<{ id: number }>(
            'SELECT id FROM ref.ue WHERE id = $1',
            [id],
          );
          if (!exists.length) throw new NotFoundException('UE introuvable');
          throw new ConflictException(
            'Cette UE est utilisée par des cours d’un autre campus et ne peut pas être modifiée',
          );
        }
        if (entree.composantesIds !== undefined) {
          await this.enregistrerComposantes(
            query,
            id,
            entree.composantesIds,
            campusId,
          );
        }
        const ues = await this.listerUnites(query, campusId, id);
        return ues[0];
      });
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      if (codePg(err) === '23505') {
        throw new ConflictException('Ce code UE existe déjà');
      }
      throw err;
    }
  }

  private async listerUnites(
    query: DatabaseQuery,
    campusId: number | null,
    id?: number,
  ): Promise<UniteEnseignementScolarite[]> {
    return query<UniteEnseignementScolarite>(
      `SELECT u.id, u.code, u.intitule, u.credits,
              u.composite_parent_id AS "compositeParentId",
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', composante.id,
                  'code', composante.code,
                  'intitule', composante.intitule,
                  'credits', composante.credits
                ) ORDER BY composante.code)
                FROM ref.ue composante
                WHERE composante.composite_parent_id = u.id
              ), '[]'::jsonb) AS composantes,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', p.id,
                  'nom', p.nom,
                  'departement', d.nom
                ) ORDER BY d.nom, p.nom)
                FROM (
                  SELECT DISTINCT co.program_id
                  FROM ref.course co
                  WHERE co.ue_id = u.id
                ) offres
                JOIN ref.program p ON p.id = offres.program_id
                JOIN ref.department d ON d.id = p.department_id
                WHERE ($1::int IS NULL OR d.campus_id = $1)
              ), '[]'::jsonb) AS programmes,
              NOT EXISTS (
                SELECT 1
                FROM ref.course co
                JOIN ref.program p ON p.id = co.program_id
                JOIN ref.department d ON d.id = p.department_id
                WHERE co.ue_id = u.id
                  AND ($1::int IS NULL OR d.campus_id <> $1)
              ) AS modifiable
       FROM ref.ue u
       WHERE ($2::int IS NULL OR u.id = $2)
       ORDER BY u.code`,
      [campusId, id ?? null],
    );
  }

  private async enregistrerComposantes(
    query: DatabaseQuery,
    parentId: number,
    composantesIds: number[],
    campusId: number | null,
  ): Promise<void> {
    if (composantesIds.includes(parentId)) {
      throw new ConflictException(
        'Une UE ne peut pas être sa propre composante',
      );
    }

    const ids = [...new Set([parentId, ...composantesIds])].sort(
      (a, b) => a - b,
    );
    const ues = await query<{
      id: number;
      composite_parent_id: number | null;
      est_parent: boolean;
    }>(
      `SELECT u.id, u.composite_parent_id,
              EXISTS (
                SELECT 1 FROM ref.ue enfant
                WHERE enfant.composite_parent_id = u.id
              ) AS est_parent
       FROM ref.ue u
       WHERE u.id = ANY($1::int[])
       ORDER BY u.id
       FOR UPDATE`,
      [ids],
    );
    if (ues.length !== ids.length) {
      throw new NotFoundException('Une UE composante est introuvable');
    }

    const parent = ues.find((ue) => ue.id === parentId)!;
    if (parent.composite_parent_id !== null) {
      throw new ConflictException(
        'Une composante ne peut pas devenir elle-même une UE composite',
      );
    }
    if (
      ues.some(
        (ue) =>
          ue.id !== parentId &&
          (ue.est_parent ||
            (ue.composite_parent_id !== null &&
              ue.composite_parent_id !== parentId)),
      )
    ) {
      throw new ConflictException(
        'Une UE composante ne peut pas être une UE composite ou contenir d’autres composantes',
      );
    }

    if (campusId !== null && composantesIds.length > 0) {
      const horsPerimetre = await query<{ id: number }>(
        `SELECT DISTINCT u.id
         FROM ref.ue u
         JOIN ref.course co ON co.ue_id = u.id
         JOIN ref.program p ON p.id = co.program_id
         JOIN ref.department d ON d.id = p.department_id
         WHERE u.id = ANY($1::int[]) AND d.campus_id <> $2`,
        [composantesIds, campusId],
      );
      if (horsPerimetre.length) {
        throw new ConflictException(
          'Une UE composante est utilisée par un autre campus et ne peut pas être rattachée',
        );
      }
    }

    if (composantesIds.length > 0) {
      const coursParent = await query<{ id: number }>(
        'SELECT id FROM ref.course WHERE ue_id = $1 LIMIT 1',
        [parentId],
      );
      if (coursParent.length) {
        throw new ConflictException(
          'Cette UE ne peut pas devenir un regroupement composite tant qu’elle possède une offre de cours distincte',
        );
      }
    }

    await query(
      `UPDATE ref.ue
       SET composite_parent_id = NULL
       WHERE composite_parent_id = $1`,
      [parentId],
    );
    if (composantesIds.length > 0) {
      await query(
        `UPDATE ref.ue
         SET composite_parent_id = $1
         WHERE id = ANY($2::int[])`,
        [parentId, composantesIds],
      );
    }
  }

  async supprimerUniteEnseignement(
    userId: number,
    roles: string[],
    id: number,
  ): Promise<{ ok: true }> {
    await this.campusScope.forScolarite(userId, roles);
    try {
      const rows = await this.db.query<{ id: number }>(
        `DELETE FROM ref.ue u
         WHERE u.id = $1
           AND NOT EXISTS (
             SELECT 1 FROM ref.course co WHERE co.ue_id = u.id
           )
         RETURNING u.id`,
        [id],
      );
      if (rows.length) return { ok: true };

      const exists = await this.db.query<{ id: number }>(
        'SELECT id FROM ref.ue WHERE id = $1',
        [id],
      );
      if (!exists.length) throw new NotFoundException('UE introuvable');
      throw new ConflictException(
        'Cette UE est utilisée par un cours et ne peut pas être supprimée',
      );
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      if (codePg(err) === '23503') {
        throw new ConflictException(
          'Cette UE est utilisée par un cours et ne peut pas être supprimée',
        );
      }
      throw err;
    }
  }

  async tableauDeBord(userId: number, roles: string[]) {
    const campusId = await this.campusScope.forScolarite(userId, roles);
    const [campagnes, comptesSansMotDePasse, participation] = await Promise.all(
      [
        this.db.query<CampagneLigne>(
          CAMPAGNES +
            ' WHERE ($1::int IS NULL OR d.campus_id = $1) ORDER BY c.id DESC',
          [campusId],
        ),
        this.db.query<Compteur>(
          `SELECT COUNT(*)::int AS nombre
         FROM identity.users u
         WHERE u.actif = TRUE AND u.mot_de_passe_hash IS NULL
           AND ($1::int IS NULL OR EXISTS (
             SELECT 1 FROM identity.user_roles r
             WHERE r.user_id = u.id
               AND (r.campus_id = $1 OR r.department_id IN (
                 SELECT d.id FROM ref.department d WHERE d.campus_id = $1
               ))
           ))`,
          [campusId],
        ),
        this.db.query<StatistiquesParticipation>(
          `WITH campagne_courses AS (${CAMPAGNES_AVEC_COURS})
         SELECT
           (SELECT COUNT(*)::int
            FROM campagne_courses cc
            JOIN ref.enrollment e ON e.course_id = cc.course_id) AS inscriptions,
           (SELECT COUNT(*)::int
            FROM campagne_courses cc
            JOIN evaluation.participation_ledger pl
              ON pl.campaign_id = cc.campaign_id AND pl.course_id = cc.course_id) AS participations`,
          [campusId],
        ),
      ],
    );
    const idsCampagnes = campagnes.map((c) => c.id);
    let bulletins = 0;
    let commentairesAModerer = 0;
    if (idsCampagnes.length > 0) {
      const lignesCompteurs = await this.resultsDb.lire<{
        bulletins: number;
        commentaires: number;
      }>(
        `SELECT
           (SELECT COUNT(*)::int FROM ballot.ballots
            WHERE campaign_id = ANY($1::int[])) AS bulletins,
           (SELECT COUNT(*)::int
            FROM ballot.ballot_comments cm
            JOIN ballot.ballots b ON b.id = cm.ballot_id
            JOIN evaluation.campaigns c ON c.id = b.campaign_id
            WHERE b.campaign_id = ANY($1::int[])
              AND cm.statut = 'a_moderer'
              AND c.statut IN ('close', 'restituee')
              AND c.urne_melangee_le IS NOT NULL
              AND b.course_id IN (
                SELECT b2.course_id
                FROM ballot.ballots b2
                WHERE b2.campaign_id = b.campaign_id
                GROUP BY b2.course_id
                HAVING COUNT(*) >= $2::int
              )) AS commentaires`,
        [idsCampagnes, SEUIL_ANONYMAT],
      );
      const compteurs = lignesCompteurs[0];
      bulletins = compteurs?.bulletins ?? 0;
      commentairesAModerer = compteurs?.commentaires ?? 0;
    }

    return {
      campagnesOuvertes: campagnes.filter((c) => c.statut === 'ouverte').length,
      comptesSansMotDePasse: comptesSansMotDePasse[0]?.nombre ?? 0,
      commentairesAModerer,
      participation: {
        inscriptions: participation[0]?.inscriptions ?? 0,
        participations: participation[0]?.participations ?? 0,
        bulletins,
      },
      campagnes: campagnes.map((c) => ({
        id: c.id,
        libelle: c.libelle,
        departmentId: c.department_id,
        departement: c.departement,
        anneeUniversitaire: c.annee_universitaire,
        semestre: c.semestre,
        versionId: c.version_id,
        debut: c.debut,
        fin: c.fin,
        statut: c.statut,
      })),
    };
  }
}
