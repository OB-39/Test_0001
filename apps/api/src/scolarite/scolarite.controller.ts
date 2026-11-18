import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Acces } from '../auth/acces.decorator';
import type { RequeteAuthentifiee } from '../auth/auth.types';
import { ScolariteService } from './scolarite.service';

class ProgrammeEntreeDto {
  @IsInt()
  @Min(1)
  departmentId!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(120)
  nom!: string;
}

class ProgrammeModificationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(120)
  nom?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;
}

class UniteEnseignementDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(40)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(200)
  intitule!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  credits!: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  composantesIds?: number[];
}

@Controller('scolarite')
export class ScolariteController {
  constructor(private readonly scolarite: ScolariteService) {}

  @Get('tableau-de-bord')
  @Acces('scolarite')
  tableauDeBord(@Req() requete: RequeteAuthentifiee) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.tableauDeBord(utilisateur.id, [utilisateur.activeRole]);
  }

}

@Controller('referentiels')
export class ReferentielsController {
  constructor(private readonly scolarite: ScolariteService) {}

  @Get('departements')
  @Acces('scolarite')
  departements(@Req() requete: RequeteAuthentifiee) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.departements(utilisateur.id, [utilisateur.activeRole]);
  }

  @Get('programmes')
  @Acces('scolarite')
  programmes(@Req() requete: RequeteAuthentifiee) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.programmes(utilisateur.id, [utilisateur.activeRole]);
  }

  @Post('programmes')
  @Acces('scolarite')
  creerProgramme(
    @Req() requete: RequeteAuthentifiee,
    @Body() corps: ProgrammeEntreeDto,
  ) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.creerProgramme(
      utilisateur.id,
      [utilisateur.activeRole],
      corps.departmentId,
      corps.nom,
    );
  }

  @Patch('programmes/:id')
  @Acces('scolarite')
  modifierProgramme(
    @Req() requete: RequeteAuthentifiee,
    @Param('id', ParseIntPipe) id: number,
    @Body() corps: ProgrammeModificationDto,
  ) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.modifierProgramme(
      utilisateur.id,
      [utilisateur.activeRole],
      id,
      corps,
    );
  }

  @Delete('programmes/:id')
  @Acces('scolarite')
  supprimerProgramme(
    @Req() requete: RequeteAuthentifiee,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.supprimerProgramme(
      utilisateur.id,
      [utilisateur.activeRole],
      id,
    );
  }

  @Get('unites-enseignement')
  @Acces('scolarite')
  unitesEnseignement(@Req() requete: RequeteAuthentifiee) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.unitesEnseignement(utilisateur.id, [utilisateur.activeRole]);
  }

  @Post('unites-enseignement')
  @Acces('scolarite')
  creerUniteEnseignement(
    @Req() requete: RequeteAuthentifiee,
    @Body() corps: UniteEnseignementDto,
  ) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.creerUniteEnseignement(
      utilisateur.id,
      [utilisateur.activeRole],
      corps,
    );
  }

  @Patch('unites-enseignement/:id')
  @Acces('scolarite')
  modifierUniteEnseignement(
    @Req() requete: RequeteAuthentifiee,
    @Param('id', ParseIntPipe) id: number,
    @Body() corps: UniteEnseignementDto,
  ) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.modifierUniteEnseignement(
      utilisateur.id,
      [utilisateur.activeRole],
      id,
      corps,
    );
  }

  @Delete('unites-enseignement/:id')
  @Acces('scolarite')
  supprimerUniteEnseignement(
    @Req() requete: RequeteAuthentifiee,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const utilisateur = requete.utilisateur;
    if (!utilisateur) throw new UnauthorizedException('Jeton manquant');
    return this.scolarite.supprimerUniteEnseignement(
      utilisateur.id,
      [utilisateur.activeRole],
      id,
    );
  }
}
