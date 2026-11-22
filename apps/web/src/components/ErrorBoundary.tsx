import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  aUneErreur: boolean;
  message: string;
}

/**
 * Garde-fou global React empechant les ecrans blancs en cas d'erreur inattendue.
 * Affiche un ecran de secours institutionnel ENP permettant de recharger ou revenir a l'accueil.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    aUneErreur: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      aUneErreur: true,
      message: error?.message || 'Erreur inattendue lors du rendu de la page.',
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ENP ErrorBoundary]', error, info.componentStack);
    }
  }

  private handleRecharger = () => {
    window.location.reload();
  };

  private handleRetourAccueil = () => {
    this.setState({ aUneErreur: false, message: '' });
    window.location.assign('/');
  };

  public render() {
    if (!this.state.aUneErreur) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center p-4 sm:p-8">
        <div className="max-w-lg w-full bg-white border-2 border-[#0B2545] shadow-lg overflow-hidden">
          <div className="bg-[#0B2545] text-white px-6 py-4 border-b-4 border-[#B08D35] flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600/20 border border-red-400/50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-sky-200">
                Portail Académique ENP
              </p>
              <h1 className="text-base sm:text-lg font-extrabold">
                Incident temporaire d'affichage
              </h1>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              Une erreur inattendue s'est produite lors du chargement de cet écran. Vos données déjà enregistrées sur la plateforme sont intactes.
            </p>

            {import.meta.env.DEV && this.state.message && (
              <div className="bg-slate-100 border border-slate-300 p-3 text-xs font-mono text-slate-800 break-words">
                {this.state.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleRecharger}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#0B2545] hover:bg-[#071A33] text-white font-bold text-sm px-4 py-3 transition-colors min-h-[44px]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recharger la page</span>
              </button>
              <button
                type="button"
                onClick={this.handleRetourAccueil}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#0B2545] border border-slate-300 font-bold text-sm px-4 py-3 transition-colors min-h-[44px]"
              >
                <Home className="w-4 h-4" />
                <span>Retour à l'accueil</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
