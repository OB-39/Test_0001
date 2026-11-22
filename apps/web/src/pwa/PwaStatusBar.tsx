import { useEffect, useState } from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from './useOnlineStatus';

interface EvenementMiseAJourSw extends Event {
  detail?: {
    registration?: ServiceWorkerRegistration;
  };
}

/**
 * Barre d'etat PWA :
 * 1. Indique de maniere claire lorsque l'appareil passe hors ligne.
 * 2. Propose d'appliquer immediatement une nouvelle version du portail quand le Service Worker est pret.
 */
export function PwaStatusBar() {
  const estEnLigne = useOnlineStatus();
  const [registrationEnAttente, setRegistrationEnAttente] =
    useState<ServiceWorkerRegistration | null>(null);
  const [majMasquee, setMajMasquee] = useState(false);

  useEffect(() => {
    const onUpdateAvailable = (event: Event) => {
      const customEvent = event as EvenementMiseAJourSw;
      if (customEvent.detail?.registration) {
        setRegistrationEnAttente(customEvent.detail.registration);
        setMajMasquee(false);
      }
    };

    window.addEventListener('enp-sw-update', onUpdateAvailable);
    return () => {
      window.removeEventListener('enp-sw-update', onUpdateAvailable);
    };
  }, []);

  function appliquerMiseAJour() {
    if (registrationEnAttente?.waiting) {
      registrationEnAttente.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }

  return (
    <>
      {!estEnLigne && (
        <div
          role="status"
          aria-live="polite"
          data-testid="pwa-offline-banner"
          className="bg-amber-600 text-white px-3 py-2 sm:px-4 border-b border-amber-700"
        >
          <div className="max-w-7xl mx-auto flex items-start sm:items-center justify-start sm:justify-center gap-2 text-xs sm:text-sm font-semibold text-left sm:text-center leading-snug">
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Mode hors ligne actif : consultation des données déjà chargées. L'émargement QR nécessite une connexion réseau.
            </span>
          </div>
        </div>
      )}

      {registrationEnAttente && !majMasquee && (
        <div
          role="status"
          aria-live="polite"
          data-testid="pwa-update-banner"
          className="bg-[#0B2545] text-white px-3 py-2 sm:px-4 border-b border-[#B08D35]/50"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className="w-4 h-4 text-[#B08D35] shrink-0" />
              <span className="font-semibold truncate">
                Une nouvelle version du portail ENP est disponible.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={appliquerMiseAJour}
                className="px-3 py-1 bg-[#B08D35] hover:bg-[#997828] text-[#071A33] font-extrabold text-xs uppercase tracking-wider transition-colors"
              >
                Actualiser
              </button>
              <button
                type="button"
                onClick={() => setMajMasquee(true)}
                aria-label="Fermer la notification de mise à jour"
                className="p-1 text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
