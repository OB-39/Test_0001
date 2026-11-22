import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen,
  Download,
  Plus,
  Save,
  Table as TableIcon,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiError } from '@/api';
import { useConfirmation } from '@/components/useConfirmation';
import type { CahierNotes, CoursDossier } from '@/api/types';
import { PageHeader, Button, Alert } from '@/components/ui';

const PRESETS_EVAL = ['Devoir 1', 'Devoir 2'];

export function EnseignantNotes() {
  const { confirmer } = useConfirmation();
  const [cours, setCours] = useState<CoursDossier[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [progressionStudentId, setProgressionStudentId] = useState<number | null>(null);
  const [cahier, setCahier] = useState<CahierNotes | null>(null);
  const [evalActiveId, setEvalActiveId] = useState<number | 'synthese' | null>(null);
  const [afficherCreation, setAfficherCreation] = useState(false);

  const [libelle, setLibelle] = useState('');
  const [bareme, setBareme] = useState('20');

  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const progression = useMemo(() => {
    const studentId = progressionStudentId ?? cahier?.etudiants[0]?.id;
    if (!cahier || studentId === undefined) return [];
    return cahier.evaluations
      .filter((evaluation) => evaluation.notes[studentId] != null)
      .map((evaluation) => ({
        date: evaluation.creeLe ?? '',
        dateLabel: `${new Date(evaluation.creeLe ?? '').toLocaleDateString('fr-FR')} · ${evaluation.libelle}`,
        noteSur20: ((evaluation.notes[studentId] ?? 0) / evaluation.bareme) * 20,
        libelle: evaluation.libelle,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cahier, progressionStudentId]);

  useEffect(() => {
    let actif = true;
    api
      .dossierCoursEnseignant()
      .then((data) => {
        if (!actif) return;
        setCours(data);
        if (data[0]) setCourseId(data[0].id);
      })
      .catch((err: unknown) => {
        if (actif) {
          setErreur(
            err instanceof ApiError ? err.messages.join(' ') : 'Impossible de charger vos UE.',
          );
        }
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, []);

  const chargerCahier = useCallback(async () => {
    if (courseId === null) return;
    setErreur(null);
    try {
      const data = await api.dossierCahierNotes(courseId);
      setCahier(data);
      setEvalActiveId((precedent) => {
        if (precedent === 'synthese' && data.evaluations.length > 1) return 'synthese';
        if (
          typeof precedent === 'number' &&
          data.evaluations.some((ev) => ev.id === precedent)
        ) {
          return precedent;
        }
        return data.evaluations[0]?.id ?? null;
      });
      if (data.evaluations.length === 0) setAfficherCreation(true);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : 'Impossible de charger le tableau des notes.',
      );
    }
  }, [courseId]);

  useEffect(() => {
    void chargerCahier();
  }, [chargerCahier]);

  async function creerEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (courseId === null || !libelle.trim()) return;
    const confirme = await confirmer({
      title: 'Créer une colonne d’évaluation ?',
      message: `La colonne « ${libelle.trim()} » sera ajoutée au cahier de notes de cette UE.`,
      confirmLabel: 'Créer',
      variant: 'warning',
    });
    if (!confirme) return;
    setErreur(null);
    setMessage(null);
    try {
      const creee = await api.dossierCreerEvaluation(courseId, {
        libelle: libelle.trim(),
        bareme: Number(bareme),
      });
      setLibelle('');
      setAfficherCreation(false);
      setMessage(`Évaluation « ${creee.libelle} » créée.`);
      const data = await api.dossierCahierNotes(courseId);
      setCahier(data);
      setEvalActiveId(creee.id);
    } catch (err) {
      setErreur(
        err instanceof ApiError ? err.messages.join(' ') : 'Impossible de créer la colonne.',
      );
    }
  }

  function modifierNote(evaluationId: number, etudiantId: number, valeur: string) {
    if (!cahier) return;
    const note = valeur === '' ? null : Number(valeur);
    setCahier({
      ...cahier,
      evaluations: cahier.evaluations.map((evaluation) =>
        evaluation.id !== evaluationId
          ? evaluation
          : { ...evaluation, notes: { ...evaluation.notes, [etudiantId]: note } },
      ),
    });
    setMessage(null);
  }

  async function enregistrerEvaluation(evaluationId: number) {
    if (!cahier) return;
    const evaluation = cahier.evaluations.find((ligne) => ligne.id === evaluationId);
    if (!evaluation) return;
    const confirme = await confirmer({
      title: 'Enregistrer les notes ?',
      message: `Les notes de « ${evaluation.libelle} » seront mises à jour pour les ${cahier.etudiants.length} étudiants.`,
      confirmLabel: 'Enregistrer',
      variant: 'warning',
    });
    if (!confirme) return;
    setEnregistrement(evaluationId);
    setErreur(null);
    setMessage(null);
    try {
      await api.dossierEnregistrerNotes(
        evaluationId,
        cahier.etudiants.map((etudiant) => ({
          etudiantId: etudiant.id,
          note: evaluation.notes[etudiant.id] ?? null,
        })),
      );
      setMessage(`Notes de « ${evaluation.libelle} » enregistrées.`);
    } catch (err) {
      setErreur(
        err instanceof ApiError ? err.messages.join(' ') : 'Impossible d’enregistrer les notes.',
      );
    } finally {
      setEnregistrement(null);
    }
  }

  async function exporterNotes(format: 'pdf' | 'xlsx' | 'docx') {
    if (courseId === null || !cahier) return;
    setErreur(null);
    try {
      const blob = await api.dossierExporterNotes(courseId, format);
      const url = URL.createObjectURL(blob);
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `notes-${cahier.cours.code}.${format}`;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErreur(
        err instanceof ApiError ? err.messages.join(' ') : 'Impossible d’exporter les notes.',
      );
    }
  }

  const evaluationActive = useMemo(() => {
    if (!cahier || evalActiveId === null || evalActiveId === 'synthese') return null;
    return cahier.evaluations.find((ev) => ev.id === evalActiveId) ?? cahier.evaluations[0] ?? null;
  }, [cahier, evalActiveId]);

  const statsActive = useMemo(() => {
    if (!evaluationActive || !cahier) return null;
    const valeurs = cahier.etudiants
      .map((e) => evaluationActive.notes[e.id])
      .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
    const moyenne =
      valeurs.length > 0
        ? (Math.round((valeurs.reduce((a, b) => a + b, 0) / valeurs.length) * 100) / 100).toFixed(2)
        : '-';
    return {
      saisies: valeurs.length,
      total: cahier.etudiants.length,
      moyenne,
    };
  }, [cahier, evaluationActive]);

  return (
    <div className="space-y-4 animate-fade-in max-w-6xl mx-auto pb-6">
      <PageHeader
        title="Saisie des notes"
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Saisie des notes' },
        ]}
        actions={
          cours.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {cahier && cahier.evaluations.length > 0 && (
                <div className="inline-flex border border-enp-border bg-white">
                  {(['pdf', 'xlsx', 'docx'] as const).map((format, idx) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => void exporterNotes(format)}
                      className={`px-2.5 py-1.5 text-xs font-semibold text-enp-blue-deep hover:bg-enp-blue-ice transition-colors inline-flex items-center gap-1 min-h-[38px] ${
                        idx < 2 ? 'border-r border-enp-border' : ''
                      }`}
                    >
                      {idx === 0 && <Download className="w-3.5 h-3.5" />}
                      <span>{format.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant={afficherCreation ? 'outline' : 'primary'}
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setAfficherCreation((v) => !v)}
                className="min-h-[38px]"
              >
                {afficherCreation ? 'Fermer' : 'Nouveau devoir'}
              </Button>
            </div>
          ) : undefined
        }
      />

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {message && (
        <Alert variant="success" title="Confirmation" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {chargement ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Chargement de vos unités d’enseignement...
        </div>
      ) : cours.length === 0 ? (
        <div className="bg-white border border-enp-border p-10 text-center space-y-2">
          <BookOpen className="w-8 h-8 text-enp-gray-medium mx-auto opacity-50" />
          <p className="text-sm font-bold text-enp-blue-deep">Aucune UE attribuée</p>
          <p className="text-xs text-enp-gray-medium">
            Aucune unité d’enseignement ne vous est rattachée pour le semestre en cours.
          </p>
        </div>
      ) : (
        <>
          {/* Selecteur unifie UE + Evaluations */}
          <div className="bg-white border border-enp-border divide-y divide-enp-border">
            <div className="p-3 flex items-center gap-1.5 overflow-x-auto">
              {cours.map((ue) => {
                const actif = ue.id === courseId;
                return (
                  <button
                    key={ue.id}
                    type="button"
                    onClick={() => {
                      setCourseId(ue.id);
                      setMessage(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold border whitespace-nowrap transition-colors flex items-center gap-1.5 min-h-[36px] ${
                      actif
                        ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                        : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
                    }`}
                  >
                    <span className="font-mono font-bold">{ue.code}</span>
                    <span className="truncate max-w-[160px] sm:max-w-[220px] font-normal opacity-90">
                      {ue.intitule}
                    </span>
                  </button>
                );
              })}
            </div>

            {cahier && cahier.evaluations.length > 0 && (
              <div className="p-3 bg-enp-bg/60 flex items-center gap-1.5 overflow-x-auto">
                {cahier.evaluations.map((ev) => {
                  const actif = evalActiveId === ev.id;
                  const nbNotes = Object.values(ev.notes).filter((v) => v !== null).length;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setEvalActiveId(ev.id)}
                      className={`px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap transition-colors flex items-center gap-2 min-h-[36px] ${
                        actif
                          ? 'bg-enp-blue-primary text-white border-enp-blue-primary'
                          : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
                      }`}
                    >
                      <span>{ev.libelle}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 font-bold tabular-nums ${
                          actif
                            ? 'bg-white/20 text-white'
                            : 'bg-enp-blue-light text-enp-blue-deep'
                        }`}
                      >
                        {nbNotes}/{cahier.etudiants.length}
                      </span>
                    </button>
                  );
                })}

                {cahier.evaluations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setEvalActiveId('synthese')}
                    className={`ml-auto px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap transition-colors inline-flex items-center gap-1.5 min-h-[36px] ${
                      evalActiveId === 'synthese'
                        ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                        : 'bg-white text-enp-blue-deep border-enp-border hover:bg-enp-blue-ice/40'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Synthèse</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Creation rapide de devoir */}
          {afficherCreation && (
            <form
              onSubmit={(event) => void creerEvaluation(event)}
              className="bg-enp-blue-ice/35 border border-enp-blue-primary/30 p-3.5 sm:p-4 space-y-3 animate-fade-in"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-enp-blue-deep">
                  Nouvelle colonne d'évaluation
                </span>
                <div className="flex items-center gap-1.5">
                  {PRESETS_EVAL.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLibelle(preset)}
                      className="text-[11px] font-semibold px-2 py-1 bg-white border border-enp-border text-enp-blue-deep hover:border-enp-blue-primary"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_auto] gap-2.5 items-end">
                <label className="block text-xs font-semibold text-enp-black">
                  Intitulé
                  <input
                    required
                    maxLength={120}
                    value={libelle}
                    onChange={(event) => setLibelle(event.target.value)}
                    placeholder="Ex. Devoir 1"
                    className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm text-enp-black focus:border-enp-blue-primary outline-none min-h-[40px]"
                  />
                </label>
                <label className="block text-xs font-semibold text-enp-black">
                  Barème
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="100000"
                    step="0.01"
                    value={bareme}
                    onChange={(event) => setBareme(event.target.value)}
                    className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm text-enp-black focus:border-enp-blue-primary outline-none min-h-[40px]"
                  />
                </label>
                <Button type="submit" variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
                  Créer
                </Button>
              </div>
            </form>
          )}

          {/* Contenu principal */}
          {cahier && (
            <div className="space-y-4">
              {cahier.evaluations.length === 0 ? (
                <div className="bg-white border border-enp-border p-8 text-center text-sm text-enp-gray-medium">
                  Aucun devoir créé pour cette UE.
                </div>
              ) : evalActiveId === 'synthese' ? (
                /* Vue synthese toutes colonnes */
                <section className="bg-white border border-enp-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-enp-border bg-enp-bg flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-enp-blue-deep truncate">
                      {cahier.cours.code} · Récapitulatif ({cahier.etudiants.length} étudiants)
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-enp-blue-deep text-white text-left text-xs uppercase tracking-wider">
                          <th className="px-4 py-2.5 font-semibold">Étudiant</th>
                          {cahier.evaluations.map((ev) => (
                            <th key={ev.id} className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                              {ev.libelle} (/{ev.bareme})
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-enp-border">
                        {cahier.etudiants.map((etudiant) => (
                          <tr key={etudiant.id} className="hover:bg-enp-blue-ice/20">
                            <td className="px-4 py-2.5">
                              <span className="font-medium text-enp-black block">
                                {etudiant.prenom} {etudiant.nom}
                              </span>
                              <span className="font-mono text-[11px] text-enp-gray-medium">
                                {etudiant.identifiant ?? '-'}
                              </span>
                            </td>
                            {cahier.evaluations.map((ev) => {
                              const n = ev.notes[etudiant.id];
                              return (
                                <td
                                  key={ev.id}
                                  className="px-4 py-2.5 text-right font-mono font-bold tabular-nums"
                                >
                                  {n === null || n === undefined ? (
                                    <span className="text-enp-gray-medium font-normal">-</span>
                                  ) : (
                                    <span
                                      className={
                                        n >= ev.bareme / 2
                                          ? 'text-enp-blue-deep'
                                          : 'text-enp-red-error'
                                      }
                                    >
                                      {n}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                evaluationActive && (
                  <>
                    {/* Feuille de saisie active */}
                    <article className="bg-white border border-enp-border overflow-hidden">
                      <div className="p-3.5 sm:p-4 border-b border-enp-border bg-enp-bg flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-sm sm:text-base font-bold text-enp-blue-deep">
                            {evaluationActive.libelle}{' '}
                            <span className="font-mono text-xs font-normal text-enp-gray-medium">
                              /{evaluationActive.bareme}
                            </span>
                          </h2>
                          {statsActive && (
                            <p className="text-xs text-enp-gray-medium tabular-nums mt-0.5">
                              {statsActive.saisies}/{statsActive.total} saisies · Moyenne{' '}
                              <strong className="text-enp-blue-deep">
                                {statsActive.moyenne}/{evaluationActive.bareme}
                              </strong>
                            </p>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={enregistrement === evaluationActive.id}
                          isLoading={enregistrement === evaluationActive.id}
                          leftIcon={<Save className="w-4 h-4" />}
                          onClick={() => void enregistrerEvaluation(evaluationActive.id)}
                          className="min-h-[38px]"
                        >
                          Enregistrer
                        </Button>
                      </div>

                      {cahier.etudiants.length === 0 ? (
                        <p className="p-8 text-center text-sm text-enp-gray-medium">
                          Aucun étudiant inscrit à cette UE.
                        </p>
                      ) : (
                        <>
                          {/* Vue mobile native : saisie rapide carte par carte */}
                          <div className="block md:hidden divide-y divide-enp-border">
                            {cahier.etudiants.map((etudiant) => {
                              const valeurNote = evaluationActive.notes[etudiant.id] ?? '';
                              return (
                                <div
                                  key={etudiant.id}
                                  className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-enp-black truncate">
                                      {etudiant.prenom} {etudiant.nom}
                                    </p>
                                    <p className="font-mono text-[11px] text-enp-gray-medium">
                                      {etudiant.identifiant ?? '-'}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <input
                                      aria-label={`Note de ${etudiant.prenom} ${etudiant.nom}`}
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      max={evaluationActive.bareme}
                                      step="0.25"
                                      placeholder="-"
                                      value={valeurNote}
                                      onChange={(event) =>
                                        modifierNote(
                                          evaluationActive.id,
                                          etudiant.id,
                                          event.target.value,
                                        )
                                      }
                                      className="w-20 text-right font-mono font-bold tabular-nums border border-enp-border bg-white px-2.5 py-2 text-sm text-enp-black focus:border-enp-blue-primary outline-none min-h-[40px]"
                                    />
                                    <span className="text-xs font-mono text-enp-gray-medium w-7">
                                      /{evaluationActive.bareme}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Vue desktop */}
                          <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="bg-enp-blue-deep text-white text-left text-xs uppercase tracking-wider">
                                  <th className="px-4 py-2.5 font-semibold">Matricule</th>
                                  <th className="px-4 py-2.5 font-semibold">Étudiant</th>
                                  <th className="w-44 px-4 py-2.5 text-right font-semibold">
                                    Note / {evaluationActive.bareme}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-enp-border">
                                {cahier.etudiants.map((etudiant) => {
                                  const valeurNote = evaluationActive.notes[etudiant.id] ?? '';
                                  return (
                                    <tr
                                      key={etudiant.id}
                                      className="hover:bg-enp-blue-ice/20 transition-colors"
                                    >
                                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-enp-blue-deep">
                                        {etudiant.identifiant ?? '-'}
                                      </td>
                                      <td className="px-4 py-2.5 font-medium text-enp-black">
                                        {etudiant.prenom} {etudiant.nom}
                                      </td>
                                      <td className="px-4 py-2 text-right">
                                        <input
                                          aria-label={`Note de ${etudiant.prenom} ${etudiant.nom}`}
                                          type="number"
                                          min="0"
                                          max={evaluationActive.bareme}
                                          step="0.25"
                                          placeholder="-"
                                          value={valeurNote}
                                          onChange={(event) =>
                                            modifierNote(
                                              evaluationActive.id,
                                              etudiant.id,
                                              event.target.value,
                                            )
                                          }
                                          className="w-28 ml-auto block text-right font-mono font-bold tabular-nums border border-enp-border bg-white px-3 py-1.5 text-sm text-enp-black focus:border-enp-blue-primary outline-none"
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </article>

                    {/* Courbe d'evolution repliee par defaut pour privilegier la saisie */}
                    {cahier.etudiants.length > 0 && cahier.evaluations.length > 1 && (
                      <details className="bg-white border border-enp-border">
                        <summary className="px-4 py-3 text-xs font-semibold text-enp-blue-deep cursor-pointer flex items-center gap-2 select-none">
                          <TrendingUp className="w-4 h-4 text-enp-blue-primary" />
                          <span>Courbe d'évolution par étudiant</span>
                        </summary>
                        <div className="px-4 pb-4 pt-2 border-t border-enp-border space-y-3">
                          <select
                            aria-label="Choisir un étudiant"
                            value={progressionStudentId ?? cahier.etudiants[0].id}
                            onChange={(event) =>
                              setProgressionStudentId(Number(event.target.value))
                            }
                            className="block w-full max-w-md border border-enp-border bg-white px-3 py-2 text-xs text-enp-black min-h-[38px]"
                          >
                            {cahier.etudiants.map((etudiant) => (
                              <option key={etudiant.id} value={etudiant.id}>
                                {etudiant.identifiant} · {etudiant.prenom} {etudiant.nom}
                              </option>
                            ))}
                          </select>
                          {progression.length > 0 ? (
                            <div className="h-52 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={progression}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="dateLabel" hide />
                                  <YAxis domain={[0, 20]} />
                                  <Tooltip
                                    labelFormatter={(_, payload) =>
                                      payload[0]?.payload.dateLabel ?? ''
                                    }
                                    formatter={(value) => [
                                      `${Number(value ?? 0).toFixed(2)} / 20`,
                                      'Note',
                                    ]}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="noteSur20"
                                    name="Note / 20"
                                    stroke="#1D4ED8"
                                    strokeWidth={2}
                                    dot
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <p className="text-xs text-enp-gray-medium">
                              Aucune note saisie pour cet étudiant.
                            </p>
                          )}
                        </div>
                      </details>
                    )}
                  </>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
