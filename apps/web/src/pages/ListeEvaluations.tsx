import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import type { UeAEvaluer } from '@/api/types';
import {
  PageHeader,
  ProgressBar,
  Alert,
  Button,
  Input,
  EmptyState,
  SkeletonCard,
} from '@/components/ui';

export function ListeEvaluations() {
  const [ues, setUes] = useState<UeAEvaluer[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [recherche, setRecherche] = useState('');
  const [filtreEtat, setFiltreEtat] = useState<'tous' | 'a_faire' | 'terminee'>('tous');

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const data = await api.listeEvaluations();
      setUes(data);
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.messages.join(' '));
      else setErreur('Impossible de charger vos unités d’enseignement.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const total = ues.length;
  const terminees = ues.filter((u) => u.etat === 'terminee').length;
  const aFaire = total - terminees;
  const pct = total > 0 ? Math.round((terminees / total) * 100) : 0;

  const uesFiltrees = useMemo(() => {
    return ues.filter((ue) => {
      const matchRecherche =
        !recherche ||
        ue.code.toLowerCase().includes(recherche.toLowerCase()) ||
        ue.intitule.toLowerCase().includes(recherche.toLowerCase());
      const matchEtat = filtreEtat === 'tous' || ue.etat === filtreEtat;
      return matchRecherche && matchEtat;
    });
  }, [ues, recherche, filtreEtat]);

  function formaterDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in pb-6">
      <PageHeader
        title="Évaluations des UE"
        description="Campagne anonyme · Session Harmattan"
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Évaluations' },
        ]}
      />

      {/* Bandeau de progression unifie */}
      <section className="bg-white border border-enp-border p-3.5 sm:p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-enp-blue-deep tabular-nums">
            {aFaire > 0 ? `${aFaire} UE à évaluer` : 'Toutes les UE sont évaluées'}
          </span>
          <span className="text-xs font-mono font-bold tabular-nums text-enp-gray-dark">
            {terminees}/{total} · {pct}%
          </span>
        </div>
        <ProgressBar
          value={pct}
          showPercent={false}
          size="sm"
          variant={pct === 100 ? 'success' : 'primary'}
        />
      </section>

      {/* Filtres compacts */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex-1 sm:max-w-xs">
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une UE..."
            startIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center w-full sm:w-auto">
          {(
            [
              { id: 'tous', label: `Toutes (${total})` },
              { id: 'a_faire', label: `À faire (${aFaire})` },
              { id: 'terminee', label: `Faites (${terminees})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFiltreEtat(tab.id)}
              className={`py-2 px-2 sm:px-3 text-xs font-semibold text-center border transition-colors min-h-[38px] tabular-nums ${
                filtreEtat === tab.id
                  ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                  : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des UE */}
      {chargement ? (
        <div className="grid grid-cols-1 gap-2.5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : erreur ? (
        <Alert variant="danger" title="Erreur lors du chargement">
          <div className="space-y-3">
            <p>{erreur}</p>
            <Button variant="outline" size="sm" onClick={() => void charger()}>
              Réessayer
            </Button>
          </div>
        </Alert>
      ) : uesFiltrees.length === 0 ? (
        <EmptyState
          title="Aucune unité d'enseignement trouvée"
          description={
            recherche
              ? 'Aucune UE ne correspond à votre recherche.'
              : "Aucune UE disponible dans cet onglet."
          }
        />
      ) : (
        <div className="bg-white border border-enp-border divide-y divide-enp-border">
          {uesFiltrees.map((ue) => {
            const estAFaire = ue.etat === 'a_faire';

            return (
              <div
                key={ue.ueId}
                className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  estAFaire ? 'bg-white hover:bg-enp-blue-ice/20' : 'bg-[#FAFAFA]'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-[11px] text-enp-gray-medium tabular-nums">
                    {ue.code} · Jusqu'au {formaterDate(ue.finCampagne)}
                  </p>
                  <h2 className="text-sm sm:text-base font-bold text-enp-black break-words">
                    {ue.intitule}
                  </h2>
                </div>

                <div className="shrink-0 w-full sm:w-auto">
                  {estAFaire ? (
                    <Link to={`/evaluations/${ue.ueId}`} className="block w-full sm:w-auto">
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full sm:w-auto justify-center font-semibold min-h-[40px]"
                        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                      >
                        Évaluer
                      </Button>
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-enp-green-valid text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Transmise
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
