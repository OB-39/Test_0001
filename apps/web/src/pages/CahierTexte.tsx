import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Download,
  FileText,
  MessageSquare,
  Plus,
  Search,
  Stamp,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import { useConfirmation } from '@/components/useConfirmation';
import type { Avancement, Seance, UeCahier } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import {
  PageHeader,
  Button,
  Badge,
  Input,
  Select,
  Alert,
  EmptyState,
  Modal,
} from '@/components/ui';

const LIBELLES_VISA: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  en_attente: { label: 'À viser', variant: 'warning' },
  vise: { label: 'Visée', variant: 'success' },
  conteste: { label: 'Réserve', variant: 'danger' },
};

export function CahierTexte() {
  const { confirmer } = useConfirmation();
  const { aRole } = useAuth();

  const peutSaisir = aRole('delegue');
  const peutViser = aRole('enseignant');

  const [ues, setUes] = useState<UeCahier[]>([]);
  const [seances, setSeances] = useState<Seance[]>([]);
  const [avancements, setAvancements] = useState<Map<number, Avancement>>(new Map());

  const [recherche, setRecherche] = useState('');
  const [filtreUe, setFiltreUe] = useState<string>('all');
  const [filtreVisa, setFiltreVisa] = useState<'all' | 'en_attente' | 'vise' | 'conteste'>('all');
  const [filtreType, setFiltreType] = useState<string>('all');

  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  const [seanceEnCoursVisa, setSeanceEnCoursVisa] = useState<number | null>(null);
  const [seanceAContester, setSeanceAContester] = useState<Seance | null>(null);
  const [motifContestation, setMotifContestation] = useState('');
  const [erreurContestation, setErreurContestation] = useState<string | null>(null);
  const [envoiContestation, setEnvoiContestation] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [uesData, seancesData] = await Promise.all([
        api.cahierMesUes(),
        api.cahierSeances(),
      ]);
      setUes(uesData);
      setSeances(seancesData);

      const avMap = new Map<number, Avancement>();
      try {
        const avancees = await Promise.all(uesData.map((u) => api.avancementUe(u.ueId)));
        avancees.forEach((av) => avMap.set(av.ueId, av));
      } catch {
        // Droits restreints
      }
      setAvancements(avMap);
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.messages.join(' '));
      else setErreur('Impossible de charger le cahier de texte.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const nbEnAttente = useMemo(() => {
    return seances.filter((s) => s.visa.statut === 'en_attente').length;
  }, [seances]);

  const seancesFiltrees = useMemo(() => {
    return seances.filter((s) => {
      const matchUe = filtreUe === 'all' || String(s.ueId) === filtreUe;
      const matchType = filtreType === 'all' || s.type === filtreType;
      const matchVisa = filtreVisa === 'all' || s.visa.statut === filtreVisa;
      const matchSearch =
        !recherche ||
        (s.intitule && s.intitule.toLowerCase().includes(recherche.toLowerCase())) ||
        s.ueCode.toLowerCase().includes(recherche.toLowerCase()) ||
        (s.contenu && s.contenu.toLowerCase().includes(recherche.toLowerCase()));

      return matchUe && matchType && matchVisa && matchSearch;
    });
  }, [seances, filtreUe, filtreType, filtreVisa, recherche]);

  async function viserDirectement(seance: Seance) {
    const confirme = await confirmer({
      title: 'Approuver cette séance ?',
      message: `Valider le contenu de « ${seance.ueCode} » du ${seance.date}.`,
      confirmLabel: 'Confirmer le visa',
      variant: 'warning',
    });
    if (!confirme) return;
    setSeanceEnCoursVisa(seance.id);
    setMessageSucces(null);
    setErreur(null);
    try {
      const seanceVisee = await api.visaSeance(seance.id, { decision: 'vise' });
      setSeances((prev) =>
        prev.map((s) => (s.id === seance.id ? { ...s, visa: seanceVisee.visa } : s)),
      );
      setMessageSucces(`Séance « ${seance.ueCode} » du ${seance.date} visée.`);
      setTimeout(() => setMessageSucces(null), 4000);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.messages.join(' ') : 'Erreur lors du visa.');
    } finally {
      setSeanceEnCoursVisa(null);
    }
  }

  async function soumettreContestation() {
    if (!seanceAContester) return;
    if (!motifContestation.trim()) {
      setErreurContestation('Indiquez le motif de votre réserve.');
      return;
    }
    const confirme = await confirmer({
      title: 'Enregistrer cette réserve ?',
      message: `Votre commentaire sera associé à la séance « ${seanceAContester.ueCode} ».`,
      confirmLabel: 'Enregistrer',
      variant: 'warning',
    });
    if (!confirme) return;
    setEnvoiContestation(true);
    setErreurContestation(null);
    try {
      const seanceModifiee = await api.visaSeance(seanceAContester.id, {
        decision: 'conteste',
        commentaire: motifContestation.trim(),
      });
      setSeances((prev) =>
        prev.map((s) => (s.id === seanceAContester.id ? { ...s, visa: seanceModifiee.visa } : s)),
      );
      setMessageSucces(`Réserve enregistrée pour « ${seanceAContester.ueCode} ».`);
      setTimeout(() => setMessageSucces(null), 4000);
      setSeanceAContester(null);
      setMotifContestation('');
    } catch (err) {
      setErreurContestation(
        err instanceof ApiError ? err.messages.join(' ') : 'Erreur lors de la contestation.',
      );
    } finally {
      setEnvoiContestation(false);
    }
  }

  async function telechargerExport(format: 'pdf' | 'xlsx') {
    setExportEnCours(true);
    setErreur(null);
    try {
      const ueId = filtreUe === 'all' ? undefined : Number(filtreUe);
      const blob = await api.exporterCahier(format, ueId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cahier-de-texte-enp.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErreur("Impossible de générer l'export.");
    } finally {
      setExportEnCours(false);
    }
  }

  function formaterDateFr(dateIso: string) {
    try {
      const d = new Date(dateIso + 'T00:00:00');
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateIso;
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-8 animate-fade-in">
      <PageHeader
        title="Cahier de texte"
        breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Cahier de texte' }]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {peutSaisir && (
              <Link to="/cahier-texte/nouvelle">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  className="font-semibold min-h-[38px]"
                >
                  Nouvelle séance
                </Button>
              </Link>
            )}
            <div className="inline-flex border border-enp-border bg-white">
              <button
                type="button"
                disabled={exportEnCours}
                onClick={() => void telechargerExport('pdf')}
                className="px-3 py-1.5 text-xs font-semibold text-enp-blue-deep hover:bg-enp-blue-ice border-r border-enp-border transition-colors flex items-center gap-1 min-h-[38px]"
                title="Exporter en PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                disabled={exportEnCours}
                onClick={() => void telechargerExport('xlsx')}
                className="px-3 py-1.5 text-xs font-semibold text-enp-blue-deep hover:bg-enp-blue-ice transition-colors min-h-[38px]"
                title="Exporter vers Excel"
              >
                Excel
              </button>
            </div>
          </div>
        }
      />

      {messageSucces && (
        <Alert variant="success" onClose={() => setMessageSucces(null)}>
          {messageSucces}
        </Alert>
      )}

      {erreur && (
        <Alert variant="danger" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {/* Alerte compacte pour les enseignants ayant des seances a viser */}
      {peutViser && nbEnAttente > 0 && (
        <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Stamp className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="tabular-nums">
              {nbEnAttente} séance{nbEnAttente > 1 ? 's' : ''} en attente de visa
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFiltreVisa(filtreVisa === 'en_attente' ? 'all' : 'en_attente')}
            className="text-xs font-bold text-enp-blue-deep underline shrink-0"
          >
            {filtreVisa === 'en_attente' ? 'Tout afficher' : 'Filtrer'}
          </button>
        </div>
      )}

      {/* Filtres UE + Recherche + Etat dans un bloc sobre */}
      <div className="bg-white border border-enp-border divide-y divide-enp-border">
        {ues.length > 0 && (
          <div className="p-2.5 sm:p-3 flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setFiltreUe('all')}
              className={`px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors border min-h-[34px] tabular-nums ${
                filtreUe === 'all'
                  ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                  : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
              }`}
            >
              Toutes ({seances.length})
            </button>

            {ues.map((u) => {
              const estActif = String(u.ueId) === filtreUe;
              const av = avancements.get(u.ueId);
              const heuresRealisees = av
                ? av.heuresEffectuees.cm + av.heuresEffectuees.td + av.heuresEffectuees.tp
                : null;

              return (
                <button
                  key={u.ueId}
                  type="button"
                  onClick={() => setFiltreUe(String(u.ueId))}
                  className={`px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors border flex items-center gap-1.5 min-h-[34px] ${
                    estActif
                      ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                      : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
                  }`}
                >
                  <span className="font-mono">{u.code}</span>
                  {heuresRealisees !== null && (
                    <span
                      className={`text-[10px] font-mono tabular-nums ${
                        estActif ? 'text-white/80' : 'text-enp-gray-medium'
                      }`}
                    >
                      {heuresRealisees}h
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex-1 sm:max-w-xs">
            <Input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une séance..."
              startIcon={<Search className="w-4 h-4 text-enp-gray-medium" />}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setFiltreVisa('all')}
                className={`px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap min-h-[34px] ${
                  filtreVisa === 'all'
                    ? 'bg-enp-blue-primary text-white border-enp-blue-primary'
                    : 'bg-white text-enp-gray-dark border-enp-border hover:text-enp-black'
                }`}
              >
                Toutes
              </button>
              {(peutViser || peutSaisir || aRole('chef_departement') || aRole('scolarite')) && (
                <button
                  type="button"
                  onClick={() => setFiltreVisa('en_attente')}
                  className={`px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap min-h-[34px] tabular-nums ${
                    filtreVisa === 'en_attente'
                      ? 'bg-enp-blue-primary text-white border-enp-blue-primary'
                      : 'bg-white text-enp-gray-dark border-enp-border hover:text-enp-black'
                  }`}
                >
                  À viser{nbEnAttente > 0 ? ` (${nbEnAttente})` : ''}
                </button>
              )}
              <button
                type="button"
                onClick={() => setFiltreVisa('vise')}
                className={`px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap min-h-[34px] ${
                  filtreVisa === 'vise'
                    ? 'bg-enp-blue-primary text-white border-enp-blue-primary'
                    : 'bg-white text-enp-gray-dark border-enp-border hover:text-enp-black'
                }`}
              >
                Visées
              </button>
              <button
                type="button"
                onClick={() => setFiltreVisa('conteste')}
                className={`px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap min-h-[34px] ${
                  filtreVisa === 'conteste'
                    ? 'bg-enp-blue-primary text-white border-enp-blue-primary'
                    : 'bg-white text-enp-gray-dark border-enp-border hover:text-enp-black'
                }`}
              >
                Réserves
              </button>
            </div>

            <div className="w-24 shrink-0">
              <Select
                value={filtreType}
                onChange={(e) => setFiltreType(e.target.value)}
                aria-label="Type de cours"
              >
                <option value="all">Types</option>
                <option value="CM">CM</option>
                <option value="TD">TD</option>
                <option value="TP">TP</option>
                <option value="AUTRE">Autre</option>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des seances */}
      {chargement ? (
        <div className="py-10 text-center text-enp-gray-medium text-xs bg-white border border-enp-border">
          Chargement du cahier de texte...
        </div>
      ) : seancesFiltrees.length === 0 ? (
        <EmptyState
          title="Aucune séance trouvée"
          description={
            filtreVisa === 'en_attente'
              ? 'Toutes les séances ont déjà été visées.'
              : 'Aucune séance pour ce filtre.'
          }
          actionLabel={
            filtreVisa !== 'all' || filtreUe !== 'all' || recherche
              ? 'Réinitialiser'
              : undefined
          }
          onAction={() => {
            setFiltreVisa('all');
            setFiltreUe('all');
            setFiltreType('all');
            setRecherche('');
          }}
        />
      ) : (
        <div className="bg-white border border-enp-border divide-y divide-enp-border">
          {seancesFiltrees.map((s) => {
            const visaInfo = LIBELLES_VISA[s.visa.statut] ?? {
              label: s.visa.statut,
              variant: 'neutral' as const,
            };
            const estEnAttente = s.visa.statut === 'en_attente';
            const enCoursSurCetteSeance = seanceEnCoursVisa === s.id;

            return (
              <article key={s.id} className="p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-[11px] text-enp-gray-medium tabular-nums">
                    <span className="font-bold text-enp-blue-primary">{s.ueCode}</span>
                    {' · '}
                    {s.type}
                    {' · '}
                    {formaterDateFr(s.date)} ({s.debut}-{s.fin})
                  </p>
                  <Badge variant={visaInfo.variant} size="sm" className="shrink-0">
                    {visaInfo.label}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-enp-black">
                    {s.intitule || 'Séance sans titre'}
                  </h3>
                  {s.contenu && (
                    <p className="text-xs sm:text-sm text-enp-gray-dark leading-relaxed">
                      {s.contenu}
                    </p>
                  )}
                </div>

                {s.travailAFaire && (
                  <div className="p-2.5 bg-enp-bg border border-enp-border/70 text-xs flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-enp-blue-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-semibold text-enp-blue-deep">À faire : </span>
                      <span className="text-enp-black">{s.travailAFaire}</span>
                    </div>
                  </div>
                )}

                {s.visa.statut === 'conteste' && s.visa.commentaire && (
                  <div className="p-2.5 bg-enp-red-light border border-enp-red-error/25 text-xs text-enp-red-error flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Réserve : </span>
                      <span>{s.visa.commentaire}</span>
                    </div>
                  </div>
                )}

                <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] text-enp-gray-medium">
                    {s.visa.statut === 'vise' && s.visa.date && (
                      <span className="text-enp-green-valid inline-flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        Visée le {new Date(s.visa.date).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {peutViser && estEnAttente && (
                      <>
                        <button
                          type="button"
                          disabled={enCoursSurCetteSeance}
                          onClick={() => void viserDirectement(s)}
                          className="px-3 py-1.5 bg-enp-green-valid hover:bg-enp-teal-dark text-white text-xs font-semibold transition-colors inline-flex items-center gap-1 disabled:opacity-50 min-h-[34px]"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{enCoursSurCetteSeance ? 'Validation...' : 'Viser'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={enCoursSurCetteSeance}
                          onClick={() => {
                            setSeanceAContester(s);
                            setMotifContestation('');
                            setErreurContestation(null);
                          }}
                          className="px-2.5 py-1.5 bg-white border border-enp-border hover:border-enp-red-error text-enp-red-error text-xs font-semibold transition-colors inline-flex items-center gap-1 min-h-[34px]"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Réserve</span>
                        </button>
                      </>
                    )}

                    <Link
                      to={`/cahier-texte/${s.id}`}
                      className="px-2.5 py-1.5 bg-white border border-enp-border hover:bg-enp-blue-ice/40 text-enp-black text-xs font-medium transition-colors inline-flex items-center gap-1 min-h-[34px]"
                    >
                      <span>Détails</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modale de reserve */}
      <Modal
        isOpen={Boolean(seanceAContester)}
        onClose={() => setSeanceAContester(null)}
        title="Émettre une réserve"
        subtitle={
          seanceAContester
            ? `${seanceAContester.ueCode} · ${formaterDateFr(seanceAContester.date)} (${seanceAContester.debut}-${seanceAContester.fin})`
            : undefined
        }
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              disabled={envoiContestation}
              onClick={() => setSeanceAContester(null)}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={envoiContestation}
              onClick={() => void soumettreContestation()}
            >
              Enregistrer
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-left">
          <p className="text-xs text-enp-gray-medium leading-relaxed">
            Indiquez le motif de la réserve (horaires, cours reporté ou contenu à corriger).
          </p>

          <textarea
            rows={3}
            value={motifContestation}
            onChange={(e) => setMotifContestation(e.target.value)}
            placeholder="Ex : Le cours a duré 1h30 au lieu de 2h..."
            className="w-full text-xs p-2.5 border border-enp-border focus:border-enp-blue-primary focus:outline-none"
            autoFocus
          />

          {erreurContestation && (
            <p className="text-xs text-enp-red-error font-medium">{erreurContestation}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
