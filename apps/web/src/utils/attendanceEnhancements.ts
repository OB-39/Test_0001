/**
 * Utilitaires metier purs pour les ameliorations d'assiduite ENP :
 * - Export CSV securise (UTF-8 BOM + neutralisation injection de formules Excel)
 * - Evaluation des seuils d'alerte d'absenteisme (20% vigilance, 30% critique)
 * - Validation stricte des pieces justificatives d'absence (MIME & taille)
 */

export interface LigneExportEmargement {
  matricule: string;
  nom: string;
  prenom: string;
  statut: string;
  horodatage?: string | null;
  methode?: string;
}

export interface MetadonneesExportEmargement {
  codeUe: string;
  intituleUe: string;
  libelleSeance: string;
  dateSeance: string;
  presents: number;
  inscrits: number;
}

export type NiveauAlerteAssiduite = 'normal' | 'vigilance' | 'critique';

export interface ResultatAlerteAssiduite {
  niveau: NiveauAlerteAssiduite;
  tauxAbsence: number;
  titre: string;
  message: string;
}

export const TYPES_MIME_JUSTIFICATIF_AUTORISES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const TAILLE_MAX_JUSTIFICATIF_OCTETS = 5 * 1024 * 1024; // 5 Mo

export interface ResultatValidationJustificatif {
  valide: boolean;
  erreur?: string;
}

/**
 * Neutralise les prefixes de formules tableur (=, +, -, @, tabulation, retour chariot)
 * puis echappe proprement au format RFC 4180 avec separateur point-virgule (standard FR Excel).
 */
export function echapperCelluleCsv(valeur: string | number | null | undefined): string {
  const brut = valeur === null || valeur === undefined ? '' : String(valeur);
  const nettoye = brut.replace(/\r?\n/g, ' ').trim();
  const protege = /^[=+\-@\t]/.test(nettoye) ? `'${nettoye}` : nettoye;
  const echappe = protege.replace(/"/g, '""');
  return `"${echappe}"`;
}

export function genererCsvEmargement(
  meta: MetadonneesExportEmargement,
  lignes: LigneExportEmargement[],
): string {
  const taux =
    meta.inscrits > 0 ? Math.round((meta.presents / meta.inscrits) * 100) : 0;

  const enTeteInstitution = [
    [echapperCelluleCsv('ÉCOLE NATIONALE POLYTECHNIQUE DE LOMÉ (ENP)'), echapperCelluleCsv("FEUILLE D'ÉMARGEMENT OFFICIELLE")],
    [echapperCelluleCsv("Unité d'enseignement"), echapperCelluleCsv(`${meta.codeUe} : ${meta.intituleUe}`)],
    [echapperCelluleCsv('Séance'), echapperCelluleCsv(meta.libelleSeance)],
    [echapperCelluleCsv('Date'), echapperCelluleCsv(meta.dateSeance)],
    [echapperCelluleCsv('Taux de présence'), echapperCelluleCsv(`${meta.presents} / ${meta.inscrits} (${taux}%)`)],
    [],
    [
      echapperCelluleCsv('Matricule'),
      echapperCelluleCsv('Nom'),
      echapperCelluleCsv('Prénom'),
      echapperCelluleCsv('Statut'),
      echapperCelluleCsv('Horodatage'),
      echapperCelluleCsv('Mode de validation'),
    ],
  ];

  const corps = lignes.map((ligne) => [
    echapperCelluleCsv(ligne.matricule),
    echapperCelluleCsv(ligne.nom),
    echapperCelluleCsv(ligne.prenom),
    echapperCelluleCsv(ligne.statut),
    echapperCelluleCsv(ligne.horodatage ?? '-'),
    echapperCelluleCsv(ligne.methode ?? 'Appel enseignant'),
  ]);

  const toutesLignes = [...enTeteInstitution, ...corps].map((cols) =>
    cols.join(';'),
  );

  // Prefix UTF-8 BOM pour ouverture directe avec accents sous Microsoft Excel
  return `\uFEFF${toutesLignes.join('\r\n')}\r\n`;
}

export function evaluerAlerteAssiduite(
  absentsNonJustifies: number,
  seancesMarquees: number,
): ResultatAlerteAssiduite {
  if (seancesMarquees <= 0 || absentsNonJustifies <= 0) {
    return {
      niveau: 'normal',
      tauxAbsence: 0,
      titre: 'Assiduité conforme',
      message: 'Aucune absence non justifiée enregistrée sur vos séances pointées.',
    };
  }

  const tauxAbsence = Math.round((absentsNonJustifies / seancesMarquees) * 100);

  if (tauxAbsence >= 30) {
    return {
      niveau: 'critique',
      tauxAbsence,
      titre: "Seuil critique d'absentéisme atteint",
      message: `Votre taux d'absences non justifiées atteint ${tauxAbsence}% (${absentsNonJustifies}/${seancesMarquees} séances). Déposez un justificatif ou contactez la scolarité sans délai.`,
    };
  }

  if (tauxAbsence >= 20) {
    return {
      niveau: 'vigilance',
      tauxAbsence,
      titre: 'Vigilance assiduité recommandée',
      message: `Votre taux d'absences non justifiées est de ${tauxAbsence}% (${absentsNonJustifies}/${seancesMarquees} séances). Au-delà de 30%, une alerte est transmise au chef de département.`,
    };
  }

  return {
    niveau: 'normal',
    tauxAbsence,
    titre: 'Assiduité satisfaisante',
    message: `Taux d'absence non justifiée inférieur au seuil de vigilance (${tauxAbsence}%).`,
  };
}

export function validerPieceJustificative(fichier: {
  name: string;
  type: string;
  size: number;
}): ResultatValidationJustificatif {
  const nom = (fichier.name || '').trim();
  if (!nom || nom.length > 180) {
    return {
      valide: false,
      erreur: 'Nom de fichier invalide (1 à 180 caractères attendus).',
    };
  }

  const typeAutorise = (
    TYPES_MIME_JUSTIFICATIF_AUTORISES as readonly string[]
  ).includes(fichier.type);
  if (!typeAutorise) {
    return {
      valide: false,
      erreur: 'Format non autorisé. Formats acceptés : PDF, JPG, PNG ou WebP.',
    };
  }

  if (fichier.size <= 0 || fichier.size > TAILLE_MAX_JUSTIFICATIF_OCTETS) {
    return {
      valide: false,
      erreur: 'Taille de fichier invalide (maximum 5 Mo autorisé).',
    };
  }

  return { valide: true };
}

export function telechargerCsv(nomFichier: string, contenuCsv: string): void {
  const nomNettoye = nomFichier.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = new Blob([contenuCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomNettoye.endsWith('.csv') ? nomNettoye : `${nomNettoye}.csv`;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
