import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Acces } from '../auth/acces.decorator';
import type { RequeteAuthentifiee } from '../auth/auth.types';
import { lireId } from '../evaluation/campagnes.validation';
import { QrPresenceService } from './qr-presence.service';

/**
 * Endpoints securises pour l'emargement par QR Code dynamique tournant (ENP).
 * Conception institutionnelle : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */

function exigerUtilisateur(requete: RequeteAuthentifiee) {
  if (!requete.utilisateur) {
    throw new UnauthorizedException('Jeton manquant');
  }
  return requete.utilisateur;
}

function lireSeanceId(valeur: unknown): number {
  const brut =
    typeof valeur === 'number' && Number.isInteger(valeur)
      ? String(valeur)
      : typeof valeur === 'string'
        ? valeur
        : '';
  const id = lireId(brut);
  if (id === null) {
    throw new BadRequestException('seanceId doit etre un entier positif');
  }
  return id;
}

@Controller('presences')
export class PresencesQrController {
  constructor(private readonly qrPresence: QrPresenceService) {}

  @Post('sessions/demarrer')
  @Acces('enseignant')
  demarrerSession(
    @Req() requete: RequeteAuthentifiee,
    @Body() corps: unknown,
  ) {
    if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
      throw new BadRequestException('Corps de requete invalide');
    }
    const seanceId = lireSeanceId((corps as Record<string, unknown>).seanceId);
    return this.qrPresence.demarrerSession(
      exigerUtilisateur(requete).id,
      seanceId,
    );
  }

  @Get('sessions/:seanceId/jeton')
  @Acces('enseignant')
  obtenirJeton(
    @Req() requete: RequeteAuthentifiee,
    @Param('seanceId') seanceIdBrut: string,
  ) {
    const seanceId = lireSeanceId(seanceIdBrut);
    return this.qrPresence.obtenirJeton(
      exigerUtilisateur(requete).id,
      seanceId,
    );
  }

  @Post('sessions/:seanceId/pause')
  @Acces('enseignant')
  mettreEnPause(
    @Req() requete: RequeteAuthentifiee,
    @Param('seanceId') seanceIdBrut: string,
  ) {
    const seanceId = lireSeanceId(seanceIdBrut);
    return this.qrPresence.mettreEnPauseSession(
      exigerUtilisateur(requete).id,
      seanceId,
    );
  }

  @Post('sessions/:seanceId/reprendre')
  @Acces('enseignant')
  reprendreSession(
    @Req() requete: RequeteAuthentifiee,
    @Param('seanceId') seanceIdBrut: string,
  ) {
    const seanceId = lireSeanceId(seanceIdBrut);
    return this.qrPresence.reprendreSession(
      exigerUtilisateur(requete).id,
      seanceId,
    );
  }

  @Post('sessions/:seanceId/cloturer')
  @Acces('enseignant')
  cloturerSession(
    @Req() requete: RequeteAuthentifiee,
    @Param('seanceId') seanceIdBrut: string,
  ) {
    const seanceId = lireSeanceId(seanceIdBrut);
    return this.qrPresence.cloturerSession(
      exigerUtilisateur(requete).id,
      seanceId,
    );
  }

  @Post('scanner')
  @Acces('etudiant', 'delegue')
  scanner(
    @Req() requete: RequeteAuthentifiee,
    @Body() corps: unknown,
  ) {
    if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
      throw new BadRequestException('Donnees de scan invalides');
    }
    const body = corps as Record<string, unknown>;
    const token = body.token;
    const deviceFingerprint = body.deviceFingerprint;

    if (typeof token !== 'string' || token.trim().length < 20 || token.length > 512) {
      throw new BadRequestException('Jeton QR invalide');
    }
    if (
      typeof deviceFingerprint !== 'string' ||
      deviceFingerprint.trim().length < 8 ||
      deviceFingerprint.trim().length > 64
    ) {
      throw new BadRequestException('Empreinte appareil invalide');
    }

    const reqExpress = requete as RequeteAuthentifiee & {
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    };
    const forwarded = reqExpress.headers?.['x-forwarded-for'];
    const ipAddress =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : reqExpress.ip;

    return this.qrPresence.scannerPresence(
      exigerUtilisateur(requete).id,
      token.trim(),
      deviceFingerprint.trim(),
      ipAddress,
    );
  }
}
