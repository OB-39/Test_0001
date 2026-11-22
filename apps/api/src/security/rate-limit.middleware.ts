import type { NextFunction, Request, Response } from 'express';

interface SeauRequetes {
  horodatages: number[];
}

export interface OptionsLimiteurDebit {
  fenetreMs: number;
  maxRequetes: number;
  message?: string;
}

/**
 * En-tetes HTTP de securite pour la production ENP (sans dependance externe requise).
 */
export function creerMiddlewareEntetesSecurite(estProduction: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=()',
    );
    if (estProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  };
}

/**
 * Limiteur de debit en memoire par fenetre glissante pour proteger les routes sensibles
 * (authentification, reinitialisation de mot de passe et scans QR).
 */
export function creerLimiteurDebit(options: OptionsLimiteurDebit) {
  const seaux = new Map<string, SeauRequetes>();
  const message =
    options.message ??
    'Trop de requêtes sur un court intervalle. Veuillez patienter quelques instants.';

  // Nettoyage periodique leger des entrees expirees pour borner la memoire
  let dernierNettoyage = Date.now();

  return (req: Request, res: Response, next: NextFunction): void => {
    const maintenant = Date.now();
    if (maintenant - dernierNettoyage > options.fenetreMs * 2) {
      for (const [cle, seau] of seaux.entries()) {
        const actifs = seau.horodatages.filter(
          (t) => maintenant - t < options.fenetreMs,
        );
        if (actifs.length === 0) {
          seaux.delete(cle);
        } else {
          seau.horodatages = actifs;
        }
      }
      dernierNettoyage = maintenant;
    }

    const ipBrute =
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
        : undefined) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const cle = `${ipBrute}:${req.baseUrl}${req.path}`;
    const existant = seaux.get(cle) ?? { horodatages: [] };
    existant.horodatages = existant.horodatages.filter(
      (t) => maintenant - t < options.fenetreMs,
    );

    if (existant.horodatages.length >= options.maxRequetes) {
      const plusAncien = existant.horodatages[0] ?? maintenant;
      const attendreSecondes = Math.max(
        1,
        Math.ceil((options.fenetreMs - (maintenant - plusAncien)) / 1000),
      );
      res.setHeader('Retry-After', String(attendreSecondes));
      res.status(429).json({
        statusCode: 429,
        message,
        retryAfterSeconds: attendreSecondes,
      });
      return;
    }

    existant.horodatages.push(maintenant);
    seaux.set(cle, existant);
    next();
  };
}
