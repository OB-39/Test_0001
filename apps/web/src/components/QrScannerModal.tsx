import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
} from 'lucide-react';
import { api, ApiError } from '@/api';
import type { ResultatScanPresence } from '@/api/types';
import {
  formaterHeureExacte,
  genererJetonPresenceClient,
  obtenirEmpreinteAppareil,
} from '@/utils/qrPresenceToken';

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

/**
 * Modale PWA de scan camera pour l'emargement etudiant par QR Code dynamique (ENP).
 * Compatible iOS Safari (playsInline + muted) et Android Chrome avec torche optionnelle.
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
  const onPresenceValideeRef = useRef(onPresenceValidee);
  onPresenceValideeRef.current = onPresenceValidee;

  const [etatCamera, setEtatCamera] = useState<
    'init' | 'active' | 'indisponible'
  >('init');
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
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setTorcheActive(false);
    setTorcheSupportee(false);
  }, []);

  const soumettreJeton = useCallback(
    async (tokenBrut: string) => {
      const token = tokenBrut.trim();
      if (!token || verrouScanRef.current) return;
      verrouScanRef.current = true;
      setTraitement(true);
      setErreurScan(null);

      // Vibration haptique immediate a la detection (mobile Android / PWA)
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(200);
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
    setErreurScan(null);
    setSucces(null);
    setEtatCamera('init');
    setMessageCamera(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setEtatCamera('indisponible');
      setMessageCamera(
        "La caméra n'est pas accessible dans ce navigateur. Utilisez un smartphone en HTTPS ou la saisie de jeton ci-dessous.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorcheSupportee(Boolean(caps.torch));
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
      const analyser = (horodatage: number) => {
        if (!streamRef.current || verrouScanRef.current) return;
        if (horodatage - dernierTick >= 140) {
          dernierTick = horodatage;
          const v = videoRef.current;
          const c = canvasRef.current;
          if (v && c && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const imageData = ctx.getImageData(0, 0, c.width, c.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (code && code.data) {
                void soumettreJeton(code.data);
                return;
              }
            }
          }
        }
        rafRef.current = window.requestAnimationFrame(analyser);
      };

      rafRef.current = window.requestAnimationFrame(analyser);
    } catch {
      setEtatCamera('indisponible');
      setAfficherSaisieManuelle(true);
      setMessageCamera(
        "Autorisation caméra refusée ou aucune caméra arrière détectée. Autorisez la caméra dans les réglages ou utilisez l'option de test ci-dessous.",
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

  // Rafraichir l'etat de la session demo ouverte en arriere-plan (mode maquette)
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
        "Aucune projection d'émargement ouverte détectée dans ce navigateur. Ouvrez une projection en tant qu'enseignant dans un autre onglet.",
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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-[#071A33] flex flex-col justify-between p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-scanner-presence"
    >
      {/* EN-TETE MODALE */}
      <div className="w-full max-w-lg mx-auto flex items-center justify-between gap-3 pb-3 border-b border-white/15">
        <div className="flex items-center gap-2.5 text-white">
          <div className="w-9 h-9 bg-[#1A5FB4] flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h2 id="titre-scanner-presence" className="text-base font-extrabold">
              Scanner ma présence en direct
            </h2>
            <p className="text-xs text-sky-200">
              Visez le QR Code projeté par l'enseignant
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
          className="p-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* CONTENU CENTRAL */}
      <div className="w-full max-w-lg mx-auto my-auto py-5 space-y-4">
        {succes ? (
          /* ECRAN DE SUCCES VERT FRANC */
          <div
            data-testid="scan-success-panel"
            className="bg-[#15803D] text-white border-2 border-emerald-300 p-6 sm:p-8 text-center space-y-5 shadow-2xl"
          >
            <div className="w-16 h-16 bg-white text-[#15803D] mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-100">
                Reçu d'émargement horodaté
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold leading-snug">
                {succes.message}
              </h3>
            </div>

            <div className="bg-[#0F5E2D] border border-emerald-400/40 p-4 text-left text-xs sm:text-sm space-y-2">
              <div className="flex justify-between gap-3">
                <span className="text-emerald-100 shrink-0">Unité d'enseignement</span>
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
                <span className="text-emerald-100 shrink-0">Date et heure exacte</span>
                <span className="font-mono font-bold text-white text-right">
                  {succes.dateSeance} à {formaterHeureExacte(succes.scanneA)}
                </span>
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-emerald-400/30">
                <span className="text-emerald-100 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Sécurité</span>
                </span>
                <span className="font-semibold text-emerald-100">
                  Jeton HMAC vérifié
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onFermer}
              className="w-full py-3.5 px-5 bg-white text-[#15803D] hover:bg-emerald-50 font-extrabold text-sm uppercase tracking-wider transition-colors min-h-[48px]"
            >
              Retour à mon relevé d'assiduité
            </button>
          </div>
        ) : (
          <>
            {/* ALERTE D'ERREUR METIER */}
            {erreurScan && (
              <div
                data-testid="scan-error-alert"
                className="bg-[#B91C1C] text-white border border-red-300/60 p-4 space-y-3"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-200" />
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-red-100">
                      Émargement non validé
                    </p>
                    <p className="text-sm font-bold leading-snug">{erreurScan}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={rescanner}
                  className="w-full py-2.5 bg-white text-[#B91C1C] font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Rescanner l'écran du professeur</span>
                </button>
              </div>
            )}

            {/* VISEUR CAMERA INTEGRE */}
            <div className="relative bg-black border-2 border-white/25 overflow-hidden aspect-square w-full max-w-[380px] mx-auto flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover ${
                  etatCamera === 'active' ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {etatCamera === 'active' && (
                <>
                  {/* CADRE DE VISEE CARRE + LIGNE DE BALAYAGE */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[72%] h-[72%] relative border border-white/30">
                      <span className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-[#B08D35]" />
                      <span className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-[#B08D35]" />
                      <span className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-[#B08D35]" />
                      <span className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-[#B08D35]" />
                      <div className="enp-scan-line absolute left-1 right-1 h-0.5 bg-emerald-400 shadow-[0_0_10px_#34D399]" />
                    </div>
                  </div>

                  {/* BOUTON TORCHE / FLASH SI SUPPORTE */}
                  {torcheSupportee && (
                    <button
                      type="button"
                      onClick={() => void basculerTorche()}
                      aria-label={
                        torcheActive ? 'Éteindre la torche' : 'Allumer la torche'
                      }
                      className={`absolute bottom-3 right-3 px-3 py-2 text-xs font-bold flex items-center gap-1.5 border transition-colors min-h-[44px] ${
                        torcheActive
                          ? 'bg-[#B08D35] text-[#071A33] border-[#B08D35]'
                          : 'bg-[#071A33]/85 text-white border-white/30 hover:bg-[#0B2545]'
                      }`}
                    >
                      <Flashlight className="w-4 h-4" />
                      <span>{torcheActive ? 'Torche active' : 'Torche'}</span>
                    </button>
                  )}
                </>
              )}

              {etatCamera === 'init' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center">
                  <Camera className="w-9 h-9 text-[#B08D35] animate-pulse" />
                  <p className="text-sm font-semibold">
                    Activation de la caméra arrière...
                  </p>
                </div>
              )}

              {etatCamera === 'indisponible' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-200 p-6 text-center bg-[#0B2545]">
                  <Camera className="w-10 h-10 text-[#B08D35]" />
                  <p className="text-sm font-bold text-white">
                    Caméra non disponible sur cet appareil
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {messageCamera}
                  </p>
                  <button
                    type="button"
                    onClick={() => void demarrerCamera()}
                    className="mt-1 px-4 py-2 bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-bold flex items-center gap-1.5 min-h-[40px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Réessayer la caméra</span>
                  </button>
                </div>
              )}

              {traitement && (
                <div className="absolute inset-0 bg-[#071A33]/80 flex flex-col items-center justify-center gap-2 text-white">
                  <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
                  <span className="text-sm font-bold">
                    Vérification cryptographique en cours...
                  </span>
                </div>
              )}
            </div>

            {/* AIDE AU TEST INTER-ONGLETS EN MODE MAQUETTE + SAISIE MANUELLE */}
            <div className="bg-white/10 border border-white/15 p-4 space-y-3 text-white">
              {estModeMock && sessionDemo && (
                <div className="bg-emerald-500/15 border border-emerald-400/40 p-3 space-y-2">
                  <p className="text-xs font-bold text-emerald-200">
                    Projection active détectée (mode démo) : {sessionDemo.codeUe} ({sessionDemo.libelleSeance})
                  </p>
                  <button
                    type="button"
                    data-testid="demo-scan-active-btn"
                    disabled={traitement}
                    onClick={simulerScanDemoActif}
                    className="w-full py-2.5 px-4 bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors min-h-[44px]"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Valider le QR Code projeté en direct (démo)</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setAfficherSaisieManuelle((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-sky-200 hover:text-white py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Keyboard className="w-4 h-4" />
                  <span>Saisir ou coller un jeton QR manuellement</span>
                </span>
                <span>{afficherSaisieManuelle ? 'Masquer' : 'Afficher'}</span>
              </button>

              {afficherSaisieManuelle && (
                <form onSubmit={handleSoumissionManuelle} className="flex gap-2">
                  <input
                    type="text"
                    value={jetonManuel}
                    onChange={(event) => setJetonManuel(event.target.value)}
                    placeholder="ENP-PRESENCE:v1...."
                    aria-label="Jeton QR de présence"
                    className="flex-1 bg-white text-[#0B2545] px-3 py-2 text-xs font-mono border border-slate-300 focus:outline-none focus:border-[#B08D35] min-h-[44px]"
                  />
                  <button
                    type="submit"
                    disabled={traitement || !jetonManuel.trim()}
                    className="px-4 py-2 bg-[#B08D35] hover:bg-[#997828] disabled:opacity-50 text-[#071A33] font-extrabold text-xs uppercase tracking-wider min-h-[44px]"
                  >
                    Valider
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {/* PIED SECURITE */}
      <div className="w-full max-w-lg mx-auto pt-3 border-t border-white/15 flex items-center justify-center gap-2 text-[11px] text-slate-300 text-center">
        <ShieldCheck className="w-4 h-4 text-[#B08D35] shrink-0" />
        <span>
          Jeton valable 8 secondes maximum · Empreinte d'appareil unique par séance
        </span>
      </div>
    </div>,
    document.body,
  );
}
