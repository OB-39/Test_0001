import { useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircle, EyeOff, MessageSquare, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/api';
import type { CampagneCommentaire, CommentaireAModerer } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useConfirmation } from '@/components/useConfirmation';
import { PageHeader, Button, Alert, Badge } from '@/components/ui';

const STATUT_TABS: { valeur: string; libelle: string }[] = [
  { valeur: 'a_moderer', libelle: 'À modérer' },
  { valeur: 'valide', libelle: 'Validés' },
  { valeur: 'masque', libelle: 'Masqués' },
  { valeur: '', libelle: 'Tous' },
];

function melanger<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function ScolariteModeration() {
  const { confirmer } = useConfirmation();
  const { aRole } = useAuth();
  const lectureSeule = aRole('directeur_campus') || aRole('directeur_general');
  const [campagnes, setCampagnes] = useState<CampagneCommentaire[]>([]);
  const [campagneId, setCampagneId] = useState<number | ''>('');
  const [statut, setStatut] = useState<string>(lectureSeule ? '' : 'a_moderer');
  const [commentaires, setCommentaires] = useState<CommentaireAModerer[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCoursId, setEnCoursId] = useState<string | number | null>(null);
  const ordreSessionRef = useRef<(string | number)[] | null>(null);

  const chargerCampagnes = useCallback(async () => {
    setErreur(null);
    try {
      const disponibles = await api.moderationCampagnes();
      setCampagnes(disponibles);
      setCampagneId((precedent) =>
        disponibles.some((c) => c.id === precedent) ? precedent : disponibles[0]?.id ?? '',
      );
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.messages.join(' '));
      else setErreur('Erreur réseau lors du chargement des campagnes.');
    }
  }, []);

  const chargerCommentaires = useCallback(async () => {
    if (campagneId === '') {
      setCommentaires([]);
      setChargement(false);
      setErreur(null);
      return;
    }
    setChargement(true);
    setErreur(null);
    try {
      const cs = await api.scolariteCommentaires(campagneId, statut || undefined);
      if (!ordreSessionRef.current || cs.length !== ordreSessionRef.current.length) {
        ordreSessionRef.current = melanger(cs.map((c) => c.id));
      }
      const ids = ordreSessionRef.current;
      const tries = ids
        .map((id) => cs.find((c) => c.id === id))
        .filter((c): c is CommentaireAModerer => !!c);
      setCommentaires(tries);
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.messages.join(' '));
      else setErreur('Erreur réseau.');
    } finally {
      setChargement(false);
    }
  }, [campagneId, statut]);

  useEffect(() => {
    void chargerCampagnes();
  }, [chargerCampagnes]);

  useEffect(() => {
    ordreSessionRef.current = null;
    void chargerCommentaires();
  }, [chargerCommentaires]);

  async function moderer(id: string | number, decision: 'valide' | 'masque') {
    const confirme = await confirmer({
      title: decision === 'valide' ? 'Valider ce commentaire ?' : 'Masquer ce commentaire ?',
      message:
        decision === 'valide'
          ? 'Le commentaire anonyme sera transmis aux enseignants concernés avec la restitution.'
          : 'Le commentaire sera masqué et ne sera pas transmis aux enseignants. Cette action est conservée dans la modération.',
      confirmLabel: decision === 'valide' ? 'Valider le commentaire' : 'Masquer le commentaire',
      variant: decision === 'valide' ? 'warning' : 'danger',
    });
    if (!confirme) return;
    setEnCoursId(id);
    try {
      const c = await api.scolariteModererCommentaire(id, { statut: decision });
      setCommentaires((prev) =>
        statut === 'a_moderer'
          ? prev.filter((x) => x.id !== c.id)
          : prev.map((x) => (x.id === c.id ? c : x)),
      );
    } catch (err) {
      setErreur(
        err instanceof ApiError ? err.messages.join(' ') : 'Erreur réseau lors de la modération.',
      );
    } finally {
      setEnCoursId(null);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5 max-w-5xl mx-auto animate-fade-in pb-6">
      <PageHeader
        title={lectureSeule ? 'Commentaires des campagnes' : 'Modération des avis'}
        description={
          lectureSeule
            ? 'Consultation en lecture seule des commentaires qualitatifs.'
            : 'Validez ou masquez tout avis identifiant ou inapproprié avant restitution.'
        }
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: lectureSeule ? 'Commentaires' : 'Modération' },
        ]}
      />

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {/* BARRE DE FILTRES */}
      <div className="bg-white border border-enp-border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 -mx-1 px-1">
          {STATUT_TABS.map((t) => (
            <button
              key={t.valeur || 'tous'}
              type="button"
              onClick={() => setStatut(t.valeur)}
              className={`px-3 py-2 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
                statut === t.valeur
                  ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                  : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
              }`}
            >
              {t.libelle}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <label htmlFor="campagne-mod" className="sr-only">
            Campagne
          </label>
          <select
            id="campagne-mod"
            value={campagneId}
            onChange={(e) => setCampagneId(e.target.value ? Number(e.target.value) : '')}
            className="w-full sm:w-auto sm:max-w-[260px] border border-enp-border px-3 py-2 text-xs sm:text-sm font-medium text-enp-black bg-white focus:border-enp-blue-primary outline-none min-h-[40px]"
          >
            {campagnes.length === 0 && <option value="">Aucune campagne</option>}
            {campagnes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!chargement && !erreur && campagnes.length === 0 ? (
        <div className="bg-white border border-enp-border p-10 text-center space-y-2">
          <ShieldCheck className="w-8 h-8 text-enp-gray-medium mx-auto opacity-40" />
          <p className="text-sm font-semibold text-enp-blue-deep">Aucune campagne à modérer</p>
          <p className="text-xs text-enp-gray-medium">
            La modération s’ouvre après la clôture d’une campagne d’évaluation.
          </p>
        </div>
      ) : chargement ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Chargement des commentaires…
        </div>
      ) : commentaires.length === 0 ? (
        <div className="bg-white border border-enp-border p-10 text-center space-y-2">
          <MessageSquare className="w-8 h-8 text-enp-green-valid mx-auto opacity-60" />
          <p className="text-sm font-semibold text-enp-blue-deep">Aucun commentaire dans cette vue</p>
          <p className="text-xs text-enp-gray-medium">
            {statut === 'a_moderer'
              ? 'Tous les commentaires de cette campagne ont été traités.'
              : 'Aucun commentaire ne correspond au filtre sélectionné.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-enp-border divide-y divide-enp-border">
          {commentaires.map((c) => (
            <article
              key={c.id}
              className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3.5"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-enp-gray-medium flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="font-mono font-semibold text-enp-blue-deep">
                        {c.ueCode}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-enp-black truncate">
                        {c.ueIntitule}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          c.type === 'points_forts'
                            ? 'text-enp-green-valid font-medium'
                            : 'text-amber-700 font-medium'
                        }
                      >
                        {c.type === 'points_forts' ? 'Points forts' : 'Axes à améliorer'}
                      </span>
                    </p>
                  </div>
                  <Badge
                    variant={
                      c.statut === 'a_moderer'
                        ? 'outline'
                        : c.statut === 'valide'
                          ? 'primary'
                          : 'danger'
                    }
                    className="shrink-0"
                  >
                    {c.statut === 'a_moderer'
                      ? 'À modérer'
                      : c.statut === 'valide'
                        ? 'Validé'
                        : 'Masqué'}
                  </Badge>
                </div>

                <p className="text-sm text-enp-black leading-relaxed bg-enp-bg/60 border border-enp-border/70 px-3.5 py-2.5">
                  {c.texte}
                </p>
              </div>

              {!lectureSeule && (
                <div className="flex sm:flex-col gap-2 shrink-0 sm:pt-5">
                  {c.statut !== 'valide' && (
                    <Button
                      type="button"
                      variant="success"
                      size="sm"
                      className="flex-1 sm:flex-initial min-h-[40px]"
                      disabled={enCoursId === c.id}
                      isLoading={enCoursId === c.id}
                      leftIcon={<CheckCircle className="w-4 h-4" />}
                      onClick={() => void moderer(c.id, 'valide')}
                    >
                      Valider
                    </Button>
                  )}
                  {c.statut !== 'masque' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-initial min-h-[40px]"
                      disabled={enCoursId === c.id}
                      leftIcon={<EyeOff className="w-4 h-4 text-enp-red-error" />}
                      onClick={() => void moderer(c.id, 'masque')}
                    >
                      Masquer
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
