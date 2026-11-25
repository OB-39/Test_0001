/**
 * Utilitaires purs de zoom hybride (optique + numerique ROI) et de cadrage
 * optimise pour le scanner QR d'emargement ENP (fluide meme sur mobile d'entree de gamme).
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_PAS = 0.25;
export const ZOOM_PRESETS = [1, 1.5, 2, 3] as const;
export const DIMENSION_MAX_ANALYSE_QR = 480;

export interface ZoneCaptureQr {
  /** Coordonnee X source dans la video native */
  sx: number;
  /** Coordonnee Y source dans la video native */
  sy: number;
  /** Largeur source recadree dans la video native */
  sw: number;
  /** Hauteur source recadree dans la video native */
  sh: number;
  /** Largeur destination du canvas d'analyse (plafonnee pour 60 fps) */
  dw: number;
  /** Hauteur destination du canvas d'analyse (plafonnee pour 60 fps) */
  dh: number;
}

export function normaliserFacteurZoom(
  valeur: number,
  min: number = ZOOM_MIN,
  max: number = ZOOM_MAX,
): number {
  if (!Number.isFinite(valeur)) return min;
  const borneMin = Number.isFinite(min) && min >= 1 ? min : ZOOM_MIN;
  const borneMax = Number.isFinite(max) && max >= borneMin ? max : Math.max(borneMin, ZOOM_MAX);
  const clamped = Math.min(borneMax, Math.max(borneMin, valeur));
  return Math.round(clamped * 100) / 100;
}

/**
 * Calcule le rectangle source centre (ROI) et les dimensions reduites du canvas
 * pour l'analyse QR.
 *
 * - Si digitalZoom > 1, on recadre au centre de la video haute definition (ex: 1280x720),
 *   ce qui agrandit reellement un QR projete au fond de l'amphitheatre sans perte inutile.
 * - La sortie est plafonnee a maxDim (480 px par defaut) pour decodage ultra-rapide (< 8 ms).
 */
export function calculerZoneCaptureQr(
  videoWidth: number,
  videoHeight: number,
  digitalZoom: number = 1,
  maxDim: number = DIMENSION_MAX_ANALYSE_QR,
): ZoneCaptureQr {
  const vw = Math.max(1, Math.floor(videoWidth));
  const vh = Math.max(1, Math.floor(videoHeight));
  const z = normaliserFacteurZoom(digitalZoom, 1, 8);
  const plafond = Math.max(160, Math.floor(maxDim));

  // Recadrage centre autour du viseur carre pour eliminer les bords inutiles
  const coteBase = Math.min(vw, vh);
  const coteSource = Math.max(64, Math.min(coteBase, Math.floor(coteBase / z)));

  const sx = Math.max(0, Math.floor((vw - coteSource) / 2));
  const sy = Math.max(0, Math.floor((vh - coteSource) / 2));
  const sw = Math.min(vw - sx, coteSource);
  const sh = Math.min(vh - sy, coteSource);

  const echelle = Math.min(1, plafond / Math.max(sw, sh));
  const dw = Math.max(64, Math.round(sw * echelle));
  const dh = Math.max(64, Math.round(sh * echelle));

  return { sx, sy, sw, sh, dw, dh };
}

/**
 * Calcule le nouveau zoom lors d'un geste de pincement a deux doigts sur le viseur.
 */
export function calculerZoomDepuisPincement(
  distanceInitiale: number,
  distanceCourante: number,
  zoomInitial: number,
  min: number = ZOOM_MIN,
  max: number = ZOOM_MAX,
): number {
  if (!Number.isFinite(distanceInitiale) || distanceInitiale <= 10) {
    return normaliserFacteurZoom(zoomInitial, min, max);
  }
  if (!Number.isFinite(distanceCourante) || distanceCourante <= 0) {
    return normaliserFacteurZoom(zoomInitial, min, max);
  }
  const ratio = distanceCourante / distanceInitiale;
  return normaliserFacteurZoom(zoomInitial * ratio, min, max);
}
