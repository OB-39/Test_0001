import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarCheck,
  Camera,
  FileText,
  FileUp,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import type {
  JustificatifAbsence,
  PresencesEtudiant,
  ResultatScanPresence,
  StatutJustificatif,
  StatutPresenceEtudiant,
} from '@/api/types';
import { PageHeader, Alert, Badge, Button } from '@/components/ui';
import { QrScannerModal } from '@/components/QrScannerModal';
import {
  evaluerAlerteAssiduite,
  validerPieceJustificative,
} from '@/utils/attendanceEnhancements';

const LIBELLES_STATUT: Record<StatutPresenceEtudiant, string> = {
  present: 'Présent',
  absent: 'Absent',
  retard: 'Retard',
  justifie: 'Justifiée',
};

const LIBELLES_JUSTIFICATIF: Record<StatutJustificatif, string> = {
  en_attente: 'En attente',
  valide: 'Validé',
  refuse: 'Refusé',
};

function varianteStatut(statut: StatutPresenceEtudiant) {
  if (statut === 'present') return 'success' as const;
  if (statut === 'retard') return 'warning' as const;
  if (statut === 'justifie') return 'violet' as const;
  return 'danger' as const;
}

export function EtudiantPresences() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [donnees, setDonnees] = useState<PresencesEtudiant | null>(null);
  const [justificatifs, setJustificatifs] = useState<JustificatifAbsence[]>([]);
  const [filtreUe, setFiltreUe] = useState<string>('toutes');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [scannerOuvert, setScannerOuvert] = useState(false);
  const [confirmationScan, setConfirmationScan] = useState<string | null>(null);

  // Formulaire de depot de justificatif
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [seanceJustifId, setSeanceJustifId] = useState<number | ''>('');
  const [motifJustif, setMotifJustif] = useState('');
  const [fichierJustif, setFichierJustif] = useState<{
    name: string;
    type: string;
    size: number;
  } | null>(null);
  const [erreurJustif, setErreurJustif] = useState<string | null>(null);
  const [envoiJustif, setEnvoiJustif] = useState(false);

  useEffect(() => {
    if (searchParams.get('scan') === '1') {
      setScannerOuvert(true);
      const next = new URLSearchParams(searchParams);
      next.delete('scan');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const chargerPresences = useCallback(async (afficherLoader = false) => {
    if (afficherLoader) setChargement(true);
    try {
      const [presencesData, justifsData] = await Promise.all([
        api.dossierMesPresences(),
        api.dossierListerJustificatifs().catch(() => []),
      ]);
      setDonnees(presencesData);
      setJustificatifs(justifsData);
      setErreur(null);
    } catch (err: unknown) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : 'Impossible de charger vos présences.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void chargerPresences(true);
  }, [chargerPresences]);

  const handlePresenceValidee = useCallback(
    (resultat: ResultatScanPresence) => {
      setConfirmationScan(resultat.message);
      void chargerPresences(false);
    },
    [chargerPresences],
  );

  const presences = useMemo(() => donnees?.presences ?? [], [donnees]);
  const statistiques = donnees?.statistiques;

  const alerteAssiduite = useMemo(() => {
    if (!statistiques) return null;
    return evaluerAlerteAssiduite(
      statistiques.absents,
      statistiques.seancesMarquees,
    );
  }, [statistiques]);

  const uesUniques = useMemo(() => {
    const map = new Map<string, string>();
    presences.forEach((p) => {
      if (!map.has(p.code)) map.set(p.code, p.intitule);
    });
    return Array.from(map.entries());
  }, [presences]);

  const presencesFiltrees = useMemo(() => {
    if (filtreUe === 'toutes') return presences;
    return presences.filter((p) => p.code === filtreUe);
  }, [presences, filtreUe]);

  function ouvrirFormulaireJustificatif(seanceIdInitial?: number) {
    setErreurJustif(null);
    setMotifJustif('');
    setFichierJustif(null);
    setSeanceJustifId(
      seanceIdInitial ?? (presences[0]?.seanceId ? presences[0].seanceId : ''),
    );
    setFormulaireOuvert(true);
  }

  function handleSelectionFichier(event: ChangeEvent<HTMLInputElement>) {
    setErreurJustif(null);
    const fichier = event.target.files?.[0];
    if (!fichier) {
      setFichierJustif(null);
      return;
    }
    const validation = validerPieceJustificative({
      name: fichier.name,
      type: fichier.type,
      size: fichier.size,
    });
    if (!validation.valide) {
      setFichierJustif(null);
      setErreurJustif(validation.erreur ?? 'Fichier non valide.');
      return;
    }
    setFichierJustif({
      name: fichier.name,
      type: fichier.type,
      size: fichier.size,
    });
  }

  async function soumettreJustificatif(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErreurJustif(null);

    if (typeof seanceJustifId !== 'number') {
      setErreurJustif('Veuillez sélectionner la séance concernée.');
      return;
    }
    if (motifJustif.trim().length < 5) {
      setErreurJustif('Veuillez indiquer un motif précis (5 caractères minimum).');
      return;
    }
    if (!fichierJustif) {
      setErreurJustif('Joignez un fichier PDF, JPG, PNG ou WebP (5 Mo max).');
      return;
    }

    setEnvoiJustif(true);
    try {
      await api.dossierSoumettreJustificatif({
        seanceId: seanceJustifId,
        motif: motifJustif.trim(),
        nomFichier: fichierJustif.name,
        typeMime: fichierJustif.type,
        tailleOctets: fichierJustif.size,
      });
      setFormulaireOuvert(false);
      setConfirmationScan('Justificatif transmis à votre enseignant.');
      await chargerPresences(false);
    } catch (err: unknown) {
      setErreurJustif(
        err instanceof ApiError
          ? err.messages.join(' ')
          : 'Impossible de transmettre le justificatif.',
      );
    } finally {
      setEnvoiJustif(false);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl mx-auto pb-6">
      <PageHeader
        title="Mes présences"
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Mes présences' },
        ]}
      />

      {/* Bandeau compact d'emargement QR */}
      <section className="bg-enp-blue-deep text-white p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-white">
            Émargement en salle
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Scannez le QR code projeté par l'enseignant pour valider votre présence.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setScannerOuvert(true)}
          className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-enp-blue-deep font-bold text-sm px-4 py-2.5 transition-colors min-h-[44px]"
        >
          <Camera className="w-4 h-4 text-enp-blue-primary" />
          <span>Scanner ma présence</span>
        </button>
      </section>

      {/* Alerte de seuil d'absenteisme */}
      {alerteAssiduite && alerteAssiduite.niveau !== 'normal' && (
        <Alert
          variant={alerteAssiduite.niveau === 'critique' ? 'danger' : 'warning'}
          title={alerteAssiduite.titre}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{alerteAssiduite.message}</span>
            </span>
            <button
              type="button"
              onClick={() => ouvrirFormulaireJustificatif()}
              className="shrink-0 underline font-semibold text-xs text-left sm:text-right"
            >
              Déposer un justificatif
            </button>
          </div>
        </Alert>
      )}

      {confirmationScan && (
        <Alert
          variant="success"
          title="Assiduité mise à jour"
          onClose={() => setConfirmationScan(null)}
        >
          {confirmationScan}
        </Alert>
      )}

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      <QrScannerModal
        ouvert={scannerOuvert}
        onFermer={() => setScannerOuvert(false)}
        onPresenceValidee={handlePresenceValidee}
      />

      {chargement ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Chargement de vos présences...
        </div>
      ) : (
        <>
          {/* Resume compact unifie (remplace 5 cartes separees) */}
          {statistiques && (
            <section
              aria-label="Synthèse d'assiduité"
              className="bg-white border border-enp-border grid grid-cols-4 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-enp-border"
            >
              <div className="p-3 sm:p-3.5 col-span-4 sm:col-span-1 flex sm:flex-col items-baseline sm:items-start justify-between gap-1">
                <span className="text-xs font-medium text-enp-gray-medium">Assiduité</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-bold tabular-nums text-enp-blue-primary">
                    {statistiques.tauxPresence === null ? '-' : `${statistiques.tauxPresence}%`}
                  </span>
                  <span className="text-[11px] text-enp-gray-medium tabular-nums">
                    ({statistiques.seancesMarquees}/{statistiques.seancesTotal})
                  </span>
                </div>
              </div>
              <div className="p-2.5 sm:p-3.5">
                <span className="text-[11px] font-medium text-enp-gray-medium block truncate">Présents</span>
                <span className="text-lg sm:text-xl font-bold tabular-nums text-enp-green-valid">
                  {statistiques.presents}
                </span>
              </div>
              <div className="p-2.5 sm:p-3.5">
                <span className="text-[11px] font-medium text-enp-gray-medium block truncate">Retards</span>
                <span className="text-lg sm:text-xl font-bold tabular-nums text-amber-700">
                  {statistiques.retards}
                </span>
              </div>
              <div className="p-2.5 sm:p-3.5">
                <span className="text-[11px] font-medium text-enp-gray-medium block truncate">Absences</span>
                <span
                  className={`text-lg sm:text-xl font-bold tabular-nums ${
                    statistiques.absents > 0 ? 'text-enp-red-error' : 'text-enp-blue-deep'
                  }`}
                >
                  {statistiques.absents}
                </span>
              </div>
              <div className="p-2.5 sm:p-3.5">
                <span className="text-[11px] font-medium text-enp-gray-medium block truncate">Justifiées</span>
                <span className="text-lg sm:text-xl font-bold tabular-nums text-violet-700">
                  {statistiques.justifiees}
                </span>
              </div>
            </section>
          )}

          {/* Justificatifs d'absence */}
          <section className="bg-white border border-enp-border p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-enp-blue-deep flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-enp-blue-primary shrink-0" />
                  <span>Justificatifs d'absence</span>
                </h2>
                <p className="text-xs text-enp-gray-medium mt-0.5 hidden sm:block">
                  Certificat médical ou convocation officielle (PDF ou image, 5 Mo max).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<FileUp className="w-3.5 h-3.5" />}
                onClick={() => ouvrirFormulaireJustificatif()}
                className="shrink-0 min-h-[38px]"
              >
                Déposer
              </Button>
            </div>

            {formulaireOuvert && (
              <form
                onSubmit={(e) => void soumettreJustificatif(e)}
                data-testid="form-justificatif-absence"
                className="bg-enp-bg border border-enp-border p-3.5 space-y-3"
              >
                {erreurJustif && (
                  <Alert
                    variant="danger"
                    title="Vérification requise"
                    onClose={() => setErreurJustif(null)}
                  >
                    {erreurJustif}
                  </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block space-y-1 text-xs font-semibold text-enp-blue-deep">
                    <span>Séance concernée *</span>
                    <select
                      value={seanceJustifId}
                      onChange={(e) =>
                        setSeanceJustifId(
                          e.target.value ? Number(e.target.value) : '',
                        )
                      }
                      required
                      className="w-full bg-white border border-enp-border px-3 py-2 text-xs text-enp-black min-h-[42px]"
                    >
                      <option value="">Sélectionnez une séance</option>
                      {presences.map((p) => (
                        <option key={p.seanceId} value={p.seanceId}>
                          {p.date} · {p.code} ({p.libelle})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1 text-xs font-semibold text-enp-blue-deep">
                    <span>Pièce jointe (PDF/image, 5 Mo max) *</span>
                    <input
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      onChange={handleSelectionFichier}
                      className="w-full bg-white border border-enp-border px-2.5 py-2 text-xs text-enp-black min-h-[42px]"
                    />
                    {fichierJustif && (
                      <span className="block text-[11px] text-enp-green-valid font-medium">
                        {fichierJustif.name} ({Math.max(1, Math.round(fichierJustif.size / 1024))} Ko)
                      </span>
                    )}
                  </label>
                </div>

                <label className="block space-y-1 text-xs font-semibold text-enp-blue-deep">
                  <span>Motif *</span>
                  <textarea
                    rows={2}
                    value={motifJustif}
                    onChange={(e) => setMotifJustif(e.target.value)}
                    placeholder="Ex : Consultation médicale, convocation administrative..."
                    required
                    className="w-full bg-white border border-enp-border px-3 py-2 text-xs text-enp-black"
                  />
                </label>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormulaireOuvert(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={envoiJustif}
                  >
                    Transmettre
                  </Button>
                </div>
              </form>
            )}

            {justificatifs.length > 0 && (
              <div className="divide-y divide-enp-border border border-enp-border">
                {justificatifs.map((justif) => (
                  <div
                    key={justif.id}
                    className="p-3 flex items-start justify-between gap-2 bg-white text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-enp-blue-deep truncate">
                        {justif.codeUe} · {justif.dateSeance}
                      </p>
                      <p className="text-enp-gray-dark">{justif.motif}</p>
                      <p className="text-[11px] font-mono text-enp-gray-medium truncate">
                        {justif.nomFichier}
                      </p>
                      {justif.commentaireValidation && (
                        <p className="text-[11px] text-enp-blue-primary">
                          {justif.commentaireValidation}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        justif.statut === 'valide'
                          ? 'success'
                          : justif.statut === 'refuse'
                            ? 'danger'
                            : 'warning'
                      }
                      className="shrink-0"
                    >
                      {LIBELLES_JUSTIFICATIF[justif.statut]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Historique des seances */}
          {presences.length === 0 ? (
            <div className="bg-white border border-enp-border p-8 text-center space-y-1.5">
              <CalendarCheck className="w-8 h-8 text-enp-gray-medium mx-auto opacity-40" />
              <p className="text-sm font-semibold text-enp-blue-deep">
                Aucun pointage enregistré
              </p>
              <p className="text-xs text-enp-gray-medium">
                Vos présences apparaîtront ici dès le premier appel.
              </p>
            </div>
          ) : (
            <section className="bg-white border border-enp-border overflow-hidden">
              {uesUniques.length > 1 && (
                <div className="px-3.5 py-2.5 border-b border-enp-border bg-enp-bg flex items-center gap-1.5 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setFiltreUe('toutes')}
                    className={`px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap transition-colors min-h-[34px] ${
                      filtreUe === 'toutes'
                        ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                        : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
                    }`}
                  >
                    Toutes ({presences.length})
                  </button>
                  {uesUniques.map(([code, intitule]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setFiltreUe(code)}
                      title={intitule}
                      className={`px-2.5 py-1.5 text-xs font-semibold border whitespace-nowrap transition-colors min-h-[34px] ${
                        filtreUe === code
                          ? 'bg-enp-blue-primary text-white border-enp-blue-primary'
                          : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              )}

              {/* Vue mobile native sans defilement horizontal */}
              <div className="block sm:hidden divide-y divide-enp-border">
                {presencesFiltrees.map((ligne) => (
                  <div
                    key={ligne.seanceId}
                    className="p-3.5 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-mono text-[11px] text-enp-gray-medium tabular-nums">
                        {ligne.code} · {ligne.date}
                      </p>
                      <p className="text-sm font-semibold text-enp-black truncate">
                        {ligne.intitule}
                      </p>
                      <p className="text-xs text-enp-gray-medium truncate">
                        {ligne.libelle}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <Badge variant={varianteStatut(ligne.statut)}>
                        {LIBELLES_STATUT[ligne.statut]}
                      </Badge>
                      {ligne.statut === 'absent' && (
                        <button
                          type="button"
                          onClick={() => ouvrirFormulaireJustificatif(ligne.seanceId)}
                          className="text-xs font-semibold text-enp-blue-primary hover:underline py-0.5"
                        >
                          Justifier
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Vue desktop / tablette */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-enp-blue-deep text-left text-white text-xs uppercase tracking-wider">
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">Unité d'Enseignement</th>
                      <th className="px-4 py-2.5 font-semibold">Séance</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-enp-border">
                    {presencesFiltrees.map((ligne) => (
                      <tr key={ligne.seanceId} className="hover:bg-enp-blue-ice/20">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-enp-black whitespace-nowrap tabular-nums">
                          {ligne.date}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-enp-blue-primary mr-2">
                            {ligne.code}
                          </span>
                          <span className="font-medium text-enp-black text-sm">
                            {ligne.intitule}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-enp-gray-dark text-sm">
                          {ligne.libelle}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            {ligne.statut === 'absent' && (
                              <button
                                type="button"
                                onClick={() => ouvrirFormulaireJustificatif(ligne.seanceId)}
                                className="text-xs font-semibold text-enp-blue-primary hover:underline"
                              >
                                Justifier
                              </button>
                            )}
                            <Badge variant={varianteStatut(ligne.statut)}>
                              {LIBELLES_STATUT[ligne.statut]}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
