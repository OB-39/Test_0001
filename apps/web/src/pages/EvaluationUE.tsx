import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Send,
  CheckCircle2,
  Check,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import type { JetonVote, Note, Questionnaire, UeAEvaluer } from '@/api/types';
import {
  chargerBrouillon,
  sauvegarderBrouillon,
  effacerBrouillon,
  type BrouillonEvaluation,
} from '@/evaluation/brouillon';
import {
  Button,
  Alert,
  PageHeader,
  Stepper,
  Textarea,
} from '@/components/ui';

const OPTIONS_NOTATION: { valeur: Note; libelle: string; code: string }[] = [
  { valeur: 1, libelle: "Pas d'accord", code: '1' },
  { valeur: 2, libelle: 'Insuffisant', code: '2' },
  { valeur: 3, libelle: 'Moyen', code: '3' },
  { valeur: 4, libelle: 'Satisfaisant', code: '4' },
  { valeur: 5, libelle: 'Très bien', code: '5' },
  { valeur: null, libelle: 'Sans avis', code: 'N/A' },
];

const MAX_COMMENTAIRE = 2000;

type Phase =
  | 'chargement'
  | 'erreur-chargement'
  | 'section'
  | 'finalisation'
  | 'remerciement';

export function EvaluationUE() {
  const { ueId } = useParams<{ ueId: string }>();
  const [params] = useSearchParams();

  const [phase, setPhase] = useState<Phase>('chargement');
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [ue, setUe] = useState<UeAEvaluer | null>(null);
  const [campagneId, setCampagneId] = useState<number>(Number(params.get('campagne')) || 0);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [jeton, setJeton] = useState<JetonVote | null>(null);
  const [indexSection, setIndexSection] = useState(0);
  const [reponses, setReponses] = useState<Record<number, Note>>({});
  const [pointsForts, setPointsForts] = useState('');
  const [pointsAAmeliorer, setPointsAAmeliorer] = useState('');
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [dernierEnregistrement, setDernierEnregistrement] = useState<string | null>(null);
  const [confirmerEnvoi, setConfirmerEnvoi] = useState(false);

  const ueIdNum = Number(ueId);

  const sauvegarder = useCallback(
    (etape: number, rep: Record<number, Note>, pf: string, pa: string, j: JetonVote | null, campId: number) => {
      if (!j || !campId) return;
      const brouillon: BrouillonEvaluation = {
        jeton: j,
        reponses: rep,
        pointsForts: pf,
        pointsAAmeliorer: pa,
        etape,
      };
      sauvegarderBrouillon(ueIdNum, campId, brouillon);
      setDernierEnregistrement(
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      );
    },
    [ueIdNum],
  );

  const initialiser = useCallback(async () => {
    if (!ueId || Number.isNaN(ueIdNum)) {
      setErreurChargement("Identifiant d'UE invalide dans l'adresse.");
      setPhase('erreur-chargement');
      return;
    }

    try {
      const ues = await api.listeEvaluations();
      const trouve = ues.find((u) => u.ueId === ueIdNum);
      if (!trouve) {
        setErreurChargement("Cette unité d'enseignement n'est pas ouverte à votre évaluation.");
        setPhase('erreur-chargement');
        return;
      }
      setUe(trouve);
      const activeCampagneId = trouve.campagneId;
      setCampagneId(activeCampagneId);

      if (trouve.etat === 'terminee') {
        setPhase('remerciement');
        return;
      }

      const brouillon = chargerBrouillon(ueIdNum, activeCampagneId);
      if (brouillon) {
        setJeton(brouillon.jeton);
        setReponses(brouillon.reponses);
        setPointsForts(brouillon.pointsForts);
        setPointsAAmeliorer(brouillon.pointsAAmeliorer);
        setIndexSection(brouillon.etape);

        const q = await api.questionnaire(activeCampagneId);
        setQuestionnaire(q);
        setPhase('section');
        setDernierEnregistrement('Brouillon restauré');
        return;
      }

      // Démarrage direct sans écran intermédiaire superflu
      const [j, q] = await Promise.all([
        api.obtenirJeton(ueIdNum, activeCampagneId),
        api.questionnaire(activeCampagneId),
      ]);
      setJeton(j);
      setQuestionnaire(q);
      setIndexSection(0);
      sauvegarder(0, {}, '', '', j, activeCampagneId);
      setPhase('section');
    } catch (err) {
      setErreurChargement(
        err instanceof ApiError
          ? err.messages.join(' ')
          : "Erreur de communication : impossible d'initialiser l'évaluation.",
      );
      setPhase('erreur-chargement');
    }
  }, [ueId, ueIdNum, sauvegarder]);

  useEffect(() => {
    void initialiser();
  }, [initialiser]);

  useEffect(() => {
    if (jeton && (phase === 'section' || phase === 'finalisation')) {
      sauvegarder(indexSection, reponses, pointsForts, pointsAAmeliorer, jeton, campagneId);
    }
  }, [reponses, indexSection, jeton, phase, pointsForts, pointsAAmeliorer, campagneId, sauvegarder]);

  function setNote(critereId: number, valeur: Note) {
    setReponses((prev) => ({ ...prev, [critereId]: valeur }));
  }

  function sectionEstComplete(idx: number): boolean {
    if (!questionnaire) return false;
    const s = questionnaire.sections[idx];
    if (!s) return false;
    return s.criteres.every((c) => c.id in reponses && reponses[c.id] !== undefined);
  }

  async function executerEnvoiFinal() {
    if (!jeton || !questionnaire) return;
    setEnCours(true);
    setErreurAction(null);
    try {
      const reponsesTab = questionnaire.sections.flatMap((s) =>
        s.criteres.map((c) => ({
          critereId: c.id,
          valeur: reponses[c.id] ?? null,
        })),
      );

      await api.envoyerBulletin({
        jeton: jeton.jeton,
        reponses: reponsesTab,
        pointsForts: pointsForts.trim() || undefined,
        pointsAAmeliorer: pointsAAmeliorer.trim() || undefined,
      });

      effacerBrouillon(ueIdNum, campagneId);
      setConfirmerEnvoi(false);
      setPhase('remerciement');
    } catch (err) {
      if (err instanceof ApiError) {
        setErreurAction(err.messages.join(' '));
      } else {
        setErreurAction("Échec de transmission vers l'urne. Votre brouillon reste conservé.");
      }
    } finally {
      setEnCours(false);
    }
  }

  if (phase === 'chargement') {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center space-y-3">
        <div className="w-7 h-7 border-2 border-enp-border border-t-enp-blue-primary animate-spin mx-auto" />
        <p className="text-sm text-enp-gray-medium">Ouverture sécurisée du bulletin anonyme…</p>
      </div>
    );
  }

  if (phase === 'erreur-chargement') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Alert variant="danger" title="Accès non autorisé ou UE indisponible">
          {erreurChargement}
        </Alert>
        <Link to="/evaluations">
          <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Retourner à la liste de mes UE
          </Button>
        </Link>
      </div>
    );
  }

  if (phase === 'remerciement') {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6 text-center animate-fade-in">
        <div className="w-16 h-16 bg-enp-green-light border border-enp-green-valid mx-auto flex items-center justify-center text-enp-green-valid">
          <CheckCircle2 className="w-10 h-10 stroke-[2]" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-enp-green-valid">
            Participation enregistrée
          </span>
          <h1 className="text-2xl font-bold font-serif text-enp-blue-deep">
            Votre bulletin anonyme a été déposé avec succès
          </h1>
          <p className="text-xs sm:text-sm text-enp-gray-medium max-w-md mx-auto leading-relaxed">
            Merci pour votre contribution à la qualité pédagogique de l'École Nationale Polytechnique.
            Votre vote a été intégré à l'urne numérique scellée.
          </p>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/evaluations" className="w-full sm:w-auto">
            <Button variant="primary" size="md" className="w-full sm:w-auto font-bold">
              Continuer mes évaluations
            </Button>
          </Link>
          <Link to="/" className="w-full sm:w-auto">
            <Button variant="outline" size="md" className="w-full sm:w-auto font-semibold">
              Retour à l'accueil
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!questionnaire) return null;

  const totalSections = questionnaire.sections.length;
  const totalCriteres = questionnaire.sections.reduce((acc, s) => acc + s.criteres.length, 0);
  const nbRepondu = Object.keys(reponses).length;

  const steps = [
    ...questionnaire.sections.map((s, idx) => ({
      id: s.code,
      title: `Section ${s.code}`,
      subtitle: s.titre,
      isCompleted: sectionEstComplete(idx),
    })),
    {
      id: 'finalisation',
      title: 'Avis & Envoi',
      subtitle: 'Dépôt du bulletin',
      isCompleted: false,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fade-in pb-6">
      <div className="flex items-center justify-between gap-2 text-xs">
        <Link
          to="/evaluations"
          className="inline-flex items-center gap-1.5 text-enp-blue-primary hover:text-enp-blue-deep font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux UE
        </Link>

        <span className="text-[11px] text-enp-gray-medium flex items-center gap-1.5">
          <span>Scrutin anonyme</span>
          {dernierEnregistrement && (
            <>
              <span>·</span>
              <span className="text-enp-green-valid inline-flex items-center gap-0.5 font-medium">
                <Check className="w-3 h-3 stroke-[3]" />
                {dernierEnregistrement}
              </span>
            </>
          )}
        </span>
      </div>

      <PageHeader
        title={`${ue?.code} · ${ue?.intitule}`}
        description={`${nbRepondu} / ${totalCriteres} critères renseignés`}
      />

      <Stepper
        steps={steps}
        currentStepIndex={phase === 'finalisation' ? totalSections : indexSection}
        onStepClick={(idx) => {
          if (idx < totalSections) {
            setIndexSection(idx);
            setPhase('section');
          } else {
            setPhase('finalisation');
          }
        }}
      />

      {phase === 'section' ? (
        <div className="bg-white border border-enp-border p-3.5 sm:p-5 space-y-4">
          {(() => {
            const sectionCourante = questionnaire.sections[indexSection];
            return (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-enp-border pb-2.5">
                  <div>
                    <span className="text-[11px] font-semibold text-enp-blue-primary uppercase tracking-wider">
                      Section {sectionCourante.code} / {totalSections}
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-enp-black">
                      {sectionCourante.titre}
                    </h2>
                  </div>
                  <span className="text-[11px] text-enp-gray-medium">
                    1 = Pas d'accord · 5 = Très bien
                  </span>
                </div>

                <div className="space-y-3">
                  {sectionCourante.criteres.map((critere, critIdx) => {
                    const noteActuelle = reponses[critere.id];

                    return (
                      <div
                        key={critere.id}
                        className="p-3 sm:p-3.5 border border-enp-border bg-[#FAFAFA] space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs sm:text-sm font-medium text-enp-black leading-snug">
                            <span className="font-mono font-bold text-enp-blue-primary mr-1.5">
                              {critIdx + 1}.
                            </span>
                            {critere.libelle}
                          </p>
                          {noteActuelle !== undefined && (
                            <Check className="w-4 h-4 text-enp-green-valid shrink-0" />
                          )}
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                          {OPTIONS_NOTATION.map((opt) => {
                            const estSelectionne = noteActuelle === opt.valeur;
                            return (
                              <button
                                key={String(opt.valeur)}
                                type="button"
                                onClick={() => setNote(critere.id, opt.valeur)}
                                className={`py-2 px-1.5 border text-center transition-colors select-none flex flex-col items-center justify-center min-h-[44px] ${
                                  estSelectionne
                                    ? 'bg-enp-blue-primary text-white border-enp-blue-primary font-bold'
                                    : 'bg-white text-enp-black border-enp-border hover:border-enp-blue-primary/60 hover:bg-enp-blue-ice/30'
                                }`}
                              >
                                <span className="text-xs sm:text-sm font-bold leading-tight tabular-nums">
                                  {opt.code}
                                </span>
                                <span
                                  className={`text-[10px] leading-tight mt-0.5 truncate max-w-full ${
                                    estSelectionne ? 'text-white/95' : 'text-enp-gray-medium'
                                  }`}
                                >
                                  {opt.libelle}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-enp-border flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="md"
                    disabled={indexSection === 0}
                    onClick={() => setIndexSection((prev) => Math.max(0, prev - 1))}
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Précédent
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      if (indexSection < totalSections - 1) {
                        setIndexSection((prev) => prev + 1);
                      } else {
                        setPhase('finalisation');
                      }
                    }}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    {indexSection < totalSections - 1 ? 'Suivant' : 'Terminer'}
                  </Button>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        /* Etape finale : observations + depot */
        <div className="bg-white border border-enp-border p-4 sm:p-5 space-y-4">
          <div className="border-b border-enp-border pb-2.5">
            <h2 className="text-sm sm:text-base font-bold text-enp-blue-deep">
              Observations facultatives & Dépôt
            </h2>
            <p className="text-xs text-enp-gray-medium mt-0.5 tabular-nums">
              {nbRepondu} / {totalCriteres} critères évalués · Ne mentionnez aucune donnée personnelle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <Textarea
              label="Points forts (facultatif)"
              value={pointsForts}
              onChange={(e) => setPointsForts(e.target.value)}
              maxLength={MAX_COMMENTAIRE}
              maxLengthIndicator={true}
              rows={3}
              placeholder="Clarté du cours, supports, disponibilité..."
            />

            <Textarea
              label="Axes d'amélioration souhaités (facultatif)"
              value={pointsAAmeliorer}
              onChange={(e) => setPointsAAmeliorer(e.target.value)}
              maxLength={MAX_COMMENTAIRE}
              maxLengthIndicator={true}
              rows={3}
              placeholder="Rythme, équilibre cours/TD, exercices supplémentaires..."
            />
          </div>

          {erreurAction && (
            <Alert variant="danger" title="Échec lors du dépôt">
              {erreurAction}
            </Alert>
          )}

          <div className="pt-4 border-t border-enp-border space-y-4">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs sm:text-sm text-enp-black select-none bg-enp-blue-ice/40 p-3 border border-enp-border">
              <input
                type="checkbox"
                checked={confirmerEnvoi}
                onChange={(e) => setConfirmerEnvoi(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-enp-blue-primary border-enp-border focus:ring-enp-blue-primary shrink-0"
              />
              <span className="leading-snug">
                Je confirme le dépôt <strong>définitif et irréversible</strong> de mon bulletin anonyme dans l'urne électronique officielle de l'ENP.
              </span>
            </label>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  setIndexSection(totalSections - 1);
                  setPhase('section');
                }}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                Retour aux critères
              </Button>

              <Button
                variant="primary"
                size="lg"
                disabled={!confirmerEnvoi}
                isLoading={enCours}
                onClick={() => void executerEnvoiFinal()}
                rightIcon={<Send className="w-4 h-4" />}
                className="font-bold"
              >
                Déposer mon bulletin dans l'urne
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
