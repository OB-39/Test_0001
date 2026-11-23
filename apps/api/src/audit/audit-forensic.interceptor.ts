import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { RequeteAuthentifiee } from '../auth/auth.types';
import { AuditService } from './audit.service';
import {
  extraireContexteForensic,
  redigerMetadonneesAudit,
  type CategorieAuditServeur,
  type GraviteAuditServeur,
} from './audit-forensic.util';

/**
 * Intercepteur global de tracabilite forensique ENP.
 * Trace automatiquement chaque requete authentifiee ou de connexion (y compris
 * directeurs, scolarite, enseignants, delegues, etudiants et administrateurs)
 * tout en excluant strictement le contenu des bulletins de vote anonymes.
 */
@Injectable()
export class AuditForensicInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request & RequeteAuthentifiee>();
    const res = http.getResponse<Response>();

    const cheminBrut = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const methode = (req.method ?? 'GET').toUpperCase();

    // Ne pas boucler sur les endpoints techniques de sante ni lier un vote anonyme
    if (
      cheminBrut.includes('/health') ||
      cheminBrut.includes('/ballots') ||
      cheminBrut.includes('/audit/evenement-client')
    ) {
      return next.handle();
    }

    const debut = Date.now();
    const contexte = extraireContexteForensic(
      req.headers,
      req.ip ?? req.socket?.remoteAddress,
      methode,
      cheminBrut,
    );

    const enregistrerEvenement = (statutHttp: number, erreurMessage?: string) => {
      // Les lectures simples non sensibles (ex: polling notifications) ne saturent pas le journal
      if (
        methode === 'GET' &&
        statutHttp < 400 &&
        (cheminBrut.includes('/notifications') || cheminBrut.includes('/presences/sessions/'))
      ) {
        return;
      }

      const utilisateur = req.utilisateur;
      // On trace toute requete authentifiee, toute tentative d'auth, et tout refus 401/403
      if (!utilisateur && !cheminBrut.includes('/auth/') && statutHttp < 400) {
        return;
      }

      const { categorie, gravite, action } = this.classifierRequete(
        methode,
        cheminBrut,
        statutHttp,
        utilisateur?.activeRole,
      );

      void this.audit
        .enregistrer({
          userId: utilisateur?.id,
          userRole: utilisateur?.activeRole,
          categorie,
          gravite,
          action,
          objet: cheminBrut,
          detail:
            erreurMessage ??
            `${methode} ${cheminBrut} (${statutHttp})`,
          metadata: redigerMetadonneesAudit(req.body),
          forensic: {
            ...contexte,
            statutHttp,
            dureeMs: Date.now() - debut,
          },
        })
        .catch(() => {
          // Ne jamais bloquer une reponse metier en cas d'indisponibilite transitoire du journal
        });
    };

    return next.handle().pipe(
      tap({
        next: () => enregistrerEvenement(res.statusCode ?? 200),
        error: (err: { status?: number; message?: string }) =>
          enregistrerEvenement(err?.status ?? 500, err?.message),
      }),
    );
  }

  private classifierRequete(
    methode: string,
    chemin: string,
    statut: number,
    role?: string,
  ): {
    categorie: CategorieAuditServeur;
    gravite: GraviteAuditServeur;
    action: string;
  } {
    if (statut === 401 || statut === 403) {
      return {
        categorie: 'securite',
        gravite: 'alerte',
        action: statut === 403 ? 'ACCES_REFUSE_403' : 'AUTHENTIFICATION_REFUSEE_401',
      };
    }

    if (chemin.includes('/auth/')) {
      return {
        categorie: 'authentification',
        gravite: statut >= 400 ? 'alerte' : 'sensible',
        action: chemin.includes('/login')
          ? 'CONNEXION_PORTAIL'
          : chemin.includes('/logout')
            ? 'DECONNEXION_PORTAIL'
            : chemin.includes('/role')
              ? 'BASCULE_ROLE'
              : 'OPERATION_AUTHENTIFICATION',
      };
    }

    if (chemin.includes('/audit')) {
      return {
        categorie: 'securite',
        gravite: 'sensible',
        action: chemin.includes('/integrite')
          ? 'AUDIT_VERIFICATION_INTEGRITE'
          : chemin.includes('/historique')
            ? 'AUDIT_DOSSIER_UTILISATEUR'
            : 'AUDIT_CONSULTATION_JOURNAL',
      };
    }

    if (chemin.includes('/direction')) {
      return {
        categorie: 'direction',
        gravite: methode === 'GET' ? 'info' : 'sensible',
        action: `DIRECTION_${methode}`,
      };
    }

    if (chemin.includes('/export')) {
      return {
        categorie: 'export',
        gravite: 'sensible',
        action: 'EXPORT_DONNEES_OFFICIELLES',
      };
    }

    if (chemin.includes('/presences')) {
      return {
        categorie: 'presence',
        gravite: 'info',
        action: chemin.includes('/scanner')
          ? 'SCAN_QR_PRESENCE'
          : `PRESENCE_${methode}`,
      };
    }

    if (chemin.includes('/admin') || chemin.includes('/scolarite/comptes') || role === 'admin') {
      return {
        categorie: 'administration',
        gravite: methode === 'DELETE' ? 'critique' : methode === 'GET' ? 'info' : 'sensible',
        action: `ADMIN_${methode}`,
      };
    }

    return {
      categorie: methode === 'GET' ? 'navigation' : 'academique',
      gravite: methode === 'DELETE' ? 'alerte' : 'info',
      action: `${methode}_RESSOURCE`,
    };
  }
}
