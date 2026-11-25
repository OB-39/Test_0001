import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type TouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Flashlight,
  Keyboard,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import type { ResultatScanPresence } from '@/api/types';
import {
  formaterHeureExacte,
  genererJetonPresenceClient,
  obtenirEmpreinteAppareil,
} from '@/utils/qrPresenceToken';
import {
  calculerZoneCaptureQr,
  calculerZoomDepuisPincement,
  DIMENSION_MAX_ANALYSE_QR,
  normaliserFacteurZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PAS,
} from '@/utils/qrScannerZoom';

interface QrScannerModalProps {
  ouvert: boolean;
  onFermer: () => void;
  onPresenceValidee: (resultat: ResultatScanPresence) => void;
}

interface SessionDemoActive {
  seanceId: number;
  codeUe: string;
  libelleSeance: string;
  token: string;
  counter: number;
  secretKey: string;
  lastTokenTimestampMs: number;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

interface CapacitesCameraEtendues extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: {
    min?: number;
    max?: number;
    step?: number;
  };
}

/**
 * Classes Tailwind discretes (sans style inline) pour le zoom numerique fluide du flux video.
 */
const CLASSES_ZOOM_VIDEO: ReadonlyArray<{ seuil: number; classe: string }> = [
  { seuil: 1.0, classe: 'scale-100' },
  { seuil: 1.25, classe: 'scale-125' },
  { seuil: 1.5, classe: 'scale-150' },
  { seuil: 1.75, classe: 'scale-[1.75]' },
  { seuil: 2.0, classe: 'scale-[2]' },
  { seuil: 2.25, classe: 'scale-[2.25]' },
  { seuil: 2.5, classe: 'scale-[2.5]' },
  { seuil: 2.75, classe: 'scale-[2.75]' },
  { seuil: 3.0, classe: 'scale-[3]' },
  { seuil: 3.25, classe: 'scale-[3.25]' },
  { seuil: 3.5, classe: 'scale-[3.5]' },
  { seuil: 3.75, classe: 'scale-[3.75]' },
  { seuil: 4.0, classe: 'scale-[4]' },
];

function classeZoomNumerique(facteur: number): string {
  if (facteur <= 1.05) return 'scale-100';
  let meilleure = CLASSES_ZOOM_VIDEO[0];
  let ecartMin = Math.abs(facteur - meilleure.seuil);
  for (const item of CLASSES_ZOOM_VIDEO) {
    const ecart = Math.abs(facteur - item.seuil);
    if (ecart < ecartMin) {
      ecartMin = ecart;
      meilleure = item;
    }
  }
  return meilleure.classe;
}

function creerDetecteurNatifQr(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (typeof ctor !== 'function') return null;
  try {
    return new ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function lireSessionDemoActive(): SessionDemoActive | null {
  try {
    const brut = window.localStorage.getItem('enp_mock_qr_presence_sessions_v1');
    if (!brut) return null;
    const map = JSON.parse(brut) as Record<
      string,
      {
        seanceId?: number;
        statut?: string;
        codeUe?: string;
        libelleSeance?: string;
        lastToken?: string;
        counter?: number;
        secretKey?: string;
        lastTokenTimestampMs?: number;
      }
    >;
    const ouvertes = Object.values(map).filter(
      (s) => s && s.statut === 'ouverte' && typeof s.lastToken === 'string' && s.lastToken.length > 0,
    );
    if (ouvertes.length === 0) return null;
    ouvertes.sort(
      (a, b) => (b.lastTokenTimestampMs ?? 0) - (a.lastTokenTimestampMs ?? 0),
    );
    const active = ouvertes[0];
    return {
      seanceId: active.seanceId ?? 1,
      codeUe: active.codeUe ?? 'UE',
      libelleSeance: active.libelleSeance ?? 'Séance en cours',
      token: active.lastToken ?? '',
      counter: active.counter ?? 1,
      secretKey: active.secretKey ?? '',
      lastTokenTimestampMs: active.lastTokenTimestampMs ?? 0,
    };
  } catch {
    return null;
  }
}

function distanceEntreDoigts(touches: TouchEvent<HTMLDivElement>['touches']): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

/**
 * Modale PWA epuree de scan camera pour l'emargement etudiant par QR Code dynamique (ENP).
 * Zoom hybride optique + numerique ROI (curseur fluide + pincement a deux doigts)
 * et decodage rapide (BarcodeDetector natif + repli jsQR sur ROI 480 px).
 * Attribution : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */
export function QrScannerModal({
  ouvert,
  onFermer,
  onPresenceValidee,
}: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const verrouScanRef = useRef(false);
  const analyseEnCoursRef = useRef(false);
  const detecteurNatifRef = useRef<BarcodeDetectorLike | null>(null);
  const onPresenceValideeRef = useRef(onPresenceValidee);
  onPresenceValideeRef.current = onPresenceValidee;

  // Etat du zoom hybride (optique materiel + numerique ROI)
  const [zoom, setZoom] = useState<number>(ZOOM_MIN);
  const [zoomMax, setZoomMax] = useState<number>(ZOOM_MAX);
  const [zoomOptiqueMax, setZoomOptiqueMax] = useState<number>(1);
  const zoomRef = useRef<number>(ZOOM_MIN);
  const zoomMaxRef = useRef<number>(ZOOM_MAX);
  const zoomOptiqueMaxRef = useRef<number>(1);
  const pincementRef = useRef<{ distance: number; zoomInitial: number } | null>(null);

  const [etatCamera, setEtatCamera] = useState<'init' | 'active' | 'indisponible'>('init');
  const [messageCamera, setMessageCamera] = useState<string | null>(null);
  const [torcheSupportee, setTorcheSupportee] = useState(false);
  const [torcheActive, setTorcheActive] = useState(false);
  const [traitement, setTraitement] = useState(false);
  const [succes, setSucces] = useState<ResultatScanPresence | null>(null);
  const [erreurScan, setErreurScan] = useState<string | null>(null);
  const [afficherSaisieManuelle, setAfficherSaisieManuelle] = useState(false);
  const [jetonManuel, setJetonManuel] = useState('');
  const [sessionDemo, setSessionDemo] = useState<SessionDemoActive | null>(null);

  const estModeMock = import.meta.env.VITE_USE_MOCK === 'true';

  const arreterCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyseEnCoursRef.current = false;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setTorcheActive(false);
    setTorcheSupportee(false);
    setZoomOptiqueMax(1);
    zoomOptiqueMaxRef.current = 1;
  }, []);

  const appliquerZoom = useCallback((valeurSouhaitee: number) => {
    const val = normaliserFacteurZoom(valeurSouhaitee, ZOOM_MIN, zoomMaxRef.current);
    zoomRef.current = val;
    setZoom(val);

    const track = streamRef.current?.getVideoTracks()[0];
    if (track && zoomOptiqueMaxRef.current > 1) {
      const optique = Math.min(val, zoomOptiqueMaxRef.current);
      void track
        .applyConstraints({
          advanced: [{ zoom: optique } as MediaTrackConstraintSet],
        })
        .catch(() => {
          zoomOptiqueMaxRef.current = 1;
          setZoomOptiqueMax(1);
        });
    }
  }, []);

  const soumettreJeton = useCallback(
    async (tokenBrut: string) => {
      const token = tokenBrut.trim();
      if (!token || verrouScanRef.current) return;
      verrouScanRef.current = true;
      setTraitement(true);
      setErreurScan(null);

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(150);
        }
      } catch {
        // Vibration non supportee sur ce navigateur
      }

      try {
        const deviceFingerprint = obtenirEmpreinteAppareil();
        const resultat = await api.presenceScannerQr({
          token,
          deviceFingerprint,
        });
        arreterCamera();
        setSucces(resultat);
        onPresenceValideeRef.current(resultat);
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.messages.join(' ')
            : 'Impossible de valider ce QR Code. Veuillez réessayer.';
        setErreurScan(msg);
      } finally {
        setTraitement(false);
      }
    },
    [arreterCamera],
  );

  const demarrerCamera = useCallback(async () => {
    arreterCamera();
    verrouScanRef.current = false;
    analyseEnCoursRef.current = false;
    setErreurScan(null);
    setSucces(null);
    setEtatCamera('init');
    setMessageCamera(null);
    setAfficherSaisieManuelle(false);
    zoomRef.current = ZOOM_MIN;
    setZoom(ZOOM_MIN);
    zoomMaxRef.current = ZOOM_MAX;
    setZoomMax(ZOOM_MAX);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setEtatCamera('indisponible');
      setMessageCamera(
        "La caméra n'est pas accessible dans ce navigateur. Utilisez un smartphone en HTTPS.",
      );
      return;
    }

    if (!detecteurNatifRef.current) {
      detecteurNatifRef.current = creerDetecteurNatifQr();
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        const caps = videoTrack.getCapabilities() as CapacitesCameraEtendues;
        setTorcheSupportee(Boolean(caps.torch));

        if (caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > 1) {
          const maxOptique = Math.min(6, Math.max(1, caps.zoom.max));
          zoomOptiqueMaxRef.current = maxOptique;
          setZoomOptiqueMax(maxOptique);
          const maxGlobal = Math.max(ZOOM_MAX, Math.min(6, Math.round(maxOptique * 10) / 10));
          zoomMaxRef.current = maxGlobal;
          setZoomMax(maxGlobal);
        }
      }

      const video = videoRef.current;
      if (!video) {
        arreterCamera();
        return;
      }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      setEtatCamera('active');

      let dernierTick = 0;
      let compteurFrame = 0;

      const analyserFrame = async () => {
        if (!streamRef.current || verrouScanRef.current || analyseEnCoursRef.current) {
          return;
        }
        const v = videoRef.current;
        const c = canvasRef.current;
        if (!v || !c || v.readyState < 2 || v.videoWidth <= 0 || v.videoHeight <= 0) {
          return;
        }

        analyseEnCoursRef.current = true;
        try {
          const facteurActuel = zoomRef.current;
          const optiqueMax = zoomOptiqueMaxRef.current;
          const zoomNumeriqueEffectif =
            optiqueMax > 1
              ? Math.max(1, facteurActuel / Math.min(facteurActuel, optiqueMax))
              : facteurActuel;

          const zone = calculerZoneCaptureQr(
            v.videoWidth,
            v.videoHeight,
            zoomNumeriqueEffectif,
            DIMENSION_MAX_ANALYSE_QR,
          );

          if (c.width !== zone.dw || c.height !== zone.dh) {
            c.width = zone.dw;
            c.height = zone.dh;
          }

          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          ctx.drawImage(v, zone.sx, zone.sy, zone.sw, zone.sh, 0, 0, zone.dw, zone.dh);

          // 1. Chemin ultra-rapide natif (materiel)
          const detecteur = detecteurNatifRef.current;
          if (detecteur) {
            try {
              const resultats = await detecteur.detect(c);
              const valeur = resultats.find((r) => r.rawValue && r.rawValue.trim().length > 0)?.rawValue;
              if (valeur) {
                void soumettreJeton(valeur);
                return;
              }
            } catch {
              detecteurNatifRef.current = null;
            }
          }

          // 2. Repli jsQR universel sur ROI 480 px
          compteurFrame += 1;
          const imageData = ctx.getImageData(0, 0, zone.dw, zone.dh);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: compteurFrame % 3 === 0 ? 'attemptBoth' : 'dontInvert',
          });
          if (code && code.data) {
            void soumettreJeton(code.data);
          }
        } finally {
          analyseEnCoursRef.current = false;
        }
      };

      const boucle = (horodatage: number) => {
        if (!streamRef.current || verrouScanRef.current) return;
        if (horodatage - dernierTick >= 90 && !analyseEnCoursRef.current) {
          dernierTick = horodatage;
          void analyserFrame();
        }
        rafRef.current = window.requestAnimationFrame(boucle);
      };

      rafRef.current = window.requestAnimationFrame(boucle);
    } catch {
      setEtatCamera('indisponible');
      setMessageCamera(
        "Autorisation caméra refusée ou caméra arrière introuvable. Vérifiez les permissions du navigateur.",
      );
    }
  }, [arreterCamera, soumettreJeton]);

  useEffect(() => {
    if (!ouvert) {
      arreterCamera();
      return;
    }
    if (estModeMock) {
      setSessionDemo(lireSessionDemoActive());
    }
    void demarrerCamera();

    return () => {
      arreterCamera();
    };
  }, [ouvert, estModeMock, demarrerCamera, arreterCamera]);

  useEffect(() => {
    if (!ouvert || !estModeMock) return;
    const timer = window.setInterval(() => {
      setSessionDemo(lireSessionDemoActive());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ouvert, estModeMock]);

  async function basculerTorche() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const prochain = !torcheActive;
    try {
      await track.applyConstraints({
        advanced: [{ torch: prochain } as MediaTrackConstraintSet],
      });
      setTorcheActive(prochain);
    } catch {
      setTorcheSupportee(false);
    }
  }

  function handleTouchStartViseur(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2) {
      pincementRef.current = {
        distance: distanceEntreDoigts(event.touches),
        zoomInitial: zoomRef.current,
      };
    }
  }

  function handleTouchMoveViseur(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2 && pincementRef.current) {
      const distanceCourante = distanceEntreDoigts(event.touches);
      const nouveauZoom = calculerZoomDepuisPincement(
        pincementRef.current.distance,
        distanceCourante,
        pincementRef.current.zoomInitial,
        ZOOM_MIN,
        zoomMaxRef.current,
      );
      appliquerZoom(nouveauZoom);
    }
  }

  function handleTouchEndViseur(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) {
      pincementRef.current = null;
    }
  }

  function rescanner() {
    verrouScanRef.current = false;
    setErreurScan(null);
    setSucces(null);
    void demarrerCamera();
  }

  function handleSoumissionManuelle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jetonManuel.trim()) return;
    verrouScanRef.current = false;
    void soumettreJeton(jetonManuel);
  }

  function simulerScanDemoActif() {
    const active = lireSessionDemoActive();
    if (!active || !active.token) {
      setErreurScan(
        "Aucune projection d'émargement ouverte détectée dans ce navigateur.",
      );
      return;
    }
    const ageMs = Date.now() - active.lastTokenTimestampMs;
    const tokenFrais =
      ageMs > 5000 && active.secretKey.length >= 16
        ? genererJetonPresenceClient(
            active.seanceId,
            active.counter + 1,
            active.secretKey,
            Date.now(),
          ).token
        : active.token;
    verrouScanRef.current = false;
    void soumettreJeton(tokenFrais);
  }

  if (!ouvert) return null;

  const zoomNumeriqueVisuel =
    zoomOptiqueMax > 1 ? Math.max(1, zoom / Math.min(zoom, zoomOptiqueMax)) : zoom;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-[#061529] flex flex-col justify-between px-4 py-3.5 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-scanner-presence"
    >
      {/* EN-TETE EPURE */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5 text-white min-w-0">
          <div className="w-9 h-9 bg-[#1A5FB4] flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="titre-scanner-presence" className="text-sm sm:text-base font-bold truncate">
              Scanner ma présence
            </h2>
            <p className="text-[11px] sm:text-xs text-sky-200/85 truncate">
              Cadrez le QR Code projeté par l'enseignant
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            arreterCamera();
            onFermer();
          }}
          aria-label="Fermer le scanner de présence"
          className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors flex items-center justify-center shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* CONTENU CENTRAL ERGONOMIQUE */}
      <div className="w-full max-w-md mx-auto my-auto py-4 space-y-4">
        {succes ? (
          /* ECRAN DE SUCCES */
          <div
            data-testid="scan-success-panel"
            className="bg-[#15803D] text-white border border-emerald-300/70 p-6 text-center space-y-5 shadow-2xl"
          >
            <div className="w-14 h-14 bg-white text-[#15803D] mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">
                Présence enregistrée
              </span>
              <h3 className="text-lg sm:text-xl font-extrabold leading-snug">
                {succes.message}
              </h3>
            </div>

            <div className="bg-[#0F5E2D] border border-emerald-400/35 p-3.5 text-left text-xs space-y-2">
              <div className="flex justify-between gap-3">
                <span className="text-emerald-100 shrink-0">UE</span>
                <span className="font-bold text-white text-right">
                  {succes.codeUe} : {succes.intituleUe}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-emerald-100 shrink-0">Séance</span>
                <span className="font-semibold text-white text-right">
                  {succes.libelleSeance}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-emerald-100 shrink-0">Horodatage</span>
                <span className="font-mono font-bold text-white text-right">
                  {succes.dateSeance} à {formaterHeureExacte(succes.scanneA)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onFermer}
              className="w-full py-3 px-5 bg-white text-[#15803D] hover:bg-emerald-50 font-extrabold text-xs uppercase tracking-wider transition-colors min-h-[46px]"
            >
              Retour à mes présences
            </button>
          </div>
        ) : (
          <>
            {/* ALERTE D'ERREUR METIER */}
            {erreurScan && (
              <div
                data-testid="scan-error-alert"
                className="bg-[#B91C1C] text-white border border-red-300/50 p-3.5 space-y-2.5"
                role="alert"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-200" />
                  <p className="text-xs sm:text-sm font-semibold leading-snug">{erreurScan}</p>
                </div>
                <button
                  type="button"
                  onClick={rescanner}
                  className="w-full py-2 bg-white text-[#B91C1C] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 min-h-[40px]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Réessayer le scan</span>
                </button>
              </div>
            )}

            {/* VISEUR CAMERA EPURE + PINCEMENT POUR ZOOMER */}
            <div
              onTouchStart={handleTouchStartViseur}
              onTouchMove={handleTouchMoveViseur}
              onTouchEnd={handleTouchEndViseur}
              className="relative bg-black border border-white/20 overflow-hidden aspect-square w-full max-w-[360px] mx-auto flex items-center justify-center touch-none select-none shadow-2xl"
            >
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover transition-transform duration-100 ease-out origin-center ${classeZoomNumerique(
                  zoomNumeriqueVisuel,
                )} ${etatCamera === 'active' ? 'opacity-100' : 'opacity-0'}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {etatCamera === 'active' && (
                <>
                  {/* CADRE DE VISEE CARRE + LIGNE DE BALAYAGE */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[70%] h-[70%] relative">
                      <span className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-[#E8C97A]" />
                      <span className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-[#E8C97A]" />
                      <span className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-[#E8C97A]" />
                      <span className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-[#E8C97A]" />
                      <div className="enp-scan-line absolute left-2 right-2 h-0.5 bg-emerald-400 shadow-[0_0_10px_#34D399]" />
                    </div>
                  </div>

                  {/* BOUTON TORCHE FLOTTANT SI SUPPORTE */}
                  {torcheSupportee && (
                    <button
                      type="button"
                      onClick={() => void basculerTorche()}
                      aria-label={torcheActive ? 'Éteindre la torche' : 'Allumer la torche'}
                      className={`absolute bottom-3 right-3 w-11 h-11 flex items-center justify-center border transition-colors ${
                        torcheActive
                          ? 'bg-[#B08D35] text-[#061529] border-[#B08D35]'
                          : 'bg-[#061529]/80 text-white border-white/25 hover:bg-[#0B2545]'
                      }`}
                    >
                      <Flashlight className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}

              {etatCamera === 'init' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center">
                  <Camera className="w-8 h-8 text-[#E8C97A] animate-pulse" />
                  <p className="text-sm font-medium text-sky-100">
                    Ouverture de la caméra...
                  </p>
                </div>
              )}

              {etatCamera === 'indisponible' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-200 p-6 text-center bg-[#0B2545]">
                  <Camera className="w-9 h-9 text-[#E8C97A]" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-white">
                      Caméra indisponible
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-[260px]">
                      {messageCamera}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void demarrerCamera()}
                    className="mt-1 px-4 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 text-xs font-semibold flex items-center gap-1.5 min-h-[40px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Réessayer</span>
                  </button>
                </div>
              )}

              {traitement && (
                <div className="absolute inset-0 bg-[#061529]/85 flex flex-col items-center justify-center gap-2.5 text-white">
                  <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
                  <span className="text-sm font-semibold">Validation en cours...</span>
                </div>
              )}
            </div>

            {/* CURSEUR DE ZOOM EPURE (SANS TEXTE NI BOUTONS DE COTES) */}
            <div
              data-testid="qr-zoom-controls"
              className="w-full max-w-[360px] mx-auto bg-white/[0.07] border border-white/15 px-3 py-2.5 flex items-center gap-2.5 text-white"
            >
              <button
                type="button"
                onClick={() => appliquerZoom(zoom - ZOOM_PAS)}
                disabled={zoom <= ZOOM_MIN}
                aria-label="Dézoomer la caméra"
                className="w-9 h-9 bg-white/10 hover:bg-white/20 disabled:opacity-35 flex items-center justify-center shrink-0 transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <input
                type="range"
                min={ZOOM_MIN}
                max={zoomMax}
                step={ZOOM_PAS}
                value={zoom}
                onChange={(event) => appliquerZoom(Number(event.target.value))}
                aria-label="Curseur de zoom de la caméra"
                className="flex-1 accent-[#B08D35] h-2 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => appliquerZoom(zoom + ZOOM_PAS)}
                disabled={zoom >= zoomMax}
                aria-label="Zoomer la caméra"
                className="w-9 h-9 bg-white/10 hover:bg-white/20 disabled:opacity-35 flex items-center justify-center shrink-0 transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <span
                data-testid="qr-zoom-value"
                className="w-10 text-right text-xs font-mono font-bold text-[#E8C97A] tabular-nums shrink-0"
              >
                {zoom.toFixed(1)}×
              </span>
            </div>

            {/* ACTION DEMO SI SESSION ACTIVE EN MODE MAQUETTE */}
            {estModeMock && sessionDemo && (
              <div className="w-full max-w-[360px] mx-auto bg-emerald-500/15 border border-emerald-400/40 p-3 space-y-2 text-white">
                <p className="text-xs font-semibold text-emerald-200 truncate">
                  Projection démo active : {sessionDemo.codeUe}
                </p>
                <button
                  type="button"
                  data-testid="demo-scan-active-btn"
                  disabled={traitement}
                  onClick={simulerScanDemoActif}
                  className="w-full py-2.5 px-4 bg-[#15803D] hover:bg-[#166534] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors min-h-[42px]"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Valider le QR Code projeté (démo)</span>
                </button>
              </div>
            )}

            {/* OPTION DISCRETE DE SAISIE MANUELLE */}
            <div className="w-full max-w-[360px] mx-auto text-center space-y-2.5">
              <button
                type="button"
                onClick={() => setAfficherSaisieManuelle((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-200/80 hover:text-white py-1 transition-colors"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>
                  {afficherSaisieManuelle ? 'Masquer la saisie manuelle' : 'Saisir un jeton manuellement'}
                </span>
              </button>

              {afficherSaisieManuelle && (
                <form onSubmit={handleSoumissionManuelle} className="flex gap-2">
                  <input
                    type="text"
                    value={jetonManuel}
                    onChange={(event) => setJetonManuel(event.target.value)}
                    placeholder="ENP-PRESENCE:v1...."
                    aria-label="Jeton QR de présence"
                    className="flex-1 bg-white text-[#0B2545] px-3 py-2 text-xs font-mono border border-slate-300 focus:outline-none focus:border-[#B08D35] min-h-[42px]"
                  />
                  <button
                    type="submit"
                    disabled={traitement || !jetonManuel.trim()}
                    className="px-4 py-2 bg-[#B08D35] hover:bg-[#997828] disabled:opacity-50 text-[#061529] font-extrabold text-xs uppercase tracking-wider min-h-[42px]"
                  >
                    Valider
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {/* PIED SECURITE DISCRET */}
      <div className="w-full max-w-md mx-auto pt-2.5 border-t border-white/10 flex items-center justify-center gap-1.5 text-[11px] text-slate-300/85 text-center">
        <ShieldCheck className="w-3.5 h-3.5 text-[#E8C97A] shrink-0" />
        <span>Jeton sécurisé · Appareil unique par séance</span>
      </div>
    </div>,
    document.body,
  );
}
