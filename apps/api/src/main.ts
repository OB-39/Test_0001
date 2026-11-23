import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  creerLimiteurDebit,
  creerMiddlewareEntetesSecurite,
} from './security/rate-limit.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const estProduction =
    (configService.get<string>('NODE_ENV') ?? 'development') === 'production';

  // Fait confiance au premier reverse-proxy (Nginx/Cloudflare) pour l'adresse IP reelle
  const httpInstance = app.getHttpAdapter().getInstance() as {
    set?: (key: string, val: unknown) => void;
  };
  httpInstance.set?.('trust proxy', 1);

  app.use(creerMiddlewareEntetesSecurite(estProduction));

  // Protection anti-brute-force sur la connexion et la reinitialisation
  const limiteurAuth = creerLimiteurDebit({
    fenetreMs: 60_000,
    maxRequetes: 20,
    message:
      'Trop de tentatives de connexion. Veuillez réessayer dans une minute.',
  });
  app.use('/api/v1/auth/login', limiteurAuth);
  app.use('/api/v1/auth/mot-de-passe-oublie', limiteurAuth);

  // Protection du scanner QR (dimensionnee pour un amphi partageant la meme IP campus)
  const limiteurScanQr = creerLimiteurDebit({
    fenetreMs: 60_000,
    maxRequetes: 400,
    message:
      'Pic de scans détecté. Veuillez patienter quelques secondes puis rescanner.',
  });
  app.use('/api/v1/presences/scanner', limiteurScanQr);

  const origins = (
    configService.get<string>('ALLOWED_ORIGINS') ??
    configService.get<string>('APP_URL') ??
    'http://localhost:3000,http://localhost:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (origins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error("Origin non autorisée par la politique CORS de l'API ENP"),
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-ENP-Device-Id',
      'X-ENP-Device-Meta',
      'X-ENP-Geo',
    ],
  });

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  // Documentation Swagger active uniquement hors production (ou activation explicite)
  const activerSwagger =
    !estProduction ||
    configService.get<string>('ENABLE_SWAGGER')?.toLowerCase() === 'true';

  if (activerSwagger) {
    const config = new DocumentBuilder()
      .setTitle("Plateforme d'Évaluation ENP & Cahier de Texte")
      .setDescription(
        'API REST du monolithe modulaire ENP : évaluation anonyme, cahier de texte, émargement QR et pilotage multi-campus',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(configService.get<number>('PORT') ?? 3000);
}
bootstrap();