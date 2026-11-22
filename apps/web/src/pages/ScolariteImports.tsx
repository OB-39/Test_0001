import { useState, useRef } from 'react';
import {
  Upload,
  Download,
  FileText,
  X,
  Users,
  BookOpen,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import { useConfirmation } from '@/components/useConfirmation';
import { PageHeader, Alert, Button } from '@/components/ui';
import type {
  ResultatImportUtilisateurs,
  ResultatImport,
  RapportImport,
  TypeImport,
} from '@/api/types';

const TAILLE_MAX = 2 * 1024 * 1024; // 2 Mo

// Modèles CSV simples et prêts à l'emploi
const MODELE_COMPTES = `matricule,email,nom,prenom,role,campus,departement
TEST-2026-001,student1@enp.tg,KOUDASSE,Joy,etudiant,ENP-CL,CPI
TEST-2026-002,delegue1@enp.tg,CHEF,Lina,delegue,ENP-CL,CPI
TEST-2026-003,prof.dupont@enp.tg,DUPONT,Jean,enseignant,ENP-CL,CPI
`;

const MODELES_ACADEMIQUES: Record<TypeImport, { label: string; colonnes: string; csv: string }> = {
  ue: {
    label: "Unités d'enseignement (UE)",
    colonnes: 'code, intitule, credits',
    csv: 'code,intitule,credits\nINF501,Algorithmique avancée,4\nMAT502,Probabilités et statistiques,3\n',
  },
  offres: {
    label: 'Offres de cours semestrielles',
    colonnes: 'ueCode, campus, departement, programme, anneeUniversitaire, semestre',
    csv: 'ueCode,campus,departement,programme,anneeUniversitaire,semestre\nINF501,ENP-CL,CPI,Cycle Préparatoire,2026-2027,1\n',
  },
  inscriptions: {
    label: 'Inscriptions des étudiants',
    colonnes: 'ueCode, campus, departement, programme, anneeUniversitaire, semestre, matricule',
    csv: 'ueCode,campus,departement,programme,anneeUniversitaire,semestre,matricule\nINF501,ENP-CL,CPI,Cycle Préparatoire,2026-2027,1,TEST-2026-001\n',
  },
  affectations: {
    label: 'Affectations enseignants',
    colonnes: 'ueCode, campus, departement, programme, anneeUniversitaire, semestre, matricule',
    csv: 'ueCode,campus,departement,programme,anneeUniversitaire,semestre,matricule\nINF501,ENP-CL,CPI,Cycle Préparatoire,2026-2027,1,TEST-1001\n',
  },
  delegues: {
    label: 'Mandats des délégués',
    colonnes: 'campus, departement, programme, matricule, anneeUniversitaire, type, debut, fin',
    csv: 'campus,departement,programme,matricule,anneeUniversitaire,type,debut,fin\nENP-CL,CPI,Cycle Préparatoire,TEST-0002,2026-2027,titulaire,2026-09-01,2027-06-30\n',
  },
  'mandats-chefs-departement': {
    label: 'Mandat des chefs de département',
    colonnes: 'campus, departement, matricule',
    csv: 'campus,departement,matricule\nENP-CL,CPI,TEST-CD-001\n',
  },
  etudiants: {
    label: 'Référentiel étudiants',
    colonnes: 'matricule, email, nom, prenom',
    csv: 'matricule,email,nom,prenom\nTEST-0001,kodjo.adjei@exemple.test,ADJEI,Kodjo\n',
  },
  enseignants: {
    label: 'Référentiel enseignants',
    colonnes: 'matricule, email, nom, prenom',
    csv: 'matricule,email,nom,prenom\nTEST-1001,mawuli.attiogbe@exemple.test,ATTIOGBE,Mawuli\n',
  },
  catalogue: {
    label: 'Catalogue Format 2 (XLSX)',
    colonnes: 'Classeur XLSX fourni par l’établissement',
    csv: '',
  },
  presences: {
    label: 'Présences du semestre (XLSX)',
    colonnes: 'Classeur XLSX de présences',
    csv: '',
  },
};

export function ScolariteImports() {
  const { confirmer } = useConfirmation();
  const [categorie, setCategorie] = useState<'comptes' | 'academique'>('comptes');
  const [typeAcademique, setTypeAcademique] = useState<TypeImport>('ue');
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succesMessage, setSuccesMessage] = useState<string | null>(null);
  const [erreursLignes, setErreursLignes] = useState<{ ligne: number; message: string }[]>([]);
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [resultatAcademique, setResultatAcademique] = useState<ResultatImport | null>(null);
  const [campus, setCampus] = useState('ENP-CL');
  const [departement, setDepartement] = useState('CPI');
  const [programme, setProgramme] = useState(
    'Cycle Préparatoire Intégré aux Études d’Ingénieur',
  );
  const [anneeUniversitaire, setAnneeUniversitaire] = useState('2026-2027');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importXlsx =
    categorie === 'academique' &&
    (typeAcademique === 'catalogue' || typeAcademique === 'presences');

  // Télécharger le modèle CSV adapté
  function telechargerModele() {
    const contenu =
      categorie === 'comptes'
        ? MODELE_COMPTES
        : MODELES_ACADEMIQUES[typeAcademique].csv;
    if (!contenu) return;
    const nomFichier =
      categorie === 'comptes'
        ? 'modele-comptes-utilisateurs.csv'
        : `modele-${typeAcademique}.csv`;

    const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.click();
    URL.revokeObjectURL(url);
  }

  // Sélection de fichier
  function handleFile(f: File) {
    setErreur(null);
    setSuccesMessage(null);
    setErreursLignes([]);
    setRapport(null);
    setResultatAcademique(null);

    const extensionValide = f.name.toLowerCase().endsWith(importXlsx ? '.xlsx' : '.csv');
    if (!extensionValide) {
      setErreur(`Veuillez sélectionner un fichier au format ${importXlsx ? 'XLSX' : 'CSV'} uniquement.`);
      return;
    }
    if (f.size > TAILLE_MAX) {
      setErreur('Le fichier est trop volumineux (maximum 2 Mo).');
      return;
    }
    setFichier(f);
  }

  // Traitement du drop
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }

  // Déclencher l'importation
  async function lancerImport() {
    if (!fichier) return;

    setEnCours(true);
    setErreur(null);
    setSuccesMessage(null);
    setErreursLignes([]);

    try {
      if (categorie === 'comptes') {
        const res: ResultatImportUtilisateurs = await api.scolariteImporterUtilisateurs(fichier);
        if (res.errorCount === 0) {
          setSuccesMessage(
            `Importation réussie ! ${res.successCount} compte(s) créé(s) ou mis à jour.`
          );
        } else {
          setSuccesMessage(
            `${res.successCount} compte(s) créé(s) avec succès. ${res.errorCount} ligne(s) rejetée(s).`
          );
          setErreursLignes(res.errors.map((e) => ({ ligne: e.ligne, message: e.erreur })));
        }
      } else {
        const contexte = importXlsx
          ? {
              campus,
              departement,
              programme,
              ...(typeAcademique === 'catalogue' ? { anneeUniversitaire } : {}),
            }
          : undefined;
        const rapport = await api.scolariteVerifierImport(
          typeAcademique,
          fichier,
          contexte,
        );
        setRapport(rapport);
        setErreursLignes(rapport.erreurs);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErreur(err.messages.join(' '));
      } else {
        setErreur("Une erreur est survenue lors de l'importation du fichier.");
      }
    } finally {
      setEnCours(false);
    }
  }

  async function appliquerImport() {
    if (!rapport) return;
    const confirme = await confirmer({
      title: 'Appliquer cet import ?',
      message: `Les ${rapport.lignesValides} ligne(s) validées sur ${rapport.lignesTotal} seront écrites dans les données académiques. Cette opération peut modifier plusieurs comptes, cours, inscriptions ou présences.`,
      confirmLabel: 'Appliquer les modifications',
      variant: 'warning',
    });
    if (!confirme) return;
    setEnCours(true);
    setErreur(null);
    try {
      const resultat = await api.scolariteValiderImport(
        typeAcademique,
        rapport.importId,
      );
      setResultatAcademique(resultat);
      setSuccesMessage(
        `Importation réussie : ${resultat.crees} entrée(s) créée(s), ${resultat.misAJour} mise(s) à jour.`,
      );
      setRapport(null);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(' ')
          : "Une erreur est survenue lors de l'application de l'import.",
      );
    } finally {
      setEnCours(false);
    }
  }

  // Réinitialiser le formulaire
  function reinitialiser() {
    setFichier(null);
    setErreur(null);
    setSuccesMessage(null);
    setErreursLignes([]);
    setRapport(null);
    setResultatAcademique(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-5 animate-fade-in pb-6">
      <PageHeader
        title="Importation de fichiers"
        description="Chargez des comptes ou des données académiques via CSV ou classeur XLSX."
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Imports' },
        ]}
      />

      {/* Carte principale */}
      <div className="bg-white border border-enp-border p-4 sm:p-6 space-y-5">
        {/* Étape 1 : Choix de la catégorie */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-enp-blue-deep">
            1. Type de données
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setCategorie('comptes');
                reinitialiser();
              }}
              className={`p-3.5 text-left border flex items-center gap-3 transition-colors min-h-[56px] ${
                categorie === 'comptes'
                  ? 'border-enp-blue-primary bg-enp-blue-ice/60 text-enp-blue-deep font-semibold'
                  : 'border-enp-border bg-white text-enp-black hover:bg-slate-50'
              }`}
            >
              <Users className="w-5 h-5 text-enp-blue-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">Comptes utilisateurs</p>
                <p className="text-[11px] text-enp-gray-medium font-normal">Étudiants, enseignants, délégués</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategorie('academique');
                reinitialiser();
              }}
              className={`p-3.5 text-left border flex items-center gap-3 transition-colors min-h-[56px] ${
                categorie === 'academique'
                  ? 'border-enp-blue-primary bg-enp-blue-ice/60 text-enp-blue-deep font-semibold'
                  : 'border-enp-border bg-white text-enp-black hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-5 h-5 text-enp-blue-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold">Données académiques</p>
                <p className="text-[11px] text-enp-gray-medium font-normal">UE, offres, inscriptions, présences</p>
              </div>
            </button>
          </div>
        </div>

        {/* Sous-choix si données académiques */}
        {categorie === 'academique' && (
          <div className="space-y-1.5 p-3.5 bg-enp-bg border border-enp-border animate-fade-in">
            <label htmlFor="select-type" className="block text-xs font-semibold text-enp-blue-deep">
              Élément académique
            </label>
            <select
              id="select-type"
              value={typeAcademique}
              onChange={(e) => {
                setTypeAcademique(e.target.value as TypeImport);
                reinitialiser();
              }}
              className="w-full text-xs p-2 bg-white border border-enp-border text-enp-black focus:border-enp-blue-primary focus:outline-none"
            >
              {Object.entries(MODELES_ACADEMIQUES).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label} ({info.colonnes})
                </option>
              ))}
            </select>
          </div>
        )}

        {importXlsx && (
          <div className="grid gap-3 border border-enp-border bg-enp-blue-ice/40 p-3.5 sm:grid-cols-2">
            <label className="text-xs font-bold text-enp-blue-deep">
              Campus
              <input value={campus} onChange={(event) => setCampus(event.target.value)} className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm font-normal" required />
            </label>
            <label className="text-xs font-bold text-enp-blue-deep">
              Département
              <input value={departement} onChange={(event) => setDepartement(event.target.value)} className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm font-normal" required />
            </label>
            <label className="text-xs font-bold text-enp-blue-deep sm:col-span-2">
              Programme
              <input value={programme} onChange={(event) => setProgramme(event.target.value)} className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm font-normal" required />
            </label>
            {typeAcademique === 'catalogue' && (
              <label className="text-xs font-bold text-enp-blue-deep">
                Année universitaire
                <input value={anneeUniversitaire} onChange={(event) => setAnneeUniversitaire(event.target.value)} pattern="\\d{4}-\\d{4}" className="mt-1 block w-full border border-enp-border bg-white px-3 py-2 text-sm font-normal" required />
              </label>
            )}
            <p className="text-[11px] text-enp-gray-medium sm:col-span-2">
              Le campus doit correspondre à votre périmètre Scolarité. Les enseignants sont rapprochés par e-mail; aucun compte n’est créé. Pour les présences, appliquez d’abord le catalogue et vérifiez les inscriptions à l’UE.
            </p>
          </div>
        )}

        {/* Étape 2 : Zone de dépôt du fichier */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-enp-blue-deep">
              2. Fichier {categorie === 'comptes' || !importXlsx ? 'CSV' : 'XLSX'}
            </span>
            {!importXlsx && (
              <button
                type="button"
                onClick={telechargerModele}
                className="text-xs text-enp-blue-primary hover:underline font-medium inline-flex items-center gap-1 py-1"
              >
                <Download className="w-3.5 h-3.5" />
                Modèle CSV
              </button>
            )}
          </div>

          {fichier ? (
            <div className="p-3.5 bg-enp-blue-ice/60 border border-enp-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-6 h-6 text-enp-blue-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-enp-blue-deep truncate">{fichier.name}</p>
                  <p className="text-[11px] text-enp-gray-medium">
                    {(fichier.size / 1024).toFixed(1)} Ko • Prêt pour import
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={reinitialiser}
                className="text-enp-gray-medium hover:text-enp-red-error p-1 transition-colors"
                title="Retirer le fichier"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 border-2 border-dashed text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-enp-blue-ice/30 ${
                isDragOver ? 'border-enp-blue-primary bg-enp-blue-ice' : 'border-enp-border'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={importXlsx ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <Upload className="w-7 h-7 text-enp-gray-medium mx-auto mb-2 opacity-70" />
              <p className="text-xs font-semibold text-enp-blue-deep">
                Glissez votre fichier {importXlsx ? 'XLSX' : 'CSV'} ici
              </p>
              <p className="text-[11px] text-enp-gray-medium mt-0.5">
                ou <span className="text-enp-blue-primary underline">parcourez votre ordinateur</span>
              </p>
            </div>
          )}
        </div>

        {/* Message d'erreur global */}
        {erreur && (
          <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
            {erreur}
          </Alert>
        )}

        {/* Message de succès */}
        {succesMessage && (
          <Alert variant="success" title="Importation" onClose={() => setSuccesMessage(null)}>
            {succesMessage}
          </Alert>
        )}

        {/* Tableau épuré des lignes en erreur si présent */}
        {erreursLignes.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-enp-border">
            <p className="text-xs font-semibold text-enp-red-error">
              Lignes rejetées ({erreursLignes.length})
            </p>
            <div className="border border-enp-border text-xs max-h-40 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-enp-red-light/60 border-b border-enp-border text-left">
                  <tr>
                    <th className="px-2.5 py-1.5 w-16">Ligne</th>
                    <th className="px-2.5 py-1.5">Problème</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-enp-border">
                  {erreursLignes.map((err, i) => (
                    <tr key={i}>
                      <td className="px-2.5 py-1.5 font-mono tabular-nums font-semibold text-enp-red-error">
                        #{err.ligne}
                      </td>
                      <td className="px-2.5 py-1.5 text-enp-black">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {rapport && (
          <section className="space-y-2.5 border-t border-enp-border pt-3" aria-live="polite">
            <h2 className="text-sm font-semibold text-enp-blue-deep">Rapport de vérification</h2>
            <p className="text-xs text-enp-gray-medium tabular-nums">
              {rapport.lignesValides} ligne(s) valide(s) sur {rapport.lignesTotal}.
            </p>
            {rapport.avertissements?.map((avertissement, index) => (
              <p key={`${avertissement.ligne}-${index}`} className="text-xs text-amber-700">
                Ligne {avertissement.ligne} : {avertissement.message}
              </p>
            ))}
            <Button
              type="button"
              variant="success"
              className="w-full min-h-[44px]"
              disabled={enCours || rapport.lignesValides === 0}
              isLoading={enCours}
              onClick={() => void appliquerImport()}
            >
              Confirmer et appliquer les lignes valides
            </Button>
          </section>
        )}

        {resultatAcademique && (
          <p className="text-xs text-enp-green-valid tabular-nums" role="status">
            Import appliqué : {resultatAcademique.crees} création(s), {resultatAcademique.misAJour} mise(s) à jour.
          </p>
        )}

        {/* Bouton d'action principal */}
        <div className="pt-1">
          <Button
            type="button"
            variant="primary"
            className="w-full min-h-[44px]"
            disabled={!fichier || enCours || (categorie === 'academique' && !!rapport)}
            isLoading={enCours}
            leftIcon={<Upload className="w-4 h-4" />}
            onClick={() => void lancerImport()}
          >
            {categorie === 'academique' ? 'Vérifier le fichier' : 'Importer le fichier'}
          </Button>
        </div>
      </div>
    </div>
  );
}
