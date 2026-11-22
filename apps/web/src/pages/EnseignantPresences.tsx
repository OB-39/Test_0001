import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarCheck,
  Check,
  CheckCheck,
  Clock,
  Download,
  FileCheck2,
  Plus,
  QrCode,
  Save,
  UserX,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import { useConfirmation } from '@/components/useConfirmation';
import type {
  CoursDossier,
  DetailSeancePresence,
  JustificatifAbsence,
  SeancePresence,
  StatutPresenceEtudiant,
} from '@/api/types';
import { PageHeader, Button, Alert, Badge } from '@/components/ui';
import {
  genererCsvEmargement,
  telechargerCsv,
} from '@/utils/attendanceEnhancements';

const PRESETS_SEANCE = ['CM : Cours magistral', 'TD : Travaux dirigés', 'TP : Travaux pratiques'];

const OPTIONS_MOBILE: {
  statut: StatutPresenceEtudiant;
  code: string;
  label: string;
  activeClass: string;
}[] = [
  {
    statut: 'present',
    code: 'P',
    label: 'Présent',
    activeClass: 'bg-enp-green-valid text-white border-enp-green-valid',
  },
  {
    statut: 'retard',
    code: 'R',
    label: 'Retard',
    activeClass: 'bg-[#D97706] text-white border-[#D97706]',
  },
  {
    statut: 'absent',
    code: 'A',
    label: 'Absent',
    activeClass: 'bg-enp-red-error text-white border-enp-red-error',
  },
  {
    statut: 'justifie',
    code: 'J',
    label: 'Justifié',
    activeClass: 'bg-violet-700 text-white border-violet-700',
  },
];

export function EnseignantPresences() {
  const navigate = useNavigate();
  const { confirmer } = useConfirmation();
  const [cours, setCours] = useState<CoursDossier[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [seances, setSeances] = useState<SeancePresence[]>([]);
  const [seanceId, setSeanceId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailSeancePresence | null>(null);
  const [justificatifs, setJustificatifs] = useState<JustificatifAbsence[]>([]);
  const [traitementJustifId, setTraitementJustifId] = useState<number | null>(null);
  const [statuts, setStatuts] = useState<Record<number, StatutPresenceEtudiant | ''>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [libelle, setLibelle] = useState('');
  const [afficherCreation, setAfficherCreation] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  const chargerSeances = useCallback(async () => {
    if (courseId === null) return;
    setErreur(null);
    setDetail(null);
    try {
      const [liste, justifs] = await Promise.all([
        api.dossierSeancesPresence(courseId),
        api.dossierListerJustificatifs(courseId),
      ]);
      setSeances(liste);
      setJustificatifs(justifs);
      setSeanceId(liste[0]?.id ?? null);
      if (liste.length === 0) setAfficherCreation(true);
    } catch (err) {
      setErreur(
        err instanceof ApiError ? err.messages.join(' ') : 'Impossible de charger les séances.',
      );
    }
  }, [courseId]);

  useEffect(() => {
    void chargerSeances();
  }, [chargerSeances]);

  const chargerDetail = useCallback(async () => {
    if (seanceId === null) {
      setDetail(null);
      return;
    }
    try {
      const data = await api.dossierPresenceSeance(seanceId);
      setDetail(data);
      setStatuts(
        Object.fromEntries(
          data.etudiants.map((etudiant) => [etudiant.id, etudiant.statut ?? '']),
        ),
      );
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : 'Impossible de charger la liste des étudiants.',
      );
    }
  }, [seanceId]);

  useEffect(() => {
    void chargerDetail();
  }, [chargerDetail]);

  async function creerSeance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (courseId === null || !libelle.trim()) return;
    const confirme = await confirmer({
      title: 'Créer une séance de présence ?',
      message: `La séance « ${libelle.trim()} » sera ajoutée au suivi des présences de cette UE.`,
      confirmLabel: 'Créer',
      variant: 'warning',
    });
    if (!confirme) return;
    setErreur(null);
    setMessage(null);
    try {
      const creee = await api.dossierCreerSeancePresence(courseId, {
        date,
        libelle: libelle.trim(),
      });
      setLibelle('');
      setAfficherCreation(false);
      setMessage('Nouvelle séance créée.');
      const liste = await api.dossierSeancesPresence(courseId);
      setSeances(liste);
      setSeanceId(creee.id);
    } catch (err) {
      setErreur(
        err instanceof ApiError ? err.messages.join(' ') : 'Impossible de créer la séance.',
      );
    }
  }

  function marquerTousPresent() {
    if (!detail) return;
    const nouveau: Record<number, StatutPresenceEtudiant> = {};
    for (const etudiant of detail.etudiants) {
      nouveau[etudiant.id] = 'present';
    }
    setStatuts(nouveau);
    setMessage(null);
  }

  function definirStatut(etudiantId: number, statut: StatutPresenceEtudiant) {
    setStatuts((courant) => ({ ...courant, [etudiantId]: statut }));
    setMessage(null);
  }

  async function enregistrer() {
    if (!detail || detail.etudiants.some((etudiant) => !statuts[etudiant.id])) return;
    const absents = detail.etudiants.filter(
      (etudiant) => statuts[etudiant.id] === 'absent',
    ).length;
    const confirme = await confirmer({
      title: 'Enregistrer les présences ?',
      message: `Enregistrer les statuts de ${detail.etudiants.length} étudiants (${absents} absence(s)) dans leur dossier académique.`,
      confirmLabel: 'Enregistrer',
      variant: 'warning',
    });
    if (!confirme) return;
    setEnregistrement(true);
    setErreur(null);
    setMessage(null);
    try {
      await api.dossierEnregistrerPresences(
        detail.seance.id,
        detail.etudiants.map((etudiant) => ({
          etudiantId: etudiant.id,
          statut: statuts[etudiant.id] as StatutPresenceEtudiant,
        })),
      );
      setMessage('Présences enregistrées.');
      if (courseId !== null) {
        setSeances(await api.dossierSeancesPresence(courseId));
      }
      await chargerDetail();
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : 'Impossible d’enregistrer les présences.',
      );
    } finally {
      setEnregistrement(false);
    }
  }

  function exporterFeuilleCsv() {
    if (!detail) return;
    const coursActif = cours.find((c) => c.id === courseId);
    const libelles: Record<string, string> = {
      present: 'Présent',
      retard: 'En retard',
      absent: 'Absent',
      justifie: 'Justifié',
    };
    const lignes = detail.etudiants.map((etu) => {
      const s = statuts[etu.id] || etu.statut || '';
      return {
        matricule: etu.identifiant ?? `ETU-${etu.id}`,
        nom: etu.nom,
        prenom: etu.prenom,
        statut: s ? (libelles[s] ?? s) : 'Non pointé',
        horodatage: '-',
        methode: s ? 'Feuille ENP' : '-',
      };
    });
    const csv = genererCsvEmargement(
      {
        codeUe: coursActif?.code ?? 'UE',
        intituleUe: coursActif?.intitule ?? "Unité d'enseignement",
        libelleSeance: detail.seance.libelle,
        dateSeance: detail.seance.date,
        presents: decompte.presents + decompte.retards,
        inscrits: detail.etudiants.length,
      },
      lignes,
    );
    telechargerCsv(
      `emargement_${coursActif?.code ?? 'UE'}_${detail.seance.date}.csv`,
      csv,
    );
  }

  const decompte = useMemo(() => {
    if (!detail) return { presents: 0, retards: 0, absents: 0, justifiees: 0, nonMarques: 0 };
    let presents = 0;
    let retards = 0;
    let absents = 0;
    let justifiees = 0;
    let nonMarques = 0;
    for (const etu of detail.etudiants) {
      const s = statuts[etu.id];
      if (s === 'present') presents++;
      else if (s === 'retard') retards++;
      else if (s === 'absent') absents++;
      else if (s === 'justifie') justifiees++;
      else nonMarques++;
    }
    return { presents, retards, absents, justifiees, nonMarques };
  }, [detail, statuts]);

  const pretAEnregistrer = Boolean(
    detail && detail.etudiants.length > 0 && decompte.nonMarques === 0,
  );

  return (
    <div className="space-y-4 animate-fade-in max-w-6xl mx-auto pb-6">
      <PageHeader
        title="Présences"
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Présences' },
        ]}
        actions={
          cours.length > 0 ? (
            <Button
              variant={afficherCreation ? 'outline' : 'primary'}
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAfficherCreation((v) => !v)}
              className="min-h-[38px]"
            >
              {afficherCreation ? 'Fermer' : 'Nouvelle séance'}
            </Button>
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
          {/* Selecteur unifie UE + Seances (compact, scrollable sur mobile) */}
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

            {seances.length > 0 && (
              <div className="p-3 bg-enp-bg/60 flex items-center gap-1.5 overflow-x-auto">
                {seances.map((seance) => {
                  const active = seance.id === seanceId;
                  const complet = seance.effectif > 0 && seance.marques === seance.effectif;
                  return (
                    <button
                      key={seance.id}
                      type="button"
                      onClick={() => {
                        setSeanceId(seance.id);
                        setMessage(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs border whitespace-nowrap transition-colors flex items-center gap-2 min-h-[36px] ${
                        active
                          ? 'bg-enp-blue-primary text-white border-enp-blue-primary font-semibold'
                          : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
                      }`}
                    >
                      <span className="tabular-nums truncate max-w-[215px] sm:max-w-none">
                        {seance.date} · {seance.libelle}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-mono font-bold tabular-nums ${
                          active
                            ? 'bg-white/20 text-white'
                            : complet
                              ? 'bg-enp-green-light text-enp-green-valid'
                              : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {seance.marques}/{seance.effectif}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Creation rapide de seance (conditionnelle) */}
          {afficherCreation && (
            <form
              onSubmit={(event) => void creerSeance(event)}
              className="bg-enp-blue-ice/35 border border-enp-blue-primary/30 p-3.5 sm:p-4 space-y-3 animate-fade-in"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-enp-blue-deep">
                  Nouvelle feuille d'appel
                </span>
                <div className="flex items-center gap-1.5">
                  {PRESETS_SEANCE.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLibelle(preset)}
                      className="text-[11px] font-semibold px-2 py-1 bg-white border border-enp-border text-enp-blue-deep hover:border-enp-blue-primary"
                    >
                      {preset.split(' : ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2.5 items-end">
                <label className="block text-xs font-semibold text-enp-black">
                  Date
                  <input
                    required
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm text-enp-black focus:border-enp-blue-primary outline-none min-h-[40px]"
                  />
                </label>
                <label className="block text-xs font-semibold text-enp-black">
                  Libellé
                  <input
                    required
                    maxLength={120}
                    value={libelle}
                    onChange={(event) => setLibelle(event.target.value)}
                    placeholder="Ex. CM : Chapitre 2"
                    className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm text-enp-black focus:border-enp-blue-primary outline-none min-h-[40px]"
                  />
                </label>
                <Button type="submit" variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
                  Créer
                </Button>
              </div>
            </form>
          )}

          {/* Feuille d'appel */}
          {detail && (
            <section className="bg-white border border-enp-border overflow-hidden">
              {/* Barre d'actions */}
              <div className="p-3.5 sm:p-4 border-b border-enp-border bg-enp-bg flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-bold text-enp-blue-deep truncate">
                      {detail.seance.libelle}
                    </h2>
                    <span className="text-xs font-mono text-enp-gray-medium tabular-nums">
                      {detail.seance.date}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    <span className="text-enp-green-valid font-semibold">
                      {decompte.presents} P
                    </span>
                    <span className="text-amber-700 font-semibold">
                      {decompte.retards} R
                    </span>
                    <span className="text-enp-red-error font-semibold">
                      {decompte.absents} A
                    </span>
                    <span className="text-violet-700 font-semibold">
                      {decompte.justifiees} J
                    </span>
                    {decompte.nonMarques > 0 && (
                      <span className="text-enp-gray-medium">
                        {decompte.nonMarques} restant(s)
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="!bg-[#0B2545] hover:!bg-[#071A33] !text-white !border-[#0B2545] col-span-2 sm:col-span-1 justify-center min-h-[40px]"
                    leftIcon={<QrCode className="w-4 h-4" />}
                    onClick={() => navigate(`/enseignant/presences/projection/${detail.seance.id}`)}
                  >
                    Projection QR
                  </Button>
                  {detail.etudiants.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-center min-h-[38px]"
                      leftIcon={<CheckCheck className="w-4 h-4 text-enp-green-valid" />}
                      onClick={marquerTousPresent}
                    >
                      Tout P
                    </Button>
                  )}
                  {detail.etudiants.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-center min-h-[38px]"
                      leftIcon={<Download className="w-4 h-4 text-enp-blue-primary" />}
                      onClick={exporterFeuilleCsv}
                    >
                      CSV
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="col-span-2 sm:col-span-1 justify-center min-h-[40px]"
                    disabled={enregistrement || !pretAEnregistrer}
                    isLoading={enregistrement}
                    leftIcon={<Save className="w-4 h-4" />}
                    onClick={() => void enregistrer()}
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>

              {detail.etudiants.length === 0 ? (
                <p className="p-8 text-center text-sm text-enp-gray-medium">
                  Aucun étudiant inscrit à cette UE.
                </p>
              ) : (
                <>
                  {/* Vue mobile native : appel 1-tap P / R / A / J sans defilement horizontal */}
                  <div className="block md:hidden divide-y divide-enp-border">
                    {detail.etudiants.map((etudiant) => {
                      const statutActuel = statuts[etudiant.id] ?? '';
                      const taux = etudiant.statistiques?.tauxPresence;
                      return (
                        <div key={etudiant.id} className="p-3.5 space-y-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-enp-black truncate">
                                {etudiant.prenom} {etudiant.nom}
                              </p>
                              <p className="font-mono text-[11px] text-enp-gray-medium">
                                {etudiant.identifiant ?? '-'}
                              </p>
                            </div>
                            <span
                              className={`text-xs font-mono font-bold tabular-nums shrink-0 ${
                                taux != null && taux < 75
                                  ? 'text-enp-red-error'
                                  : 'text-enp-gray-dark'
                              }`}
                            >
                              {taux == null ? '-' : `${taux}%`}
                            </span>
                          </div>

                          <div
                            className="grid grid-cols-4 gap-1.5"
                            role="group"
                            aria-label={`Présence de ${etudiant.prenom} ${etudiant.nom}`}
                          >
                            {OPTIONS_MOBILE.map((opt) => {
                              const actif = statutActuel === opt.statut;
                              return (
                                <button
                                  key={opt.statut}
                                  type="button"
                                  aria-label={`${opt.label} pour ${etudiant.prenom} ${etudiant.nom}`}
                                  aria-pressed={actif}
                                  onClick={() => definirStatut(etudiant.id, opt.statut)}
                                  className={`min-h-[40px] text-xs font-bold border transition-colors ${
                                    actif
                                      ? opt.activeClass
                                      : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/30'
                                  }`}
                                >
                                  {opt.code}
                                </button>
                              );
                            })}
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
                          <th className="px-4 py-2.5 text-center font-semibold">Assiduité</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Pointage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-enp-border">
                        {detail.etudiants.map((etudiant) => {
                          const statutActuel = statuts[etudiant.id] ?? '';
                          const taux = etudiant.statistiques?.tauxPresence;
                          return (
                            <tr
                              key={etudiant.id}
                              className="hover:bg-enp-blue-ice/20 transition-colors"
                            >
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-enp-blue-deep whitespace-nowrap">
                                {etudiant.identifiant ?? '-'}
                              </td>
                              <td className="px-4 py-3 font-medium text-enp-black">
                                {etudiant.prenom} {etudiant.nom}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {etudiant.statistiques ? (
                                  <span
                                    className={`text-xs font-mono font-bold tabular-nums ${
                                      (taux ?? 100) < 75
                                        ? 'text-enp-red-error'
                                        : 'text-enp-green-valid'
                                    }`}
                                  >
                                    {taux == null ? '-' : `${taux}%`}
                                  </span>
                                ) : (
                                  <span className="text-xs text-enp-gray-medium">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div
                                  className="inline-flex items-center gap-1"
                                  role="group"
                                  aria-label={`Présence de ${etudiant.prenom} ${etudiant.nom}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => definirStatut(etudiant.id, 'present')}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border transition-colors min-h-[34px] ${
                                      statutActuel === 'present'
                                        ? 'bg-enp-green-valid text-white border-enp-green-valid'
                                        : 'bg-white text-enp-black border-enp-border hover:border-enp-green-valid hover:text-enp-green-valid'
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Présent</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => definirStatut(etudiant.id, 'retard')}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border transition-colors min-h-[34px] ${
                                      statutActuel === 'retard'
                                        ? 'bg-[#D97706] text-white border-[#D97706]'
                                        : 'bg-white text-enp-black border-enp-border hover:border-[#D97706] hover:text-[#D97706]'
                                    }`}
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Retard</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => definirStatut(etudiant.id, 'absent')}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border transition-colors min-h-[34px] ${
                                      statutActuel === 'absent'
                                        ? 'bg-enp-red-error text-white border-enp-red-error'
                                        : 'bg-white text-enp-black border-enp-border hover:border-enp-red-error hover:text-enp-red-error'
                                    }`}
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                    <span>Absent</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => definirStatut(etudiant.id, 'justifie')}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border transition-colors min-h-[34px] ${
                                      statutActuel === 'justifie'
                                        ? 'bg-violet-700 text-white border-violet-700'
                                        : 'bg-white text-enp-black border-enp-border hover:border-violet-700 hover:text-violet-700'
                                    }`}
                                  >
                                    <CalendarCheck className="w-3.5 h-3.5" />
                                    <span>Justifié</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          {/* Justificatifs d'absence a examiner */}
          {justificatifs.length > 0 && (
            <section
              data-testid="panel-justificatifs-enseignant"
              className="bg-white border border-enp-border p-3.5 sm:p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-enp-border pb-2.5">
                <h2 className="text-sm font-bold text-enp-blue-deep flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-enp-blue-primary" />
                  <span>Justificatifs ({justificatifs.length})</span>
                </h2>
              </div>

              <div className="divide-y divide-enp-border">
                {justificatifs.map((justif) => (
                  <div
                    key={justif.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-enp-black">
                        {justif.etudiantPrenom} {justif.etudiantNom}{' '}
                        <span className="font-mono font-normal text-enp-gray-medium">
                          · {justif.dateSeance}
                        </span>
                      </p>
                      <p className="text-enp-gray-dark">{justif.motif}</p>
                      <p className="text-[11px] font-mono text-enp-gray-medium truncate">
                        {justif.nomFichier}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {justif.statut === 'en_attente' ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={traitementJustifId === justif.id}
                            leftIcon={<Check className="w-3.5 h-3.5 text-enp-green-valid" />}
                            onClick={async () => {
                              setTraitementJustifId(justif.id);
                              try {
                                await api.dossierTraiterJustificatif(justif.id, {
                                  statut: 'valide',
                                  commentaireValidation: 'Justificatif accepté.',
                                });
                                const majJustifs = await api.dossierListerJustificatifs(
                                  courseId ?? undefined,
                                );
                                setJustificatifs(majJustifs);
                                if (detail && detail.seance.id === justif.seanceId) {
                                  setStatuts((prev) => ({
                                    ...prev,
                                    [justif.etudiantId]: 'justifie',
                                  }));
                                }
                                setMessage(
                                  `Justificatif de ${justif.etudiantPrenom} ${justif.etudiantNom} validé.`,
                                );
                              } finally {
                                setTraitementJustifId(null);
                              }
                            }}
                          >
                            Valider
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={traitementJustifId === justif.id}
                            leftIcon={<XCircle className="w-3.5 h-3.5 text-enp-red-error" />}
                            onClick={async () => {
                              setTraitementJustifId(justif.id);
                              try {
                                await api.dossierTraiterJustificatif(justif.id, {
                                  statut: 'refuse',
                                  commentaireValidation: 'Pièce non conforme ou hors délai.',
                                });
                                const majJustifs = await api.dossierListerJustificatifs(
                                  courseId ?? undefined,
                                );
                                setJustificatifs(majJustifs);
                                setMessage(
                                  `Justificatif de ${justif.etudiantPrenom} ${justif.etudiantNom} refusé.`,
                                );
                              } finally {
                                setTraitementJustifId(null);
                              }
                            }}
                          >
                            Refuser
                          </Button>
                        </>
                      ) : (
                        <Badge variant={justif.statut === 'valide' ? 'success' : 'danger'}>
                          {justif.statut === 'valide' ? 'Validé' : 'Refusé'}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
