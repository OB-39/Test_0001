import { analyserUserAgent, sha256HexSync } from "./auditForensic";

export interface GeoCapturee {
  source: "gps_precis" | "fuseau_navigateur";
  latitude?: number;
  longitude?: number;
  precisionMetres?: number;
  captureLe: string;
}

export interface TelemetrieMachine {
  deviceFingerprint: string;
  osNom: string;
  navigateurNom: string;
  appareilType: string;
  ecranResolution: string;
  fuseauHoraire: string;
  langue: string;
  coeursCpu?: number;
  geo?: GeoCapturee;
}

const STORAGE_KEY_MACHINE_ID = "enp_forensic_machine_id_v1";

let geoMemoire: GeoCapturee | null = null;
let geoDemandeEnCours = false;

/**
 * Genere ou recupere une empreinte locale persistante de l'appareil/navigateur.
 * Combine un identifiant aleatoire stocke avec des caracteristiques materielles non invasives.
 */
export function obtenirEmpreinteMachine(): string {
  if (typeof window === "undefined") return "SRV-SSR-00000000";
  try {
    const existant = window.localStorage.getItem(STORAGE_KEY_MACHINE_ID);
    if (existant && /^[A-Z0-9_-]{12,64}$/i.test(existant)) {
      return existant;
    }
    const alea =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const base = [
      alea,
      navigator.platform ?? "",
      navigator.language ?? "",
      `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
      String(navigator.hardwareConcurrency ?? 0),
    ].join("|");
    const empreinte = `MCH-${sha256HexSync(base).slice(0, 16).toUpperCase()}`;
    window.localStorage.setItem(STORAGE_KEY_MACHINE_ID, empreinte);
    return empreinte;
  } catch {
    return `MCH-${sha256HexSync(navigator.userAgent ?? "fallback").slice(0, 16).toUpperCase()}`;
  }
}

/**
 * Demande une capture de geolocalisation GPS haute precision (non bloquante).
 * En cas de refus ou d'indisponibilite, le systeme bascule proprement sans bloquer l'app.
 */
export function initialiserCaptureGeolocalisation(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (geoMemoire?.source === "gps_precis" || geoDemandeEnCours) return;
  if (!("geolocation" in navigator)) return;

  geoDemandeEnCours = true;
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoDemandeEnCours = false;
        const { latitude, longitude, accuracy } = pos.coords;
        if (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        ) {
          geoMemoire = {
            source: "gps_precis",
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
            precisionMetres: Number.isFinite(accuracy) ? Math.round(accuracy) : undefined,
            captureLe: new Date().toISOString(),
          };
        }
      },
      () => {
        geoDemandeEnCours = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 120_000,
      },
    );
  } catch {
    geoDemandeEnCours = false;
  }
}

export function collecterTelemetrieMachine(): TelemetrieMachine {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceFingerprint: "SRV-NODE-00000000",
      osNom: "Serveur",
      navigateurNom: "Node",
      appareilType: "Desktop",
      ecranResolution: "0x0",
      fuseauHoraire: "UTC",
      langue: "fr-FR",
    };
  }

  const parsed = analyserUserAgent(navigator.userAgent);
  const fuseau =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lome"
      : "Africa/Lome";

  return {
    deviceFingerprint: obtenirEmpreinteMachine(),
    osNom: parsed.osNom,
    navigateurNom: parsed.navigateurNom,
    appareilType: parsed.appareilType,
    ecranResolution: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    fuseauHoraire: fuseau,
    langue: navigator.language || "fr-FR",
    coeursCpu: navigator.hardwareConcurrency || undefined,
    geo: geoMemoire ?? {
      source: "fuseau_navigateur",
      captureLe: new Date().toISOString(),
    },
  };
}

/**
 * Construit les en-tetes HTTP legers et sanitises envoyes au backend NestJS
 * pour completer l'IP serveur et le User-Agent.
 */
export function construireEntetesTelemetrie(): Record<string, string> {
  const tel = collecterTelemetrieMachine();
  const headers: Record<string, string> = {
    "X-ENP-Device-Id": tel.deviceFingerprint,
    "X-ENP-Device-Meta": JSON.stringify({
      res: tel.ecranResolution,
      tz: tel.fuseauHoraire,
      lang: tel.langue,
      cpu: tel.coeursCpu,
    }),
  };

  if (
    tel.geo?.source === "gps_precis" &&
    tel.geo.latitude !== undefined &&
    tel.geo.longitude !== undefined
  ) {
    headers["X-ENP-Geo"] = JSON.stringify({
      lat: tel.geo.latitude,
      lon: tel.geo.longitude,
      acc: tel.geo.precisionMetres,
    });
  }

  return headers;
}
