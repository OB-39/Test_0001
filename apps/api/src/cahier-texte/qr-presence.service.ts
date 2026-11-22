import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  DUREE_ROTATION_MS,
  FENETRE_VALIDITE_DEFAUT_MS,
  extraireMetadonneesJeton,
  genererGraineSession,
  genererJetonPresence,
  validerJetonPresence,
} from './qr-presence-crypto.util';

/**
 * Service metier de gestion des sessions d'emargement par QR Code dynamique tournant.
 * Conception institutionnelle ENP : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */

export interface ArriveePresenceRecente {
  etudiantId: number;
  nom: string;
  prenom: string;
  identifiant: string | null;
  scanneA: string;
}

export interface EtatSessionQrPresence {
  sessionId: number;
  seanceId: number;
  courseId: number;
  codeUe: string;
  intituleUe: string;
  libelleSeance: string;
  dateSeance: string;
  statut: 'ouverte' | 'pause' | 'fermee';
  ouvertA: string;
  fermeA: string | null;
  dureeValiditeSecondes: number;
  token: string;
  counter: number;
  timestampMs: number;
  expireDansMs: number;
  presents: number;
  inscrits: number;
  recents: ArriveePresenceRecente[];
}

export interface ResultatScanPresence {
  ok: true;
  seanceId: number;
  codeUe: string;
  intituleUe: string;
  libelleSeance: string;
  dateSeance: string;
  scanneA: string;
  statut: 'present';
  message: string;
}

interface SeanceInfoRow {
  seance_id: number;
  course_id: number;
  code_ue: string;
  intitule_ue: string;
  libelle_seance: string;
  date_seance: string;
}

interface SessionRow {
  id: number;
  seance_id: number;
  enseignant_id: number;
  statut: 'ouverte' | 'pause' | 'fermee';
  session_secret: string;
  token_counter: number;
  ouvert_a: string;
  ferme_a: string | null;
  duree_validite_secondes: number;
}

interface CountRow {
  total: string | number;
}

interface RecentRow {
  etudiant_id: number;
  nom: string;
  prenom: string;
  identifiant: string | null;
  scanne_a: string;
}

@Injectable()
export class QrPresenceService {
  private readonly fallbackSecret = randomBytes(32).toString('hex');

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private secretCleSession(sessionSecret: string): string {
    const serverSecret =
      this.config.get<string>('QR_PRESENCE_SECRET')?.trim() ||
      this.fallbackSecret;
    return `${serverSecret}:${sessionSecret}`;
  }

  private async verifierSeanceEnseignant(
    enseignantId: number,
    seanceId: number,
  ): Promise<SeanceInfoRow> {
    const rows = await this.db.query<SeanceInfoRow>(
      `SELECT
         s.id AS seance_id,
         s.course_id,
         u.code AS code_ue,
         u.intitule AS intitule_ue,
         s.libelle AS libelle_seance,
         to_char(s.date, 'YYYY-MM-DD') AS date_seance
       FROM academic.attendance_sessions s
       JOIN ref.course c ON c.id = s.course_id
       JOIN ref.ue u ON u.id = c.ue_id
       JOIN ref.teaching_assignment ta
         ON ta.course_id = s.course_id AND ta.teacher_id = $2
       WHERE s.id = $1`,
      [seanceId, enseignantId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException(
        'Seance introuvable ou non rattachee a vos enseignements.',
      );
    }
    return rows[0];
  }

  private async chargerCompteursEtRecents(
    seanceId: number,
    courseId: number,
  ): Promise<{
    presents: number;
    inscrits: number;
    recents: ArriveePresenceRecente[];
  }> {
    const [inscritsRows, presentsRows, recentsRows] = await Promise.all([
      this.db.query<CountRow>(
        `SELECT COUNT(*)::int AS total FROM ref.enrollment WHERE course_id = $1`,
        [courseId],
      ),
      this.db.query<CountRow>(
        `SELECT COUNT(*)::int AS total
         FROM academic.attendance_records
         WHERE session_id = $1 AND statut IN ('present', 'retard')`,
        [seanceId],
      ),
      this.db.query<RecentRow>(
        `SELECT
           l.etudiant_id,
           u.nom,
           u.prenom,
           u.identifiant,
           l.scanne_a::text AS scanne_a
         FROM academic.presence_scan_log l
         JOIN identity.users u ON u.id = l.etudiant_id
         WHERE l.seance_id = $1 AND l.statut = 'valide'
         ORDER BY l.scanne_a DESC
         LIMIT 5`,
        [seanceId],
      ),
    ]);

    return {
      inscrits: Number(inscritsRows[0]?.total ?? 0),
      presents: Number(presentsRows[0]?.total ?? 0),
      recents: recentsRows.map((row) => ({
        etudiantId: row.etudiant_id,
        nom: row.nom,
        prenom: row.prenom,
        identifiant: row.identifiant,
        scanneA: row.scanne_a,
      })),
    };
  }

  async demarrerSession(
    enseignantId: number,
    seanceId: number,
  ): Promise<EtatSessionQrPresence> {
    const seance = await this.verifierSeanceEnseignant(enseignantId, seanceId);
    const graine = genererGraineSession();

    const rows = await this.db.query<SessionRow>(
      `INSERT INTO academic.seance_presence_session
         (seance_id, enseignant_id, statut, session_secret, token_counter, ouvert_a, ferme_a, duree_validite_secondes)
       VALUES ($1, $2, 'ouverte', $3, 1, NOW(), NULL, 6)
       ON CONFLICT (seance_id) DO UPDATE
         SET enseignant_id = EXCLUDED.enseignant_id,
             statut = 'ouverte',
             session_secret = EXCLUDED.session_secret,
             token_counter = academic.seance_presence_session.token_counter + 1,
             ouvert_a = NOW(),
             ferme_a = NULL
       RETURNING id, seance_id, enseignant_id, statut, session_secret, token_counter,
                 ouvert_a::text AS ouvert_a, ferme_a::text AS ferme_a, duree_validite_secondes`,
      [seanceId, enseignantId, graine],
    );

    const session = rows[0];
    const jeton = genererJetonPresence(
      seanceId,
      session.token_counter,
      this.secretCleSession(session.session_secret),
    );
    const stats = await this.chargerCompteursEtRecents(
      seanceId,
      seance.course_id,
    );

    return {
      sessionId: session.id,
      seanceId: seance.seance_id,
      courseId: seance.course_id,
      codeUe: seance.code_ue,
      intituleUe: seance.intitule_ue,
      libelleSeance: seance.libelle_seance,
      dateSeance: seance.date_seance,
      statut: session.statut,
      ouvertA: session.ouvert_a,
      fermeA: session.ferme_a,
      dureeValiditeSecondes: session.duree_validite_secondes,
      token: jeton.token,
      counter: jeton.counter,
      timestampMs: jeton.timestampMs,
      expireDansMs: DUREE_ROTATION_MS,
      presents: stats.presents,
      inscrits: stats.inscrits,
      recents: stats.recents,
    };
  }

  async obtenirJeton(
    enseignantId: number,
    seanceId: number,
  ): Promise<EtatSessionQrPresence> {
    const seance = await this.verifierSeanceEnseignant(enseignantId, seanceId);

    const rows = await this.db.query<SessionRow>(
      `UPDATE academic.seance_presence_session
       SET token_counter = CASE WHEN statut = 'ouverte' THEN token_counter + 1 ELSE token_counter END
       WHERE seance_id = $1
       RETURNING id, seance_id, enseignant_id, statut, session_secret, token_counter,
                 ouvert_a::text AS ouvert_a, ferme_a::text AS ferme_a, duree_validite_secondes`,
      [seanceId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'Aucune session de projection active pour cette seance.',
      );
    }

    const session = rows[0];
    const jeton =
      session.statut === 'ouverte'
        ? genererJetonPresence(
            seanceId,
            Math.max(1, session.token_counter),
            this.secretCleSession(session.session_secret),
          )
        : {
            token: '',
            counter: session.token_counter,
            timestampMs: Date.now(),
            expireDansMs: 0,
          };
    const stats = await this.chargerCompteursEtRecents(
      seanceId,
      seance.course_id,
    );

    return {
      sessionId: session.id,
      seanceId: seance.seance_id,
      courseId: seance.course_id,
      codeUe: seance.code_ue,
      intituleUe: seance.intitule_ue,
      libelleSeance: seance.libelle_seance,
      dateSeance: seance.date_seance,
      statut: session.statut,
      ouvertA: session.ouvert_a,
      fermeA: session.ferme_a,
      dureeValiditeSecondes: session.duree_validite_secondes,
      token: jeton.token,
      counter: jeton.counter,
      timestampMs: jeton.timestampMs,
      expireDansMs: jeton.expireDansMs,
      presents: stats.presents,
      inscrits: stats.inscrits,
      recents: stats.recents,
    };
  }

  async mettreEnPauseSession(
    enseignantId: number,
    seanceId: number,
  ): Promise<EtatSessionQrPresence> {
    const seance = await this.verifierSeanceEnseignant(enseignantId, seanceId);

    const rows = await this.db.query<SessionRow>(
      `UPDATE academic.seance_presence_session
       SET statut = 'pause'
       WHERE seance_id = $1 AND statut = 'ouverte'
       RETURNING id, seance_id, enseignant_id, statut, session_secret, token_counter,
                 ouvert_a::text AS ouvert_a, ferme_a::text AS ferme_a, duree_validite_secondes`,
      [seanceId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'Aucune session ouverte a mettre en pause pour cette seance.',
      );
    }

    const session = rows[0];
    const stats = await this.chargerCompteursEtRecents(
      seanceId,
      seance.course_id,
    );

    return {
      sessionId: session.id,
      seanceId: seance.seance_id,
      courseId: seance.course_id,
      codeUe: seance.code_ue,
      intituleUe: seance.intitule_ue,
      libelleSeance: seance.libelle_seance,
      dateSeance: seance.date_seance,
      statut: session.statut,
      ouvertA: session.ouvert_a,
      fermeA: session.ferme_a,
      dureeValiditeSecondes: session.duree_validite_secondes,
      token: '',
      counter: session.token_counter,
      timestampMs: Date.now(),
      expireDansMs: 0,
      presents: stats.presents,
      inscrits: stats.inscrits,
      recents: stats.recents,
    };
  }

  async reprendreSession(
    enseignantId: number,
    seanceId: number,
  ): Promise<EtatSessionQrPresence> {
    const seance = await this.verifierSeanceEnseignant(enseignantId, seanceId);

    const rows = await this.db.query<SessionRow>(
      `UPDATE academic.seance_presence_session
       SET statut = 'ouverte',
           token_counter = token_counter + 1
       WHERE seance_id = $1 AND statut = 'pause'
       RETURNING id, seance_id, enseignant_id, statut, session_secret, token_counter,
                 ouvert_a::text AS ouvert_a, ferme_a::text AS ferme_a, duree_validite_secondes`,
      [seanceId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'Aucune session en pause a reprendre pour cette seance.',
      );
    }

    const session = rows[0];
    const jeton = genererJetonPresence(
      seanceId,
      session.token_counter,
      this.secretCleSession(session.session_secret),
    );
    const stats = await this.chargerCompteursEtRecents(
      seanceId,
      seance.course_id,
    );

    return {
      sessionId: session.id,
      seanceId: seance.seance_id,
      courseId: seance.course_id,
      codeUe: seance.code_ue,
      intituleUe: seance.intitule_ue,
      libelleSeance: seance.libelle_seance,
      dateSeance: seance.date_seance,
      statut: session.statut,
      ouvertA: session.ouvert_a,
      fermeA: session.ferme_a,
      dureeValiditeSecondes: session.duree_validite_secondes,
      token: jeton.token,
      counter: jeton.counter,
      timestampMs: jeton.timestampMs,
      expireDansMs: DUREE_ROTATION_MS,
      presents: stats.presents,
      inscrits: stats.inscrits,
      recents: stats.recents,
    };
  }

  async cloturerSession(
    enseignantId: number,
    seanceId: number,
  ): Promise<EtatSessionQrPresence> {
    const seance = await this.verifierSeanceEnseignant(enseignantId, seanceId);

    const rows = await this.db.query<SessionRow>(
      `UPDATE academic.seance_presence_session
       SET statut = 'fermee',
           ferme_a = COALESCE(ferme_a, NOW())
       WHERE seance_id = $1
       RETURNING id, seance_id, enseignant_id, statut, session_secret, token_counter,
                 ouvert_a::text AS ouvert_a, ferme_a::text AS ferme_a, duree_validite_secondes`,
      [seanceId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        'Aucune session de projection trouvee pour cette seance.',
      );
    }

    const session = rows[0];
    const stats = await this.chargerCompteursEtRecents(
      seanceId,
      seance.course_id,
    );

    return {
      sessionId: session.id,
      seanceId: seance.seance_id,
      courseId: seance.course_id,
      codeUe: seance.code_ue,
      intituleUe: seance.intitule_ue,
      libelleSeance: seance.libelle_seance,
      dateSeance: seance.date_seance,
      statut: session.statut,
      ouvertA: session.ouvert_a,
      fermeA: session.ferme_a,
      dureeValiditeSecondes: session.duree_validite_secondes,
      token: '',
      counter: session.token_counter,
      timestampMs: Date.now(),
      expireDansMs: 0,
      presents: stats.presents,
      inscrits: stats.inscrits,
      recents: stats.recents,
    };
  }

  async scannerPresence(
    etudiantId: number,
    token: string,
    deviceFingerprint: string,
    ipAddress?: string,
  ): Promise<ResultatScanPresence> {
    const meta = extraireMetadonneesJeton(token);
    if (!meta) {
      throw new BadRequestException(
        'QR Code invalide ou non reconnu par la plateforme ENP.',
      );
    }

    const sessions = await this.db.query<
      SessionRow & {
        course_id: number;
        code_ue: string;
        intitule_ue: string;
        libelle_seance: string;
        date_seance: string;
      }
    >(
      `SELECT
         sps.id,
         sps.seance_id,
         sps.enseignant_id,
         sps.statut,
         sps.session_secret,
         sps.token_counter,
         sps.ouvert_a::text AS ouvert_a,
         sps.ferme_a::text AS ferme_a,
         sps.duree_validite_secondes,
         s.course_id,
         u.code AS code_ue,
         u.intitule AS intitule_ue,
         s.libelle AS libelle_seance,
         to_char(s.date, 'YYYY-MM-DD') AS date_seance
       FROM academic.seance_presence_session sps
       JOIN academic.attendance_sessions s ON s.id = sps.seance_id
       JOIN ref.course c ON c.id = s.course_id
       JOIN ref.ue u ON u.id = c.ue_id
       WHERE sps.seance_id = $1`,
      [meta.seanceId],
    );

    if (sessions.length === 0) {
      throw new NotFoundException(
        "Aucune session d'emargement active pour cette seance.",
      );
    }

    const session = sessions[0];
    if (session.statut !== 'ouverte') {
      throw new ForbiddenException(
        "L'emargement a ete cloture par l'enseignant.",
      );
    }

    const verification = validerJetonPresence(
      token,
      this.secretCleSession(session.session_secret),
      FENETRE_VALIDITE_DEFAUT_MS,
    );

    if (!verification.valide) {
      throw new BadRequestException(
        verification.erreur || 'QR Code invalide ou expire.',
      );
    }

    const inscription = await this.db.query<{ ok: number }>(
      `SELECT 1 AS ok FROM ref.enrollment WHERE course_id = $1 AND student_id = $2`,
      [session.course_id, etudiantId],
    );
    if (inscription.length === 0) {
      throw new ForbiddenException(
        "Vous n'etes pas inscrit a cette unite d'enseignement.",
      );
    }

    const dejaScan = await this.db.query<{ id: number }>(
      `SELECT id FROM academic.presence_scan_log
       WHERE seance_id = $1 AND etudiant_id = $2 AND statut = 'valide'`,
      [session.seance_id, etudiantId],
    );
    if (dejaScan.length > 0) {
      throw new ConflictException(
        'Vous avez deja emarge pour cette seance.',
      );
    }

    const appareilUtilise = await this.db.query<{ etudiant_id: number }>(
      `SELECT etudiant_id FROM academic.presence_scan_log
       WHERE seance_id = $1
         AND device_fingerprint = $2
         AND etudiant_id <> $3
         AND statut = 'valide'
       LIMIT 1`,
      [session.seance_id, deviceFingerprint, etudiantId],
    );
    if (appareilUtilise.length > 0) {
      throw new ForbiddenException(
        'Cet appareil a deja ete utilise pour un emargement pour cette seance.',
      );
    }

    const scanneA = await this.db.transaction(async (query) => {
      const inserted = await query<{ scanne_a: string }>(
        `INSERT INTO academic.presence_scan_log
           (seance_id, etudiant_id, token_counter, token_age_ms, ip_address, device_fingerprint, statut)
         VALUES ($1, $2, $3, $4, $5, $6, 'valide')
         RETURNING scanne_a::text AS scanne_a`,
        [
          session.seance_id,
          etudiantId,
          verification.counter ?? meta.counter,
          verification.tokenAgeMs ?? 0,
          ipAddress?.slice(0, 45) ?? null,
          deviceFingerprint,
        ],
      );

      await query(
        `INSERT INTO academic.attendance_records
           (session_id, course_id, student_id, statut, updated_by, updated_at)
         VALUES ($1, $2, $3, 'present', $4, NOW())
         ON CONFLICT (session_id, student_id) DO UPDATE
           SET statut = 'present',
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
        [session.seance_id, session.course_id, etudiantId, session.enseignant_id],
      );

      return inserted[0]?.scanne_a ?? new Date().toISOString();
    });

    const heure = new Date(scanneA).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      ok: true,
      seanceId: session.seance_id,
      codeUe: session.code_ue,
      intituleUe: session.intitule_ue,
      libelleSeance: session.libelle_seance,
      dateSeance: session.date_seance,
      scanneA,
      statut: 'present',
      message: `Presence validee pour ${session.code_ue} a ${heure.replace(':', 'h')}`,
    };
  }
}
