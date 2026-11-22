import { Module } from '@nestjs/common';
import { CahierTexteController } from './cahier-texte.controller';
import { CahierTexteService } from './cahier-texte.service';
import { PresencesQrController } from './presences-qr.controller';
import { QrPresenceService } from './qr-presence.service';
import { ExportsModule } from '../exports/exports.module';

@Module({
  imports: [ExportsModule],
  controllers: [CahierTexteController, PresencesQrController],
  providers: [CahierTexteService, QrPresenceService],
})
export class CahierTexteModule {}
