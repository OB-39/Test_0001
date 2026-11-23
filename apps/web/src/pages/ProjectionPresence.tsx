import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Power,
  RefreshCw,
  ShieldCheck,
  Users,
  Wifi,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import type { SessionQrPresence } from '@/api/types';
import { useConfirmation } from '@/components/useConfirmation';
import {
  DUREE_ROTATION_MS,
  calculerPourcentagePresence,
  formaterHeureExacte,
} from '@/utils/qrPresenceToken';
import {
  genererCsvEmargement,
  telechargerCsv,
} from '@/utils/attendanceEnhancements';

/**
 * Ecran plein ecran de projection d'emargement par QR Code dynamique tournant (ENP).
 * Optimise pour videoprojecteur (16:9 et 16:10) avec renouvellement toutes les 6 secondes.
 * Attribution : Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos & OHOUNSOUN Bienvenu.
 */
export function ProjectionPresence() {
  const { seanceId: seanceIdParam } = useParams<{ seanceId: string }>();
  const navigate = useNavigate();
  const { confirmer } = useConfirmation();
  const seanceId = Number(seanceIdParam);

  const [session, setSession] = useState<SessionQrPresence | null>(null);
  const [chargement, setChargement] = useState(true);
  const [clotureEnCours, setClotureEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [horloge, setHorloge] = useState(() =>
    new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );
  const [tempsRestantMs, setTempsRestantMs] = useState<number>(DUREE_ROTATION_MS);
  const [estPleinEcran, setEstPleinEcran] = useState(false);
  const [jetonCopie, setJetonCopie] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  const dernierCounterRef = useRef<number>(0);
  const dernierTokenRef = useRef<string>('');
  const dernierTokenAtRef = useRef<number>(Date.now());
  const estModeMock = import.meta.env.VITE_USE_MOCK === 'true';

  const appliquerSession = useCallback((data: SessionQrPresence) => {
    setSession(data);
    if (data.counter !== dernierCounterRef.current || (data.token && data.token !== dernierTokenRef.current)) {
      dernierCounterRef.current = data.counter;
      dernierTokenRef.current = data.token;
      dernierTokenAtRef.current = Date.now();
      setTempsRestantMs(DUREE_ROTATION_MS);
      setPulseKey((k) => k + 1);
    }
  }, []);

  const demarrer = useCallback(async () => {
    if (!Number.isSafeInteger(seanceId) || seanceId <= 0) {
      setErreur('Identifiant de séance invalide.');
      setChargement(false);
      return;
    }
    setChargement(true);
    setErreur(null);
    try {
      const data = await api.presenceDemarrerSession(seanceId);
      appliquerSession(data);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : "Impossible de démarrer la projection d'émargement.",
      );
    } finally {
      setChargement(false);
    }
  }, [seanceId, appliquerSession]);

  useEffect(() => {
    void demarrer();
  }, [demarrer]);

  const rafraichir = useCallback(async () => {
    if (!Number.isSafeInteger(seanceId) || seanceId <= 0) return;
    try {
      const data = await api.presenceObtenirJeton(seanceId);
      appliquerSession(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErreur(err.messages.join(' '));
      }
    }
  }, [seanceId, appliquerSession]);

  // Horloge numerique et barre de compte a rebours fluide (100 ms)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setHorloge(
        new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
      const ecoule = Date.now() - dernierTokenAtRef.current;
      const restant = Math.max(0, DUREE_ROTATION_MS - ecoule);
      setTempsRestantMs(restant);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  // Polling aligne sur la rotation de 6 secondes (5,5 s avec 2,5 s de recouvrement dans la fenetre serveur de 8 s)
  const statutSession = session?.statut;
  useEffect(() => {
    if (statutSession !== 'ouverte') return;
    const poll = window.setInterval(() => {
      void rafraichir();
    }, 5500);
    return () => window.clearInterval(poll);
  }, [statutSession, rafraichir]);

  // Synchronisation instantanee inter-onglets en mode maquette
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'enp_mock_qr_presence_sessions_v1') {
        void rafraichir();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [rafraichir]);

  // Suivi etat API Fullscreen du navigateur
  useEffect(() => {
    const onFullscreenChange = () => {
      setEstPleinEcran(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  async function basculerPleinEcran() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Certains navigateurs ou iframes peuvent restreindre le mode plein ecran
    }
  }

  async function cloturerEmargement() {
    if (!session || session.statut === 'fermee') return;
    const confirme = await confirmer({
      title: "Clôturer définitivement l'émargement ?",
      message: `La session d'émargement pour ${session.codeUe} sera fermée (${session.presents} présent(s) sur ${session.inscrits}). Tout nouveau scan étudiant sera immédiatement bloqué.`,
      confirmLabel: "Clôturer l'émargement",
      variant: 'danger',
    });
    if (!confirme) return;

    setClotureEnCours(true);
    setErreur(null);
    try {
      const cloturee = await api.presenceCloturerSession(session.seanceId);
      setSession(cloturee);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : "Impossible de clôturer la session d'émargement.",
      );
    } finally {
      setClotureEnCours(false);
    }
  }

  const [pauseEnCours, setPauseEnCours] = useState(false);

  async function basculerPause() {
    if (!session || session.statut === 'fermee') return;
    setPauseEnCours(true);
    setErreur(null);
    try {
      const maj =
        session.statut === 'ouverte'
          ? await api.presenceMettreEnPause(session.seanceId)
          : await api.presenceReprendreSession(session.seanceId);
      appliquerSession(maj);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : "Impossible de modifier l'état de la projection.",
      );
    } finally {
      setPauseEnCours(false);
    }
  }

  async function exporterFeuilleCsv() {
    if (!session) return;
    try {
      const detail = await api.dossierPresenceSeance(session.seanceId);
      const mapHorodatage = new Map(
        session.recents.map((r) => [r.etudiantId, formaterHeureExacte(r.scanneA)]),
      );
      const libelles: Record<string, string> = {
        present: 'Présent',
        retard: 'En retard',
        absent: 'Absent',
        justifie: 'Justifié',
      };
      const lignes = detail.etudiants.map((etu) => ({
        matricule: etu.identifiant ?? `ETU-${etu.id}`,
        nom: etu.nom,
        prenom: etu.prenom,
        statut: etu.statut ? (libelles[etu.statut] ?? etu.statut) : 'Non pointé',
        horodatage: mapHorodatage.get(etu.id) ?? '-',
        methode: mapHorodatage.has(etu.id)
          ? 'QR Code dynamique'
          : etu.statut
            ? 'Appel manuel'
            : '-',
      }));
      const csv = genererCsvEmargement(
        {
          codeUe: session.codeUe,
          intituleUe: session.intituleUe,
          libelleSeance: session.libelleSeance,
          dateSeance: session.dateSeance,
          presents: session.presents,
          inscrits: session.inscrits,
        },
        lignes,
      );
      telechargerCsv(
        `emargement_${session.codeUe}_${session.dateSeance}.csv`,
        csv,
      );
    } catch {
      const lignes = session.recents.map((r) => ({
        matricule: r.identifiant ?? `ETU-${r.etudiantId}`,
        nom: r.nom,
        prenom: r.prenom,
        statut: 'Présent',
        horodatage: formaterHeureExacte(r.scanneA),
        methode: 'QR Code dynamique',
      }));
      const csv = genererCsvEmargement(
        {
          codeUe: session.codeUe,
          intituleUe: session.intituleUe,
          libelleSeance: session.libelleSeance,
          dateSeance: session.dateSeance,
          presents: session.presents,
          inscrits: session.inscrits,
        },
        lignes,
      );
      telechargerCsv(
        `emargement_${session.codeUe}_${session.dateSeance}.csv`,
        csv,
      );
    }
  }

  async function copierJetonDemo() {
    if (!session?.token) return;
    try {
      await navigator.clipboard.writeText(session.token);
      setJetonCopie(true);
      window.setTimeout(() => setJetonCopie(false), 2000);
    } catch {
      setJetonCopie(false);
    }
  }

  const pourcentage = session
    ? calculerPourcentagePresence(session.presents, session.inscrits)
    : 0;
  const pourcentageCompteARebours = Math.max(
    0,
    Math.min(100, (tempsRestantMs / DUREE_ROTATION_MS) * 100),
  );
  const secondesRestantes = (tempsRestantMs / 1000).toFixed(1).replace('.', ',');
  const estOuverte = session?.statut === 'ouverte';
  const estEnPause = session?.statut === 'pause';

  return (
    <div className="min-h-screen w-full bg-[#0B2545] text-white flex flex-col selection:bg-[#B08D35] selection:text-white">
      {/* BANDEAU INSTITUTIONNEL SUPERIEUR */}
      <header className="border-b border-white/15 bg-[#071A33] px-4 sm:px-8 py-4">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src="/logo-enp-white.png"
              alt="Logo École Nationale Polytechnique"
              className="h-10 sm:h-12 w-auto object-contain shrink-0"
            />
            <div className="border-l border-white/20 pl-4 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-[#B08D35] text-[#071A33] font-mono text-xs sm:text-sm font-extrabold px-2 py-0.5 uppercase tracking-wider">
                  {session?.codeUe ?? 'ENP'}
                </span>
                <span className="text-[11px] uppercase tracking-widest text-sky-200 font-semibold">
                  Émargement sécurisé par QR Code tournant
                </span>
              </div>
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white truncate mt-0.5">
                {session
                  ? `${session.codeUe} : ${session.intituleUe}`
                  : 'Projection de présence'}
              </h1>
              {session && (
                <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                  {session.libelleSeance} · Promotion inscrite ({session.inscrits} étudiants) · Séance du{' '}
                  <span className="font-mono font-semibold text-white">{session.dateSeance}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <div
              className="bg-white/10 border border-white/15 px-3.5 py-2 flex items-center gap-2 font-mono text-lg sm:text-2xl font-bold tabular-nums text-white"
              aria-label="Heure actuelle"
            >
              <Clock className="w-5 h-5 text-[#B08D35] shrink-0" />
              <span>{horloge}</span>
            </div>

            <button
              type="button"
              onClick={() => void basculerPleinEcran()}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-xs sm:text-sm font-semibold text-white transition-colors min-h-[44px]"
              aria-label={estPleinEcran ? 'Quitter le plein écran' : 'Passer en plein écran'}
            >
              {estPleinEcran ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {estPleinEcran ? 'Quitter plein écran' : 'Plein écran'}
              </span>
            </button>

            <Link
              to="/enseignant/presences"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white text-[#0B2545] hover:bg-slate-100 font-bold text-xs sm:text-sm transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Retour</span>
            </Link>
          </div>
        </div>
      </header>

      {/* CORPS PRINCIPAL 16:9 / 16:10 */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center">
        {erreur && (
          <div className="mb-6 bg-[#B91C1C]/20 border border-red-400/50 text-red-100 px-4 py-3 text-sm flex items-center justify-between gap-4">
            <span>{erreur}</span>
            <button
              type="button"
              onClick={() => void demarrer()}
              className="px-3 py-1.5 bg-white text-[#0B2545] font-bold text-xs shrink-0"
            >
              Réessayer
            </button>
          </div>
        )}

        {chargement && !session ? (
          <div className="bg-white/5 border border-white/15 p-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#B08D35]" />
            <p className="text-base font-semibold text-slate-200">
              Initialisation du moteur cryptographique HMAC-SHA256...
            </p>
          </div>
        ) : session ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
            {/* ZONE CENTRALE : QR CODE GEANT HAUTE CONTRASTE */}
            <section className="lg:col-span-7 xl:col-span-8 bg-white text-[#0B2545] border-t-4 border-[#B08D35] shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-between gap-6">
              <div className="w-full flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2.5">
                  {estOuverte ? (
                    <>
                      <span className="inline-block w-3 h-3 bg-[#15803D] animate-pulse" />
                      <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#15803D]">
                        Émargement ouvert en direct
                      </span>
                    </>
                  ) : estEnPause ? (
                    <>
                      <span className="inline-block w-3 h-3 bg-[#D97706]" />
                      <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#B45309]">
                        Émargement en pause
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-block w-3 h-3 bg-[#B91C1C]" />
                      <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#B91C1C]">
                        Émargement clôturé
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#0B2545]">
                  <span className="bg-slate-100 border border-slate-300 px-2.5 py-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#1A5FB4]" />
                    <span>HMAC-SHA256</span>
                  </span>
                  <span className="bg-[#0B2545] text-white px-2.5 py-1">
                    Jeton #{session.counter}
                  </span>
                </div>
              </div>

              {estOuverte && session.token ? (
                <div className="flex flex-col items-center justify-center gap-5 w-full my-auto py-2">
                  <p className="text-center text-sm sm:text-lg font-bold text-[#0B2545]">
                    Scannez ce QR Code depuis l'application Portail ENP sur votre smartphone
                  </p>

                  {/* CADRE DU QR CODE AVEC PULSATION AU CHANGEMENT */}
                  <div
                    key={pulseKey}
                    data-testid="projection-qr-frame"
                    data-counter={session.counter}
                    className="enp-qr-pulse p-5 sm:p-6 bg-white border-4 border-[#0B2545] shadow-lg relative"
                  >
                    <QRCodeSVG
                      value={session.token}
                      size={320}
                      level="M"
                      includeMargin={false}
                      bgColor="#FFFFFF"
                      fgColor="#0B2545"
                      className="w-[240px] h-[240px] sm:w-[320px] sm:h-[320px] xl:w-[360px] xl:h-[360px]"
                    />
                  </div>

                  {/* BARRE DE PROGRESSION DE 6 SECONDES */}
                  <div className="w-full max-w-md space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-[#0B2545]">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-4 h-4 text-[#1A5FB4]" />
                        <span>Renouvellement automatique toutes les 6 secondes</span>
                      </span>
                      <span className="font-mono tabular-nums text-[#1A5FB4]">
                        {secondesRestantes} s
                      </span>
                    </div>
                    <div
                      className="w-full h-3 bg-slate-200 border border-slate-300 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(pourcentageCompteARebours)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Temps restant avant le prochain QR Code"
                    >
                      <div
                        className={`h-full transition-[width] duration-100 ease-linear ${
                          pourcentageCompteARebours <= 25
                            ? 'bg-[#D97706]'
                            : 'bg-[#1A5FB4]'
                        }`}
                        style={{ width: `${pourcentageCompteARebours}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : estEnPause ? (
                <div
                  data-testid="projection-paused-panel"
                  className="my-auto py-12 text-center space-y-4 max-w-md"
                >
                  <div className="w-16 h-16 bg-amber-100 text-[#B45309] border border-amber-300 mx-auto flex items-center justify-center">
                    <Pause className="w-9 h-9" />
                  </div>
                  <h2 className="text-2xl font-extrabold text-[#0B2545]">
                    Projection temporairement en pause
                  </h2>
                  <p className="text-sm text-slate-600">
                    La génération de jetons QR est suspendue. Aucun scan étudiant n'est accepté tant que vous ne reprenez pas l'émargement.
                  </p>
                  <div className="pt-2 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      disabled={pauseEnCours}
                      onClick={() => void basculerPause()}
                      className="inline-flex items-center gap-2 px-5 py-3 bg-[#15803D] hover:bg-[#166534] text-white font-bold text-sm transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      <span>Reprendre l'émargement</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="my-auto py-12 text-center space-y-4 max-w-md">
                  <div className="w-16 h-16 bg-emerald-100 text-[#15803D] border border-emerald-300 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h2 className="text-2xl font-extrabold text-[#0B2545]">
                    Émargement définitivement clôturé
                  </h2>
                  <p className="text-sm text-slate-600">
                    La feuille de présence est synchronisée avec {session.presents} étudiant(s)
                    marqué(s) présent(s) sur {session.inscrits}. Aucun scan supplémentaire n'est accepté.
                  </p>
                  <div className="pt-2 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => void exporterFeuilleCsv()}
                      className="inline-flex items-center gap-2 px-5 py-3 bg-[#15803D] hover:bg-[#166534] text-white font-bold text-sm transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Exporter la feuille (CSV)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/enseignant/presences')}
                      className="px-5 py-3 bg-[#0B2545] hover:bg-[#163A66] text-white font-bold text-sm transition-colors"
                    >
                      Consulter la feuille d'appel
                    </button>
                  </div>
                </div>
              )}

              <div className="w-full border-t border-slate-200 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-[#15803D] shrink-0" />
                  <span>
                    Protection anti-partage active : toute capture photo expire au-delà de 8 secondes.
                  </span>
                </span>
                {estModeMock && estOuverte && session.token && (
                  <button
                    type="button"
                    onClick={() => void copierJetonDemo()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[#0B2545] font-mono text-[11px] font-bold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{jetonCopie ? 'Jeton copié !' : 'Copier jeton actif (démo)'}</span>
                  </button>
                )}
              </div>
            </section>

            {/* PANNEAU LATERAL DROIT : COMPTEUR GEANT & FLUX EN DIRECT */}
            <aside className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5">
              {/* COMPTEUR GEANT */}
              <div className="bg-[#0F315B] border border-white/15 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-sky-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#B08D35]" />
                    <span>Présents en direct</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
                    <Wifi className="w-3.5 h-3.5" />
                    <span>
                      {estOuverte ? 'Temps réel' : estEnPause ? 'En pause' : 'Clôturé'}
                    </span>
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <div
                    data-testid="projection-live-counter"
                    className="font-mono font-extrabold text-5xl sm:text-6xl tracking-tight tabular-nums text-white"
                  >
                    {session.presents}
                    <span className="text-2xl sm:text-3xl text-slate-300 font-semibold">
                      {' '}
                      / {session.inscrits}
                    </span>
                  </div>
                  <div className="bg-[#B08D35] text-[#071A33] font-mono font-extrabold text-xl sm:text-2xl px-3 py-1 tabular-nums">
                    {pourcentage}%
                  </div>
                </div>

                <div className="w-full h-3.5 bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${pourcentage}%` }}
                  />
                </div>
              </div>

              {/* FLUX DES 5 DERNIERS ETUDIANTS */}
              <div className="bg-[#0F315B] border border-white/15 p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between border-b border-white/15 pb-3 mb-4">
                  <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white">
                    Derniers émargements (5 récents)
                  </h2>
                  <span className="text-xs font-mono text-sky-200">
                    {session.recents.length} affiché(s)
                  </span>
                </div>

                {session.recents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-slate-300 space-y-2">
                    <Users className="w-8 h-8 opacity-40" />
                    <p className="text-sm font-medium">
                      En attente des premiers scans étudiants...
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2.5" aria-live="polite">
                    {session.recents.slice(0, 5).map((arrivee, index) => (
                      <li
                        key={`${arrivee.etudiantId}-${arrivee.scanneA}`}
                        className={`enp-arrival-pop flex items-center justify-between gap-3 px-3.5 py-3 border ${
                          index === 0
                            ? 'bg-emerald-500/20 border-emerald-400/50'
                            : 'bg-white/5 border-white/15'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-sm sm:text-base text-white truncate">
                            {arrivee.prenom} {arrivee.nom}
                          </p>
                          <p className="text-[11px] font-mono text-sky-200">
                            {arrivee.identifiant ?? `ID-${arrivee.etudiantId}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs sm:text-sm font-bold text-emerald-300 tabular-nums">
                            {formaterHeureExacte(arrivee.scanneA)}
                          </span>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* COMMANDES ENSEIGNANT : PAUSE/REPRISE, EXPORT & CLOTURE */}
              <div className="space-y-2.5">
                {(estOuverte || estEnPause) && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      data-testid="btn-pause-reprise"
                      disabled={pauseEnCours}
                      onClick={() => void basculerPause()}
                      className={`py-3 px-4 font-extrabold text-xs uppercase tracking-wider border flex items-center justify-center gap-2 transition-colors min-h-[48px] ${
                        estEnPause
                          ? 'bg-[#15803D] hover:bg-[#166534] text-white border-emerald-400/40'
                          : 'bg-[#B08D35] hover:bg-[#997828] text-[#071A33] border-amber-300/40'
                      }`}
                    >
                      {estEnPause ? (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Reprendre</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exporterFeuilleCsv()}
                      className="py-3 px-4 bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs uppercase tracking-wider border border-white/25 flex items-center justify-center gap-2 transition-colors min-h-[48px]"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                )}

                {(estOuverte || estEnPause) && (
                  <button
                    type="button"
                    disabled={clotureEnCours}
                    onClick={() => void cloturerEmargement()}
                    className="w-full py-4 px-6 bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-60 text-white font-extrabold text-base uppercase tracking-wider border border-red-400/40 shadow-lg flex items-center justify-center gap-2.5 transition-colors min-h-[56px]"
                  >
                    <Power className="w-5 h-5" />
                    <span>
                      {clotureEnCours ? 'Clôture en cours...' : "Clôturer l'émargement"}
                    </span>
                  </button>
                )}
              </div>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
