import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const GENESIS_AUDIT_HASH = 'GENESIS_ENP_AUDIT_V2';

export type CategorieAuditServeur =
  | 'authentification'
  | 'navigation'
  | 'academique'
  | 'presence'
  | 'administration'
  | 'direction'
  | 'securite'
  | 'export';

export type GraviteAuditServeur = 'info' | 'sensible' | 'alerte' | 'critique';

export type SourceGeoServeur =
  | 'gps_precis'
  | 'ip_reseau'
  | 'campus_enp'
  | 'fuseau_navigateur';

export interface ContexteForensicRequete {
  methodeHttp?: string;
  cheminHttp?: string;
  statutHttp?: number;
  dureeMs?: number;
  ipAddress?: string;
  ipForwardedChain?: string;
  userAgent?: string;
  osNom?: string;
  navigateurNom?: string;
  appareilType?: string;
  deviceFingerprint?: string;
  ecranResolution?: string;
  fuseauHoraire?: string;
  langue?: string;
  geoSource?: SourceGeoServeur;
  geoLatitude?: number;
  geoLongitude?: number;
  geoPrecisionMetres?: number;
  geoVille?: string;
  geoRegion?: string;
  geoPays?: string;
  geoFai?: string;
  sessionId?: string;
}

const SECRET_EPHEMERE_DEV = randomBytes(32).toString('hex');

export function obtenirSecretHmacAudit(): string {
  const envSecret = process.env.AUDIT_HMAC_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  return SECRET_EPHEMERE_DEV;
}

function nettoyerChaine(
  val: unknown,
  maxLen: number,
): string | undefined {
  if (typeof val !== 'string') return undefined;
  const nettoye = val.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!nettoye) return undefined;
  return nettoye.slice(0, maxLen);
}

function parserNombreBorne(
  val: unknown,
  min: number,
  max: number,
): number | undefined {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num < min || num > max) return undefined;
  return num;
}

export function extraireIpClient(
  headers: IncomingHttpHeaders,
  remoteAddress?: string,
): { ipAddress?: string; ipForwardedChain?: string } {
  const rawXff = headers['x-forwarded-for'];
  const xff = Array.isArray(rawXff) ? rawXff.join(',') : rawXff;
  const rawRealIp = headers['x-real-ip'];
  const realIp = Array.isArray(rawRealIp) ? rawRealIp[0] : rawRealIp;

  let candidate = '';
  if (xff) {
    candidate = xff.split(',')[0]?.trim() ?? '';
  } else if (realIp) {
    candidate = realIp.trim();
  } else if (remoteAddress) {
    candidate = remoteAddress.trim();
  }

  candidate = candidate.replace(/^::ffff:/, '');
  const ipSanitisee = nettoyerChaine(candidate, 64);
  const chaineSanitisee = xff ? nettoyerChaine(xff, 256) : undefined;

  return {
    ipAddress: ipSanitisee,
    ipForwardedChain: chaineSanitisee,
  };
}

export function analyserUserAgentServeur(userAgent?: string): {
  osNom: string;
  navigateurNom: string;
  appareilType: string;
} {
  const ua = (userAgent ?? '').trim();
  if (!ua) {
    return { osNom: 'Inconnu', navigateurNom: 'Inconnu', appareilType: 'Inconnu' };
  }

  let osNom = 'Inconnu';
  if (/Windows NT 10\.0/i.test(ua)) osNom = 'Windows 10/11';
  else if (/Windows NT/i.test(ua)) osNom = 'Windows';
  else if (/Android\s+([\d.]+)/i.test(ua)) {
    const m = ua.match(/Android\s+([\d.]+)/i);
    osNom = `Android ${m?.[1] ?? ''}`.trim();
  } else if (/iPhone OS\s+([\d_]+)/i.test(ua)) {
    const m = ua.match(/iPhone OS\s+([\d_]+)/i);
    osNom = `iOS ${(m?.[1] ?? '').replace(/_/g, '.')}`.trim();
  } else if (/iPad.*OS\s+([\d_]+)/i.test(ua)) {
    const m = ua.match(/OS\s+([\d_]+)/i);
    osNom = `iPadOS ${(m?.[1] ?? '').replace(/_/g, '.')}`.trim();
  } else if (/Mac OS X\s+([\d_]+)/i.test(ua)) {
    const m = ua.match(/Mac OS X\s+([\d_]+)/i);
    osNom = `macOS ${(m?.[1] ?? '').replace(/_/g, '.')}`.trim();
  } else if (/Ubuntu/i.test(ua)) osNom = 'Linux Ubuntu';
  else if (/Linux/i.test(ua)) osNom = 'Linux';

  let navigateurNom = 'Inconnu';
  if (/Edg\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/i);
    navigateurNom = `Edge ${m?.[1]?.split('.')[0] ?? ''}`.trim();
  } else if (/OPR\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/OPR\/([\d.]+)/i);
    navigateurNom = `Opera ${m?.[1]?.split('.')[0] ?? ''}`.trim();
  } else if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium/i.test(ua)) {
    const m = ua.match(/Chrome\/([\d.]+)/i);
    navigateurNom = `Chrome ${m?.[1]?.split('.')[0] ?? ''}`.trim();
  } else if (/Firefox\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/i);
    navigateurNom = `Firefox ${m?.[1]?.split('.')[0] ?? ''}`.trim();
  } else if (/Version\/([\d.]+).*Safari/i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/i);
    navigateurNom = `Safari ${m?.[1]?.split('.')[0] ?? ''}`.trim();
  } else if (/curl|python-requests|Postman|insomnia|axios/i.test(ua)) {
    navigateurNom = 'Client API / Script';
  }

  let appareilType = 'Desktop';
  if (/bot|crawler|spider|curl|python-requests|Postman/i.test(ua)) {
    appareilType = 'Bot / Script';
  } else if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) {
    appareilType = 'Tablette';
  } else if (/Mobile|iPhone|Android/i.test(ua)) {
    appareilType = 'Smartphone';
  }

  return { osNom, navigateurNom, appareilType };
}

export function extraireContexteForensic(
  headers: IncomingHttpHeaders,
  remoteAddress?: string,
  methodeHttp?: string,
  cheminHttp?: string,
): ContexteForensicRequete {
  const { ipAddress, ipForwardedChain } = extraireIpClient(headers, remoteAddress);
  const rawUa = Array.isArray(headers['user-agent'])
    ? headers['user-agent'][0]
    : headers['user-agent'];
  const userAgent = nettoyerChaine(rawUa, 512);
  const parsedUa = analyserUserAgentServeur(userAgent);

  const rawDeviceId = Array.isArray(headers['x-enp-device-id'])
    ? headers['x-enp-device-id'][0]
    : headers['x-enp-device-id'];
  const deviceFingerprint = nettoyerChaine(rawDeviceId, 80);

  let ecranResolution: string | undefined;
  let fuseauHoraire: string | undefined;
  let langue: string | undefined;

  const rawMeta = Array.isArray(headers['x-enp-device-meta'])
    ? headers['x-enp-device-meta'][0]
    : headers['x-enp-device-meta'];
  if (typeof rawMeta === 'string' && rawMeta.length <= 512) {
    try {
      const parsed = JSON.parse(rawMeta) as Record<string, unknown>;
      ecranResolution = nettoyerChaine(parsed.res, 32);
      fuseauHoraire = nettoyerChaine(parsed.tz, 64);
      langue = nettoyerChaine(parsed.lang, 32);
    } catch {
      // En-tete malforme ignore sans incident
    }
  }

  if (!langue) {
    const rawLang = Array.isArray(headers['accept-language'])
      ? headers['accept-language'][0]
      : headers['accept-language'];
    langue = nettoyerChaine(rawLang?.split(',')[0], 32);
  }

  // Geolocalisation : priorite GPS client valide, sinon en-tetes GeoIP proxy/CDN
  let geoSource: SourceGeoServeur | undefined;
  let geoLatitude: number | undefined;
  let geoLongitude: number | undefined;
  let geoPrecisionMetres: number | undefined;

  const rawGeo = Array.isArray(headers['x-enp-geo'])
    ? headers['x-enp-geo'][0]
    : headers['x-enp-geo'];
  if (typeof rawGeo === 'string' && rawGeo.length <= 256) {
    try {
      const parsed = JSON.parse(rawGeo) as Record<string, unknown>;
      const lat = parserNombreBorne(parsed.lat, -90, 90);
      const lon = parserNombreBorne(parsed.lon, -180, 180);
      if (lat !== undefined && lon !== undefined) {
        geoSource = 'gps_precis';
        geoLatitude = Number(lat.toFixed(6));
        geoLongitude = Number(lon.toFixed(6));
        const acc = parserNombreBorne(parsed.acc, 0, 100_000);
        geoPrecisionMetres = acc !== undefined ? Math.round(acc) : undefined;
      }
    } catch {
      // En-tete geo ignore si invalide
    }
  }

  const proxyLat = parserNombreBorne(headers['x-geo-latitude'] ?? headers['cf-iplatitude'], -90, 90);
  const proxyLon = parserNombreBorne(headers['x-geo-longitude'] ?? headers['cf-iplongitude'], -180, 180);
  const geoVille = nettoyerChaine(headers['x-geo-city'] ?? headers['cf-ipcity'], 120);
  const geoRegion = nettoyerChaine(headers['x-geo-region'] ?? headers['cf-region'], 120);
  const geoPays = nettoyerChaine(headers['x-geo-country'] ?? headers['cf-ipcountry'], 80);
  const geoFai = nettoyerChaine(headers['x-geo-isp'] ?? headers['x-geo-org'], 120);

  if (geoLatitude === undefined && proxyLat !== undefined && proxyLon !== undefined) {
    geoSource = 'ip_reseau';
    geoLatitude = Number(proxyLat.toFixed(6));
    geoLongitude = Number(proxyLon.toFixed(6));
  } else if (!geoSource && (geoVille || geoPays)) {
    geoSource = 'ip_reseau';
  }

  return {
    methodeHttp: nettoyerChaine(methodeHttp, 10),
    cheminHttp: nettoyerChaine(cheminHttp, 512),
    ipAddress,
    ipForwardedChain,
    userAgent,
    osNom: parsedUa.osNom,
    navigateurNom: parsedUa.navigateurNom,
    appareilType: parsedUa.appareilType,
    deviceFingerprint,
    ecranResolution,
    fuseauHoraire,
    langue,
    geoSource,
    geoLatitude,
    geoLongitude,
    geoPrecisionMetres,
    geoVille,
    geoRegion,
    geoPays,
    geoFai,
  };
}

export interface DonneesSignatureAudit {
  id: number;
  creeLe: string;
  userId?: number | null;
  userMatricule?: string | null;
  userRole?: string | null;
  action: string;
  methodeHttp?: string | null;
  cheminHttp?: string | null;
  statutHttp?: number | null;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  objet?: string | null;
  detail?: string | null;
  previousHash?: string | null;
}

export function calculerHashEntreeAuditServeur(d: DonneesSignatureAudit): string {
  const payload = [
    String(d.id),
    d.creeLe,
    d.userId !== undefined && d.userId !== null ? String(d.userId) : '',
    d.userMatricule ?? '',
    d.userRole ?? '',
    d.action,
    d.methodeHttp ?? '',
    d.cheminHttp ?? '',
    d.statutHttp !== undefined && d.statutHttp !== null ? String(d.statutHttp) : '',
    d.ipAddress ?? '',
    d.deviceFingerprint ?? '',
    d.geoLatitude !== undefined && d.geoLatitude !== null
      ? Number(d.geoLatitude).toFixed(6)
      : '',
    d.geoLongitude !== undefined && d.geoLongitude !== null
      ? Number(d.geoLongitude).toFixed(6)
      : '',
    d.objet ?? '',
    d.detail ?? '',
    d.previousHash ?? GENESIS_AUDIT_HASH,
  ].join('|');

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function signerHashAuditHmac(
  entryHash: string,
  secret = obtenirSecretHmacAudit(),
): string {
  return createHmac('sha256', secret).update(entryHash, 'utf8').digest('hex');
}

export function verifierSignatureHmacAudit(
  entryHash: string,
  signature: string,
  secret = obtenirSecretHmacAudit(),
): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const attendue = signerHashAuditHmac(entryHash, secret);
  return timingSafeEqual(
    Buffer.from(attendue, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

const CLES_SENSIBLES = new Set([
  'password',
  'motdepasse',
  'ancienmotdepasse',
  'nouveaumotdepasse',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'code',
  'codeactivation',
  'reponses',
  'bulletins',
]);

export function redigerMetadonneesAudit(
  input: unknown,
): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 20)) {
    if (CLES_SENSIBLES.has(k.toLowerCase())) {
      out[k] = '[MASQUE]';
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, 180);
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
