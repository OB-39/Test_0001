import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Megaphone,
  PlusCircle,
  QrCode,
  ScrollText,
  ShieldCheck,
  Stamp,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui';
import { api } from '@/api';
import type { Role, Seance, TableauDeBordScolarite, UeAEvaluer } from '@/api/types';

const ROLE_LABELS: Record<Role, string> = {
  etudiant: 'Étudiant',
  delegue: 'Délégué de cours',
  enseignant: 'Enseignant',
  chef_departement: 'Chef de département',
  scolarite: 'Scolarité',
  directeur_campus: 'Direction de campus',
  directeur_general: 'Direction générale',
  admin: 'Administration système',
};

interface RaccourciCardProps {
  title: string;
  caption: string;
  icon: ReactNode;
  onClick: () => void;
  metric?: string;
}

function RaccourciCard({ title, caption, icon, onClick, metric }: RaccourciCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-white border border-enp-border p-3.5 sm:p-4 transition-colors hover:border-enp-blue-primary/60 hover:bg-enp-blue-ice/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-enp-blue-primary min-h-[84px] flex flex-col justify-between"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-enp-blue-primary">{icon}</span>
        {metric ? (
          <span className="text-xs font-bold font-mono tabular-nums text-enp-blue-deep">
            {metric}
          </span>
        ) : (
          <ArrowRight className="w-3.5 h-3.5 text-enp-gray-medium opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="mt-2.5 min-w-0">
        <div className="text-sm font-bold text-enp-blue-deep truncate">{title}</div>
        <p className="text-[11px] text-enp-gray-medium truncate mt-0.5">{caption}</p>
      </div>
    </button>
  );
}

export function Accueil() {
  const { utilisateur } = useAuth();
  const navigate = useNavigate();

  const [uesEtudiant, setUesEtudiant] = useState<UeAEvaluer[]>([]);
  const [seancesAttente, setSeancesAttente] = useState<Seance[]>([]);
  const [tbScolarite, setTbScolarite] = useState<TableauDeBordScolarite | null>(null);

  const role = utilisateur?.activeRole;

  useEffect(() => {
    let actif = true;
    async function chargerDonneesRole() {
      if (!role) return;
      try {
        if (role === 'etudiant' || role === 'delegue') {
          const ues = await api.listeEvaluations();
          if (actif) setUesEtudiant(ues);
        } else if (role === 'enseignant') {
          const seances = await api.cahierSeances(undefined, 'en_attente');
          if (actif) setSeancesAttente(seances);
        } else if (role === 'scolarite') {
          const tb = await api.scolariteTableauDeBord();
          if (actif) setTbScolarite(tb);
        }
      } catch {
        // Mode silencieux si API non joignable
      }
    }
    void chargerDonneesRole();
    return () => {
      actif = false;
    };
  }, [role]);

  if (!utilisateur || !role) return null;

  const uesAFaire = uesEtudiant.filter((u) => u.etat === 'a_faire');
  const uesTerminees = uesEtudiant.filter((u) => u.etat === 'terminee');
  const totalUes = uesEtudiant.length;
  const tauxCompletion = totalUes > 0 ? Math.round((uesTerminees.length / totalUes) * 100) : 100;

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in max-w-6xl mx-auto pb-4">
      {/* Salutation sobre */}
      <header className="flex items-baseline justify-between gap-2 pb-1">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-enp-blue-deep tracking-tight truncate">
            Bonjour, {utilisateur.prenom}
          </h1>
          <p className="text-xs text-enp-gray-medium mt-0.5">
            {ROLE_LABELS[role]} · 2026-2027
          </p>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 1. ÉTUDIANT                                              */}
      {/* ======================================================== */}
      {role === 'etudiant' && (
        <div className="space-y-4">
          <section className="bg-white border border-enp-border p-4 sm:p-5 space-y-3.5">
            {uesAFaire.length > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-enp-gray-medium">
                      Campagne d'évaluation anonyme
                    </p>
                    <h2 className="text-xl sm:text-2xl font-bold text-enp-blue-deep tabular-nums mt-0.5">
                      {uesAFaire.length} UE à évaluer
                    </h2>
                  </div>
                  <span className="text-xs font-bold font-mono tabular-nums text-enp-blue-deep">
                    {uesTerminees.length}/{totalUes} ({tauxCompletion}%)
                  </span>
                </div>

                <div className="w-full bg-enp-blue-ice h-1.5 overflow-hidden">
                  <div
                    className="bg-enp-blue-primary h-full transition-all duration-300"
                    style={{ width: `${tauxCompletion}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-enp-green-valid shrink-0" />
                <div>
                  <h2 className="text-base font-bold text-enp-blue-deep">
                    Évaluations à jour
                  </h2>
                  <p className="text-xs text-enp-gray-medium">
                    Toutes vos unités d'enseignement sont évaluées.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
              {uesAFaire.length > 0 && (
                <Button
                  onClick={() => navigate('/evaluations')}
                  variant="primary"
                  size="md"
                  leftIcon={<ClipboardCheck className="w-4 h-4" />}
                  className="w-full sm:w-auto justify-center min-h-[44px]"
                >
                  Évaluer mes UE
                </Button>
              )}
              <Button
                onClick={() => navigate('/mes-presences?scan=1')}
                variant={uesAFaire.length > 0 ? 'outline' : 'primary'}
                size="md"
                leftIcon={<Camera className="w-4 h-4" />}
                className="w-full sm:w-auto justify-center min-h-[44px]"
              >
                Scanner ma présence
              </Button>
            </div>
          </section>

          <section aria-label="Accès rapide" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            <RaccourciCard
              title="Mes présences"
              caption="Assiduité et justificatifs"
              icon={<CalendarCheck className="w-4 h-4" />}
              onClick={() => navigate('/mes-presences')}
            />
            <RaccourciCard
              title="Mes notes"
              caption="Devoirs et moyennes"
              icon={<GraduationCap className="w-4 h-4" />}
              onClick={() => navigate('/mes-notes')}
            />
            <RaccourciCard
              title="Cahier de texte"
              caption="Séances et travaux"
              icon={<BookOpen className="w-4 h-4" />}
              onClick={() => navigate('/cahier-texte')}
            />
            <RaccourciCard
              title="Restitution"
              caption="Bilans semestriels"
              icon={<FileText className="w-4 h-4" />}
              onClick={() => navigate('/restitution')}
            />
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. DÉLÉGUÉ                                               */}
      {/* ======================================================== */}
      {role === 'delegue' && (
        <div className="space-y-4">
          <section className="bg-white border border-enp-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-enp-blue-deep">
                Cahier de texte de la promotion
              </h2>
              <p className="text-xs text-enp-gray-medium mt-0.5">
                Enregistrez les séances dispensées pour visa enseignant sous 72 h.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                onClick={() => navigate('/cahier-texte/nouvelle')}
                variant="primary"
                size="md"
                leftIcon={<PlusCircle className="w-4 h-4" />}
                className="w-full sm:w-auto justify-center min-h-[44px]"
              >
                Nouvelle séance
              </Button>
              <Button
                onClick={() => navigate('/mes-presences?scan=1')}
                variant="outline"
                size="md"
                leftIcon={<Camera className="w-4 h-4" />}
                className="w-full sm:w-auto justify-center min-h-[44px]"
              >
                Scanner QR
              </Button>
            </div>
          </section>

          <section aria-label="Accès rapide" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            <RaccourciCard
              title="Cahier de texte"
              caption="Historique et visas"
              icon={<BookOpen className="w-4 h-4" />}
              onClick={() => navigate('/cahier-texte')}
            />
            <RaccourciCard
              title="Évaluations"
              caption="Campagne anonyme"
              metric={uesAFaire.length > 0 ? `${uesAFaire.length} UE` : undefined}
              icon={<ClipboardCheck className="w-4 h-4" />}
              onClick={() => navigate('/evaluations')}
            />
            <RaccourciCard
              title="Mes notes"
              caption="Relevé individuel"
              icon={<GraduationCap className="w-4 h-4" />}
              onClick={() => navigate('/mes-notes')}
            />
            <RaccourciCard
              title="Mes présences"
              caption="Assiduité et justificatifs"
              icon={<CalendarCheck className="w-4 h-4" />}
              onClick={() => navigate('/mes-presences')}
            />
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. ENSEIGNANT                                            */}
      {/* ======================================================== */}
      {role === 'enseignant' && (
        <div className="space-y-4">
          <section className="bg-white border border-enp-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div>
              {seancesAttente.length > 0 ? (
                <>
                  <h2 className="text-base sm:text-lg font-bold text-enp-blue-deep tabular-nums">
                    {seancesAttente.length} séance{seancesAttente.length > 1 ? 's' : ''} en attente de visa
                  </h2>
                  <p className="text-xs text-enp-gray-medium mt-0.5">
                    Validez-les directement dans le cahier de texte ou lancez l'appel de votre cours.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-base sm:text-lg font-bold text-enp-blue-deep">
                    Toutes vos séances sont visées
                  </h2>
                  <p className="text-xs text-enp-gray-medium mt-0.5">
                    Lancez un émargement par QR code ou saisissez vos notes de devoir.
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                onClick={() => navigate('/enseignant/presences')}
                variant="primary"
                size="md"
                leftIcon={<QrCode className="w-4 h-4" />}
                className="w-full sm:w-auto justify-center min-h-[44px]"
              >
                Appel & QR Code
              </Button>
              {seancesAttente.length > 0 && (
                <Button
                  onClick={() => navigate('/cahier-texte')}
                  variant="outline"
                  size="md"
                  leftIcon={<Stamp className="w-4 h-4" />}
                  className="w-full sm:w-auto justify-center min-h-[44px]"
                >
                  Viser ({seancesAttente.length})
                </Button>
              )}
            </div>
          </section>

          <section aria-label="Accès rapide" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            <RaccourciCard
              title="Cahier de texte"
              caption="Séances et visas"
              metric={seancesAttente.length > 0 ? `${seancesAttente.length} à viser` : 'À jour'}
              icon={<BookOpen className="w-4 h-4" />}
              onClick={() => navigate('/cahier-texte')}
            />
            <RaccourciCard
              title="Saisie des notes"
              caption="Devoirs et barèmes"
              icon={<ClipboardCheck className="w-4 h-4" />}
              onClick={() => navigate('/enseignant/notes')}
            />
            <RaccourciCard
              title="Présences"
              caption="Feuilles et justificatifs"
              icon={<CalendarCheck className="w-4 h-4" />}
              onClick={() => navigate('/enseignant/presences')}
            />
            <RaccourciCard
              title="Résultats UE"
              caption="Évaluations anonymes"
              icon={<BarChart3 className="w-4 h-4" />}
              onClick={() => navigate('/resultats')}
            />
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. CHEF DE DÉPARTEMENT                                   */}
      {/* ======================================================== */}
      {role === 'chef_departement' && (
        <div className="space-y-4">
          <section className="bg-white border border-enp-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-enp-blue-deep">
                Suivi pédagogique du département
              </h2>
              <p className="text-xs text-enp-gray-medium mt-0.5">
                Participation en direct, synthèses par UE et avancement horaire.
              </p>
            </div>
            <Button
              onClick={() => navigate('/participation')}
              variant="primary"
              size="md"
              leftIcon={<Users className="w-4 h-4" />}
              className="w-full sm:w-auto justify-center min-h-[44px]"
            >
              Participation en direct
            </Button>
          </section>

          <section aria-label="Accès rapide" className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
            <RaccourciCard
              title="Synthèse"
              caption="Plans d'actions et bilans"
              icon={<Award className="w-4 h-4" />}
              onClick={() => navigate('/synthese')}
            />
            <RaccourciCard
              title="Résultats UE"
              caption="Détails par enseignement"
              icon={<BarChart3 className="w-4 h-4" />}
              onClick={() => navigate('/resultats')}
            />
            <RaccourciCard
              title="Cahier de texte"
              caption="Avancement horaire"
              icon={<BookOpen className="w-4 h-4" />}
              onClick={() => navigate('/cahier-texte')}
            />
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. SCOLARITÉ                                             */}
      {/* ======================================================== */}
      {role === 'scolarite' && (
        <div className="space-y-4">
          <section className="bg-white border border-enp-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-enp-blue-deep tabular-nums">
                {tbScolarite?.commentairesAModerer ?? 0} avis à modérer
              </h2>
              <p className="text-xs text-enp-gray-medium mt-0.5 tabular-nums">
                {tbScolarite?.campagnesOuvertes ?? 1} campagne ouverte ·{' '}
                {tbScolarite?.comptesSansMotDePasse ?? 12} comptes à activer
              </p>
            </div>
            <Button
              onClick={() => navigate('/scolarite/moderation')}
              variant="primary"
              size="md"
              leftIcon={<ShieldCheck className="w-4 h-4" />}
              className="w-full sm:w-auto justify-center min-h-[44px]"
            >
              Modérer les avis
            </Button>
          </section>

          <section aria-label="Accès rapide" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            <RaccourciCard
              title="Campagnes"
              caption="Ouverture et clôture"
              metric={String(tbScolarite?.campagnesOuvertes ?? 1)}
              icon={<Megaphone className="w-4 h-4" />}
              onClick={() => navigate('/scolarite/campagnes')}
            />
            <RaccourciCard
              title="Comptes"
              caption="Activation et accès"
              metric={String(tbScolarite?.comptesSansMotDePasse ?? 12)}
              icon={<Users className="w-4 h-4" />}
              onClick={() => navigate('/scolarite/comptes')}
            />
            <RaccourciCard
              title="Imports CSV"
              caption="Étudiants et inscriptions"
              icon={<Upload className="w-4 h-4" />}
              onClick={() => navigate('/scolarite/imports')}
            />
            <RaccourciCard
              title="Restitution"
              caption="Bilans Article 77"
              icon={<FileText className="w-4 h-4" />}
              onClick={() => navigate('/scolarite/restitution')}
            />
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. DIRECTIONS (CAMPUS & GÉNÉRALE)                        */}
      {/* ======================================================== */}
      {(role === 'directeur_campus' || role === 'directeur_general') && (
        <div className="space-y-4">
          <section className="bg-white border border-enp-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-enp-blue-deep tabular-nums">
                {role === 'directeur_general'
                  ? 'Participation consolidée : 78,4 %'
                  : 'Indicateurs de votre campus'}
              </h2>
              <p className="text-xs text-enp-gray-medium mt-0.5">
                {role === 'directeur_general'
                  ? 'Supervision de tous les campus ENP'
                  : 'Suivi qualité et conformité du campus'}
              </p>
            </div>
            <Button
              onClick={() => navigate('/direction/statistiques')}
              variant="primary"
              size="md"
              leftIcon={<Activity className="w-4 h-4" />}
              className="w-full sm:w-auto justify-center min-h-[44px]"
            >
              Statistiques
            </Button>
          </section>

          <section aria-label="Accès rapide" className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
            <RaccourciCard
              title="Contrôles"
              caption="Conformité référentiels"
              icon={<ShieldCheck className="w-4 h-4" />}
              onClick={() => navigate('/direction/controles')}
            />
            <RaccourciCard
              title="Résultats UE"
              caption="Synthèses pédagogiques"
              icon={<BarChart3 className="w-4 h-4" />}
              onClick={() => navigate('/resultats')}
            />
            <RaccourciCard
              title="Commentaires"
              caption="Avis modérés"
              icon={<FileText className="w-4 h-4" />}
              onClick={() => navigate('/direction/commentaires')}
            />
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. ADMIN                                                 */}
      {/* ======================================================== */}
      {role === 'admin' && (
        <div className="space-y-4">
          <section className="bg-white border border-enp-border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-enp-blue-deep">
                Configuration de la plateforme
              </h2>
              <p className="text-xs text-enp-gray-medium mt-0.5">
                Référentiels, comptes, archives annuelles et journal d'audit.
              </p>
            </div>
            <Button
              onClick={() => navigate('/administration')}
              variant="primary"
              size="md"
              leftIcon={<Building2 className="w-4 h-4" />}
              className="w-full sm:w-auto justify-center min-h-[44px]"
            >
              Référentiels
            </Button>
          </section>

          <section aria-label="Accès rapide" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
            <RaccourciCard
              title="Comptes"
              caption="Rôles et activations"
              icon={<Users className="w-4 h-4" />}
              onClick={() => navigate('/scolarite/comptes')}
            />
            <RaccourciCard
              title="Imports CSV"
              caption="Données académiques"
              icon={<Upload className="w-4 h-4" />}
              onClick={() => navigate('/scolarite/imports')}
            />
            <RaccourciCard
              title="Archives"
              caption="Clôture annuelle"
              icon={<Archive className="w-4 h-4" />}
              onClick={() => navigate('/archives-annuelles')}
            />
            <RaccourciCard
              title="Journal d'audit"
              caption="Traçabilité système"
              icon={<ScrollText className="w-4 h-4" />}
              onClick={() => navigate('/journal-audit')}
            />
          </section>
        </div>
      )}
    </div>
  );
}
