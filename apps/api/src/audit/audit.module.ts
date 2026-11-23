import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditForensicInterceptor } from './audit-forensic.interceptor';

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditForensicInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
