import { Injectable } from '@nestjs/common';
import { DatabaseQuery, DatabaseService } from '../database/database.service';
import {
  calculerHashEntreeAuditServeur,
  GENESIS_AUDIT_HASH,
  signerHashAuditHmac,
  verifierSignatureHmacAudit,
  type CategorieAuditServeur,
  type ContexteForensicRequete,
  type GraviteAuditServeur,
} from './audit-forensic.util';

export interface EntreeAudit {
  userId?: number;
  userRole?: string;
  categorie?: CategorieAuditServeur;
  gravite?: GraviteAuditServeur;
  action: string;
  courseId?: number;
  campusId?: number;
  objet?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  forensic?: ContexteForensicRequete;
}

export interface FiltresAuditServeur {
  limite: number;
  userId?: number;
  matricule?: string;
  role?: string;
  categorie?: string;
  gravite?: string;
  ip?: string;
  dateDebut?: string;
  dateFin?: string;
  recherche?: string;
}

interface LigneAuditSql {
  id: number;
  cree_le: string;
  user_id: number | null;
  user_matricule: string | null;
  user_nom_complet: string | null;
  user_role: string | null;
  categorie: CategorieAuditServeur | null;
  gravite: GraviteAuditServeur | null;
  action: string;
  methode_http: string | null;
  chemin_http: string | null;
  statut_http: number | null;
  duree_ms: number | null;
  ip_address: string | null;
  ip_forwarded_chain: string | null;
  user_agent: string | null;
  os_nom: string | null;
  navigateur_nom: string | null;
  appareil_type: string | null;
  device_fingerprint: string | null;
  ecran_resolution: string | null;
  fuseau_horaire: string | null;
  langue: string | null;
  geo_source: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_precision_m: number | null;
  geo_ville: string | null;
  geo_region: string | null;
  geo_pays: string | null;
  geo_fai: string | null;
  session_id: string | null;
  campaign_id: number | null;
  course_id: number | null;
  campus_id: number | null;
  objet: string | null;
  detail: string | null;
  metadata_json: Record<string, unknown> | null;
  previous_hash: string | null;
  entry_hash: string | null;
  hmac_signature: string | null;
}

interface ActeurCacheEntree {
  matricule: string | null;
  nomComplet: string | null;
  expiresAt: number;
}

const TTL_CACHE_ACTEUR_MS = 5 * 60_000;
const TAILLE_MAX_CACHE_ACTEUR = 5_000;

@Injectable()
export class AuditService {
  private readonly acteurCache = new Map<number, ActeurCacheEntree>();

  constructor(private readonly db: DatabaseService) {}

  private lireActeurEnCache(userId: number): ActeurCacheEntree | null {
    const entree = this.acteurCache.get(userId);
    if (!entree) return null;
    if (Date.now() >= entree.expiresAt) {
      this.acteurCache.delete(userId);
      return null;
    }
    return entree;
  }

  private ecrireActeurEnCache(
    userId: number,
    matricule: string | null,
    nomComplet: string | null,
  ): void {
    if (this.acteurCache.size >= TAILLE_MAX_CACHE_ACTEUR) {
      const premiereCle = this.acteurCache.keys().next().value;
      if (premiereCle !== undefined) {
        this.acteurCache.delete(premiereCle);
      }
    }
    this.acteurCache.set(userId, {
      matricule,
      nomComplet,
      expiresAt: Date.now() + TTL_CACHE_ACTEUR_MS,
    });
  }

  async enregistrer(entree: EntreeAudit): Promise<void> {
    await this.enregistrerDans(this.db.query.bind(this.db), entree);
  }

  async enregistrerDans(
    query: DatabaseQuery,
    entree: EntreeAudit,
  ): Promise<void> {
    const f = entree.forensic ?? {};
    const creeLe = new Date().toISOString();

    // Recuperer le dernier hash pour sceller la chaine cryptographique
    const derniers = await query<{ id: number; entry_hash: string | null }>(
      `SELECT id, entry_hash FROM audit.journal ORDER BY id DESC LIMIT 1`,
    );
    const previousHash = derniers[0]?.entry_hash ?? GENESIS_AUDIT_HASH;
    const nextIdApprox = (derniers[0]?.id ?? 0) + 1;

    // Resoudre identite complete (matricule + nom complet) avec cache memoire borne (5 min)
    let userMatricule: string | null = null;
    let userNomComplet: string | null = null;
    if (entree.userId !== undefined) {
      const enCache = this.lireActeurEnCache(entree.userId);
      if (enCache) {
        userMatricule = enCache.matricule;
        userNomComplet = enCache.nomComplet;
      } else {
        const acteurs = await query<{
          matricule: string | null;
          nom: string | null;
          prenom: string | null;
        }>(
          `SELECT matricule, nom, prenom FROM identity.users WHERE id = $1 LIMIT 1`,
          [entree.userId],
        );
        if (acteurs[0]) {
          userMatricule = acteurs[0].matricule;
          userNomComplet = [acteurs[0].prenom, acteurs[0].nom]
            .filter(Boolean)
            .join(' ') || null;
          this.ecrireActeurEnCache(entree.userId, userMatricule, userNomComplet);
        }
      }
    }

    const entryHash = calculerHashEntreeAuditServeur({
      id: nextIdApprox,
      creeLe,
      userId: entree.userId ?? null,
      userMatricule,
      userRole: entree.userRole ?? null,
      action: entree.action,
      methodeHttp: f.methodeHttp ?? null,
      cheminHttp: f.cheminHttp ?? null,
      statutHttp: f.statutHttp ?? null,
      ipAddress: f.ipAddress ?? null,
      deviceFingerprint: f.deviceFingerprint ?? null,
      geoLatitude: f.geoLatitude ?? null,
      geoLongitude: f.geoLongitude ?? null,
      objet: entree.objet ?? null,
      detail: entree.detail ?? null,
      previousHash,
    });
    const hmacSignature = signerHashAuditHmac(entryHash);

    await query(
      `INSERT INTO audit.journal (
         cree_le, user_id, user_matricule, user_nom_complet, user_role,
         categorie, gravite, action, course_id, campus_id, objet, detail,
         methode_http, chemin_http, statut_http, duree_ms,
         ip_address, ip_forwarded_chain, user_agent, os_nom, navigateur_nom, appareil_type,
         device_fingerprint, ecran_resolution, fuseau_horaire, langue,
         geo_source, geo_latitude, geo_longitude, geo_precision_m,
         geo_ville, geo_region, geo_pays, geo_fai,
         session_id, metadata_json, previous_hash, entry_hash, hmac_signature
       ) VALUES (
         $1::timestamptz, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16,
         $17, $18, $19, $20, $21, $22,
         $23, $24, $25, $26,
         $27, $28, $29, $30,
         $31, $32, $33, $34,
         $35, $36::jsonb, $37, $38, $39
       )`,
      [
        creeLe,
        entree.userId ?? null,
        userMatricule,
        userNomComplet,
        entree.userRole ?? null,
        entree.categorie ?? 'academique',
        entree.gravite ?? 'info',
        entree.action,
        entree.courseId ?? null,
        entree.campusId ?? null,
        entree.objet ?? null,
        entree.detail ?? null,
        f.methodeHttp ?? null,
        f.cheminHttp ?? null,
        f.statutHttp ?? null,
        f.dureeMs ?? null,
        f.ipAddress ?? null,
        f.ipForwardedChain ?? null,
        f.userAgent ?? null,
        f.osNom ?? null,
        f.navigateurNom ?? null,
        f.appareilType ?? null,
        f.deviceFingerprint ?? null,
        f.ecranResolution ?? null,
        f.fuseauHoraire ?? null,
        f.langue ?? null,
        f.geoSource ?? null,
        f.geoLatitude ?? null,
        f.geoLongitude ?? null,
        f.geoPrecisionMetres ?? null,
        f.geoVille ?? null,
        f.geoRegion ?? null,
        f.geoPays ?? null,
        f.geoFai ?? null,
        f.sessionId ?? null,
        entree.metadata ? JSON.stringify(entree.metadata) : null,
        previousHash,
        entryHash,
        hmacSignature,
      ],
    );
  }

  async lister(filtres: FiltresAuditServeur) {
    const clauses: string[] = [];
    const params: unknown[] = [];

    const addParam = (val: unknown) => {
      params.push(val);
      return `$${params.length}`;
    };

    if (filtres.userId !== undefined) {
      clauses.push(`user_id = ${addParam(filtres.userId)}`);
    }
    if (filtres.matricule) {
      clauses.push(`LOWER(COALESCE(user_matricule, '')) = LOWER(${addParam(filtres.matricule)})`);
    }
    if (filtres.role) {
      clauses.push(`user_role = ${addParam(filtres.role)}`);
    }
    if (filtres.categorie) {
      clauses.push(`categorie = ${addParam(filtres.categorie)}`);
    }
    if (filtres.gravite) {
      clauses.push(`gravite = ${addParam(filtres.gravite)}`);
    }
    if (filtres.ip) {
      clauses.push(`COALESCE(ip_address, '') ILIKE ${addParam(`%${filtres.ip}%`)}`);
    }
    if (filtres.dateDebut) {
      clauses.push(`cree_le >= ${addParam(filtres.dateDebut)}::timestamptz`);
    }
    if (filtres.dateFin) {
      clauses.push(`cree_le <= ${addParam(filtres.dateFin)}::timestamptz`);
    }
    if (filtres.recherche) {
      const p = addParam(`%${filtres.recherche}%`);
      clauses.push(
        `(COALESCE(user_matricule, '') ILIKE ${p}
          OR COALESCE(user_nom_complet, '') ILIKE ${p}
          OR COALESCE(action, '') ILIKE ${p}
          OR COALESCE(objet, '') ILIKE ${p}
          OR COALESCE(detail, '') ILIKE ${p}
          OR COALESCE(ip_address, '') ILIKE ${p}
          OR COALESCE(geo_ville, '') ILIKE ${p}
          OR COALESCE(device_fingerprint, '') ILIKE ${p})`,
      );
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitParam = addParam(filtres.limite);

    const rows = await this.db.query<LigneAuditSql>(
      `SELECT id,
              to_char(cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS cree_le,
              user_id, user_matricule, user_nom_complet, user_role,
              categorie, gravite, action,
              methode_http, chemin_http, statut_http, duree_ms,
              ip_address, ip_forwarded_chain, user_agent, os_nom, navigateur_nom, appareil_type,
              device_fingerprint, ecran_resolution, fuseau_horaire, langue,
              geo_source, geo_latitude, geo_longitude, geo_precision_m,
              geo_ville, geo_region, geo_pays, geo_fai,
              session_id, campaign_id, course_id, campus_id, objet, detail, metadata_json,
              previous_hash, entry_hash, hmac_signature
       FROM audit.journal
       ${whereClause}
       ORDER BY cree_le DESC, id DESC
       LIMIT ${limitParam}`,
      params,
    );

    return rows.map((row) => this.formaterLigne(row));
  }

  async historiqueUtilisateur(userId: number, limite = 500) {
    return this.lister({ userId, limite });
  }

  async verifierIntegrite(limite = 500) {
    const rows = await this.db.query<LigneAuditSql>(
      `SELECT id,
              to_char(cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS cree_le,
              user_id, user_matricule, user_role, action,
              methode_http, chemin_http, statut_http,
              ip_address, device_fingerprint, geo_latitude, geo_longitude,
              objet, detail, previous_hash, entry_hash, hmac_signature
       FROM audit.journal
       ORDER BY id ASC
       LIMIT $1`,
      [limite],
    );

    const anomalies: { id: number; raison: string }[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row.entry_hash || !row.previous_hash) {
        anomalies.push({
          id: row.id,
          raison: 'Empreinte cryptographique absente.',
        });
        continue;
      }

      if (i > 0 && row.previous_hash !== rows[i - 1].entry_hash) {
        anomalies.push({
          id: row.id,
          raison: `Rupture de chaînage entre #${rows[i - 1].id} et #${row.id}.`,
        });
      }

      if (
        row.hmac_signature &&
        !verifierSignatureHmacAudit(row.entry_hash, row.hmac_signature)
      ) {
        anomalies.push({
          id: row.id,
          raison: 'Signature HMAC serveur invalide.',
        });
      }
    }

    return {
      intact: anomalies.length === 0,
      totalVerifie: rows.length,
      dernierHash: rows.length > 0 ? (rows[rows.length - 1].entry_hash ?? undefined) : undefined,
      verifieLe: new Date().toISOString(),
      anomalies,
    };
  }

  private formaterLigne(row: LigneAuditSql) {
    return {
      id: row.id,
      creeLe: row.cree_le,
      userId: row.user_id ?? undefined,
      userMatricule: row.user_matricule ?? undefined,
      userNomComplet: row.user_nom_complet ?? undefined,
      userRole: row.user_role ?? undefined,
      categorie: row.categorie ?? undefined,
      gravite: row.gravite ?? undefined,
      action: row.action,
      methodeHttp: row.methode_http ?? undefined,
      cheminHttp: row.chemin_http ?? undefined,
      statutHttp: row.statut_http ?? undefined,
      dureeMs: row.duree_ms ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      ipForwardedChain: row.ip_forwarded_chain ?? undefined,
      userAgent: row.user_agent ?? undefined,
      osNom: row.os_nom ?? undefined,
      navigateurNom: row.navigateur_nom ?? undefined,
      appareilType: row.appareil_type ?? undefined,
      deviceFingerprint: row.device_fingerprint ?? undefined,
      ecranResolution: row.ecran_resolution ?? undefined,
      fuseauHoraire: row.fuseau_horaire ?? undefined,
      langue: row.langue ?? undefined,
      geoSource: row.geo_source ?? undefined,
      geoLatitude: row.geo_latitude ?? undefined,
      geoLongitude: row.geo_longitude ?? undefined,
      geoPrecisionMetres: row.geo_precision_m ?? undefined,
      geoVille: row.geo_ville ?? undefined,
      geoRegion: row.geo_region ?? undefined,
      geoPays: row.geo_pays ?? undefined,
      geoFai: row.geo_fai ?? undefined,
      sessionId: row.session_id ?? undefined,
      campaignId: row.campaign_id ?? undefined,
      courseId: row.course_id ?? undefined,
      objet: row.objet ?? undefined,
      detail: row.detail ?? undefined,
      metadata: row.metadata_json ?? undefined,
      previousHash: row.previous_hash ?? undefined,
      entryHash: row.entry_hash ?? undefined,
      hmacSignature: row.hmac_signature ?? undefined,
    };
  }
}
