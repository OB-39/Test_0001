import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Acces } from '../auth/acces.decorator';
import type { RequeteAuthentifiee } from '../auth/auth.types';
import { AuditService } from './audit.service';
import {
  extraireContexteForensic,
  redigerMetadonneesAudit,
} from './audit-forensic.util';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * Consultation du journal forensique : reservee EXCLUSIVEMENT a l'administrateur systeme.
   * Aucun autre role (y compris directeurs et scolarite) n'est autorise a consulter ce journal.
   */
  @Get()
  @Acces('admin')
  async lister(
    @Query('limite') limiteBrute: string | undefined,
    @Query('userId') userIdBrut: string | undefined,
    @Query('matricule') matricule: string | undefined,
    @Query('role') role: string | undefined,
    @Query('categorie') categorie: string | undefined,
    @Query('gravite') gravite: string | undefined,
    @Query('ip') ip: string | undefined,
    @Query('dateDebut') dateDebut: string | undefined,
    @Query('dateFin') dateFin: string | undefined,
    @Query('recherche') recherche: string | undefined,
    @Req() requete: RequeteAuthentifiee,
  ) {
    const limite = limiteBrute === undefined ? 200 : Number(limiteBrute);
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 500) {
      throw new BadRequestException(
        'limite doit être un entier compris entre 1 et 500',
      );
    }

    let userId: number | undefined;
    if (userIdBrut !== undefined && userIdBrut !== '') {
      userId = Number(userIdBrut);
      if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new BadRequestException('userId invalide');
      }
    }

    if (!requete.utilisateur) {
      throw new UnauthorizedException('Jeton manquant');
    }

    return this.audit.lister({
      limite,
      userId,
      matricule: matricule?.trim() || undefined,
      role: role?.trim() || undefined,
      categorie: categorie?.trim() || undefined,
      gravite: gravite?.trim() || undefined,
      ip: ip?.trim() || undefined,
      dateDebut: dateDebut?.trim() || undefined,
      dateFin: dateFin?.trim() || undefined,
      recherche: recherche?.trim() || undefined,
    });
  }

  /**
   * Historique forensique complet d'un utilisateur specifique (tous roles confondus,
   * y compris Directeur General et Directeurs de Campus). Acces Admin uniquement.
   */
  @Get('utilisateurs/:userId/historique')
  @Acces('admin')
  async historiqueUtilisateur(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limite') limiteBrute: string | undefined,
    @Req() requete: RequeteAuthentifiee,
  ) {
    if (!requete.utilisateur) {
      throw new UnauthorizedException('Jeton manquant');
    }
    const limite = limiteBrute === undefined ? 500 : Number(limiteBrute);
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 1000) {
      throw new BadRequestException(
        'limite doit être un entier compris entre 1 et 1000',
      );
    }
    return this.audit.historiqueUtilisateur(userId, limite);
  }

  /**
   * Verification serveur de l'integrite de la chaine cryptographique SHA-256 + HMAC.
   * Acces Admin uniquement.
   */
  @Get('integrite')
  @Acces('admin')
  async verifierIntegrite(
    @Query('limite') limiteBrute: string | undefined,
    @Req() requete: RequeteAuthentifiee,
  ) {
    if (!requete.utilisateur) {
      throw new UnauthorizedException('Jeton manquant');
    }
    const limite = limiteBrute === undefined ? 500 : Number(limiteBrute);
    if (!Number.isSafeInteger(limite) || limite < 1 || limite > 2000) {
      throw new BadRequestException(
        'limite doit être un entier compris entre 1 et 2000',
      );
    }
    return this.audit.verifierIntegrite(limite);
  }

  /**
   * Enregistrement d'un evenement de navigation / consultation cote client
   * pour tracer les acces aux ecrans par tout utilisateur authentifie.
   */
  @Post('evenement-client')
  @Acces(
    'etudiant',
    'delegue',
    'enseignant',
    'chef_departement',
    'scolarite',
    'directeur_campus',
    'directeur_general',
    'admin',
  )
  async enregistrerEvenementClient(
    @Body() body: { action?: string; objet?: string; detail?: string; metadata?: Record<string, unknown> },
    @Req() requete: Request & RequeteAuthentifiee,
  ) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) {
      throw new UnauthorizedException('Jeton manquant');
    }
    const action = (body?.action ?? '').trim().slice(0, 80);
    if (!action) {
      throw new BadRequestException('action requise');
    }
    const contexte = extraireContexteForensic(
      requete.headers,
      requete.ip ?? requete.socket?.remoteAddress,
      'CLIENT',
      (body?.objet ?? '').trim().slice(0, 200) || '/portail',
    );
    await this.audit.enregistrer({
      userId: utilisateur.id,
      userRole: utilisateur.activeRole,
      categorie: 'navigation',
      gravite: 'info',
      action,
      objet: (body?.objet ?? '').trim().slice(0, 200) || undefined,
      detail: (body?.detail ?? '').trim().slice(0, 300) || undefined,
      metadata: redigerMetadonneesAudit(body?.metadata),
      forensic: {
        ...contexte,
        statutHttp: 200,
      },
    });
    return { ok: true as const };
  }
}
