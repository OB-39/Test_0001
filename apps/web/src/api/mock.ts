import type {
  CorpsActivation,
  CorpsConnexion,
  BulletinEnvoye,
  JetonVote,
  Questionnaire,
  ReponseConnexion,
  ReponseLogin,
  ReponseSimple,
  ResultatUe,
  ResultatUeResume,
  ResultatSection,
  Role,
  Seance,
  SeanceEntree,
  UeAEvaluer,
  UeCahier,
  Avancement,
  Campagne,
  ParticipationUe,
  Synthese,
  LigneSynthese,
  SuitesDonnees,
  CampagneGestion,
  CampagneCommentaire,
  CampagneEntreeGestion,
  DepartementOption,
  ProgrammeScolarite,
  UniteEnseignementScolarite,
  ResultatCodes,
  CodeActivationGenere,
  CommentaireAModerer,
  TableauDeBordScolarite,
  RestitutionEntree,
  Restitution,
  RapportImport,
  ErreurImport,
  ResultatImport,
  TypeImport,
  UtilisateurSession,
  CompteAdministration,
  ReferentielsAdministration,
  ResultatImportUtilisateurs,
  PeriodeDirection,
  StatistiquesDirection,
  ControlesAcademiques,
  CoursDossier,
  CahierNotes,
  EntreeEvaluation,
  EntreeNote,
  EntreePresence,
  EvaluationDossier,
  NoteEtudiant,
  PresencesEtudiant,
  ArriveePresenceRecente,
  SessionQrPresence,
  ResultatScanPresence,
  JustificatifAbsence,
  SoumissionJustificatif,
  StatutJustificatif,
  SeancePresence,
  DetailSeancePresence,
  StatutPresenceEtudiant,
  ArchiveAnnuelle,
  Notification,
  PieceJointe,
  VersionSeance,
  LigneAudit,
  CategorieAudit,
  GraviteAudit,
  FiltresAuditForensic,
  RapportIntegriteAudit,
} from "./types";
import { ApiError } from "./error";
import {
  DUREE_ROTATION_MS,
  evaluerReglesScan,
  formaterHeureCourte,
  genererJetonPresenceClient,
  parserJetonPresence,
} from "../utils/qrPresenceToken";
import {
  calculerHashEntreeAudit,
  filtrerLignesAudit,
  GENESIS_AUDIT_HASH,
  scellerChaineAudit,
  verifierIntegriteChaineAudit,
} from "../utils/auditForensic";
import { collecterTelemetrieMachine } from "../utils/forensicTelemetry";

/* ------------------------------------------------------------------ */
/*  Comptes de démonstration                                           */
/* ------------------------------------------------------------------ */

interface CompteInterne extends UtilisateurSession {
  identifiant: string;
  email?: string;
  motDePasse: string;
  altMotDePasse?: string;
}

const COMPTES: CompteInterne[] = [
  {
    id: 1001,
    nom: "Benali",
    prenom: "Amine",
    identifiant: "DEMO-ETU",
    email: "student1@enp.tg",
    roles: ["etudiant"],
    activeRole: "etudiant",
    motDePasse: "demo-etudiant-2026",
    altMotDePasse: "Enp2026!Etudiant",
  },
  {
    id: 1002,
    nom: "Cherif",
    prenom: "Lina",
    identifiant: "DEMO-DEL",
    email: "delegue1@enp.tg",
    roles: ["delegue", "etudiant"],
    activeRole: "delegue",
    motDePasse: "demo-delegue-2026",
    altMotDePasse: "Enp2026!Delegue",
  },
  {
    id: 1003,
    nom: "Hamidi",
    prenom: "Karim",
    identifiant: "DEMO-ENS",
    email: "prof.dupont@enp.tg",
    roles: ["enseignant"],
    activeRole: "enseignant",
    motDePasse: "demo-enseignant-2026",
    altMotDePasse: "Enp2026!Prof",
  },
  {
    id: 1004,
    nom: "Saidi",
    prenom: "Nora",
    identifiant: "DEMO-CHEF",
    email: "chef.gc@enp.tg",
    roles: ["chef_departement"],
    activeRole: "chef_departement",
    motDePasse: "demo-chef-2026",
    altMotDePasse: "Enp2026!Chef",
  },
  {
    id: 1005,
    nom: "Mokrani",
    prenom: "Yacine",
    identifiant: "DEMO-SCO",
    email: "scolarite@enp.tg",
    roles: ["scolarite"],
    activeRole: "scolarite",
    motDePasse: "demo-scolarite-2026",
    altMotDePasse: "Enp2026!Scolarite",
  },
  {
    id: 1006,
    nom: "Amavi",
    prenom: "Afi",
    identifiant: "DEMO-DIR",
    email: "direction@enp.tg",
    roles: ["directeur_general"],
    activeRole: "directeur_general",
    motDePasse: "demo-direction-2026",
    altMotDePasse: "Enp2026!Direction",
  },
  {
    id: 1007,
    nom: "Administrateur",
    prenom: "Demo",
    identifiant: "DEMO-ADMIN",
    email: "admin@enp.tg",
    roles: ["admin"],
    activeRole: "admin",
    motDePasse: "demo-admin-2026",
    altMotDePasse: "Enp2026!Admin",
  },
  {
    id: 1008,
    nom: "Koffi",
    prenom: "Edem",
    identifiant: "DEMO-CAMPUS",
    email: "directeur.campus@enp.tg",
    roles: ["directeur_campus"],
    activeRole: "directeur_campus",
    motDePasse: "demo-campus-2026",
    altMotDePasse: "Enp2026!Campus",
  },
];

/* ------------------------------------------------------------------ */
/*  État en mémoire : tentatives échouées et session simulée           */
/* ------------------------------------------------------------------ */

const tentatives: Map<string, number> = new Map();
const LIMITE_TENTATIVES = 5;
const DUREE_VERROU_MS = 15 * 60 * 1000;
const verrouillages: Map<string, number> = new Map();

let sessionMemoire: ReponseConnexion | null = null;
const archivesMemoire: ArchiveAnnuelle[] = [];
let adresseEmailEnAttente: { userId: number; email: string } | null = null;

/* ------------------------------------------------------------------ */
/*  Données simulées : UE et questionnaire                             */
/* ------------------------------------------------------------------ */

const CAMPAGNE_ID = 1;
const FIN_CAMPAGNE = "2026-11-15T23:59:59Z";

const ueMemoire: UeAEvaluer[] = [
  {
    ueId: 201,
    code: "INF501",
    intitule: "Algorithmique avancée",
    etat: "a_faire",
    campagneId: CAMPAGNE_ID,
    finCampagne: FIN_CAMPAGNE,
  },
  {
    ueId: 202,
    code: "MAT502",
    intitule: "Probabilités et statistiques",
    etat: "a_faire",
    campagneId: CAMPAGNE_ID,
    finCampagne: FIN_CAMPAGNE,
  },
  {
    ueId: 203,
    code: "INF503",
    intitule: "Bases de données",
    etat: "terminee",
    campagneId: CAMPAGNE_ID,
    finCampagne: FIN_CAMPAGNE,
  },
  {
    ueId: 204,
    code: "ELN504",
    intitule: "Électronique numérique",
    etat: "a_faire",
    campagneId: CAMPAGNE_ID,
    finCampagne: FIN_CAMPAGNE,
  },
  {
    ueId: 205,
    code: "MEC505",
    intitule: "Mécanique des fluides",
    etat: "a_faire",
    campagneId: CAMPAGNE_ID,
    finCampagne: FIN_CAMPAGNE,
  },
  {
    ueId: 206,
    code: "INF506",
    intitule: "Réseaux et protocoles",
    etat: "terminee",
    campagneId: CAMPAGNE_ID,
    finCampagne: FIN_CAMPAGNE,
  },
  {
    ueId: 207,
    code: "ANG507",
    intitule: "Anglais scientifique",
    etat: "a_faire",
    campagneId: CAMPAGNE_ID,
    finCampagne: FIN_CAMPAGNE,
  },
];

const QUESTIONNAIRE: Questionnaire = {
  versionId: 1,
  sections: [
    {
      code: "A",
      titre: "Organisation et contenu de l'enseignement",
      criteres: [
        {
          id: 1,
          code: "A1",
          libelle:
            "Les objectifs de l'UE ont été clairement présentés en début de semestre",
        },
        {
          id: 2,
          code: "A2",
          libelle: "Le contenu enseigné correspondait au syllabus communiqué",
        },
        {
          id: 3,
          code: "A3",
          libelle:
            "La progression des séances était cohérente et bien structurée",
        },
        {
          id: 4,
          code: "A4",
          libelle:
            "La charge de travail demandée était adaptée au nombre de crédits de l'UE",
        },
        {
          id: 5,
          code: "A5",
          libelle:
            "Les liens avec les autres UE du semestre étaient explicites",
        },
      ],
    },
    {
      code: "B",
      titre: "Qualité pédagogique de l'enseignant",
      criteres: [
        {
          id: 6,
          code: "B1",
          libelle: "Les explications étaient claires et compréhensibles",
        },
        {
          id: 7,
          code: "B2",
          libelle:
            "L'enseignant était disponible et accessible en dehors des séances",
        },
        {
          id: 8,
          code: "B3",
          libelle:
            "L'enseignant répondait de façon satisfaisante aux questions posées",
        },
        {
          id: 9,
          code: "B4",
          libelle:
            "Les supports pédagogiques (polycopiés, diapositives, exercices) étaient utiles et de qualité",
        },
        {
          id: 10,
          code: "B5",
          libelle:
            "Le rythme des séances permettait une bonne assimilation du contenu",
        },
      ],
    },
    {
      code: "C",
      titre: "Évaluation et retour pédagogique",
      criteres: [
        {
          id: 11,
          code: "C1",
          libelle:
            "Les modalités d'évaluation avaient été clairement communiquées en début de semestre",
        },
        {
          id: 12,
          code: "C2",
          libelle:
            "Les épreuves étaient cohérentes avec le contenu réellement enseigné",
        },
        {
          id: 13,
          code: "C3",
          libelle:
            "Les corrections et les résultats ont été communiqués dans un délai raisonnable",
        },
        {
          id: 14,
          code: "C4",
          libelle:
            "Les retours reçus ont permis de comprendre mes erreurs et de progresser",
        },
      ],
    },
    {
      code: "D",
      titre: "Moyens et conditions matérielles",
      criteres: [
        {
          id: 15,
          code: "D1",
          libelle:
            "Les salles de cours/TD étaient adaptées (capacité, confort, équipement)",
        },
        {
          id: 16,
          code: "D2",
          libelle:
            "Les équipements de travaux pratiques étaient suffisants et fonctionnels",
        },
        {
          id: 17,
          code: "D3",
          libelle:
            "Les ressources numériques (plateforme, documents en ligne) étaient accessibles",
        },
      ],
    },
    {
      code: "E",
      titre: "Appréciation globale",
      criteres: [
        {
          id: 18,
          code: "E1",
          libelle:
            "De façon générale, je suis satisfait(e) de cette unité d'enseignement",
        },
        {
          id: 19,
          code: "E2",
          libelle:
            "Je recommanderais cette UE, telle qu'enseignée, à un autre étudiant",
        },
      ],
    },
  ],
  commentaires: [
    { type: "points_forts", libelle: "Points forts de l'enseignement" },
    { type: "points_a_ameliorer", libelle: "Points à améliorer / suggestions" },
  ],
};

const jetonsUtilises: Set<string> = new Set();
const jetonsEmis: Map<number, string> = new Map(); // ueId → jeton
const codesReinitialisation: Map<number, { code: string; expireLe: number }> =
  new Map();

/* ------------------------------------------------------------------ */
/*  Utilitaires                                                        */
/* ------------------------------------------------------------------ */

const DELAI = 300;

function delai(ms = DELAI): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trouverCompte(identifiant: string): CompteInterne | undefined {
  const id = identifiant.trim().toUpperCase();
  return COMPTES.find(
    (c) =>
      c.identifiant.toUpperCase() === id ||
      (c.email && c.email.toUpperCase() === id),
  );
}

function cle(identifiant: string): string {
  return identifiant.trim().toUpperCase();
}

function estVerrouille(id: string): boolean {
  const jusqu = verrouillages.get(cle(id));
  if (!jusqu) return false;
  if (Date.now() >= jusqu) {
    verrouillages.delete(cle(id));
    tentatives.delete(cle(id));
    return false;
  }
  return true;
}

function minutesRestantes(id: string): number {
  const jusqu = verrouillages.get(cle(id));
  if (!jusqu) return 15;
  return Math.max(1, Math.ceil((jusqu - Date.now()) / 60000));
}

function fabriquerReponse(compte: CompteInterne): ReponseConnexion {
  return {
    accessToken: `mock-token-${compte.id}-${Date.now()}`,
    expiresIn: 900,
    utilisateur: {
      id: compte.id,
      nom: compte.nom,
      prenom: compte.prenom,
      email: compte.email,
      identifiant: compte.identifiant,
      roles: [...compte.roles] as Role[],
      activeRole: compte.roles[0] as Role,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  API publique : signatures identiques à src/api/client.ts           */
/* ------------------------------------------------------------------ */

export async function connexion(corps: CorpsConnexion): Promise<ReponseLogin> {
  await delai();
  const { identifiant, motDePasse } = corps;

  if (!identifiant || !motDePasse) {
    throw new ApiError({
      message: "Identifiant et mot de passe requis.",
      statusCode: 400,
    });
  }

  if (estVerrouille(identifiant)) {
    throw new ApiError({
      message: `Trop de tentatives echouees. Reessayez dans ${minutesRestantes(identifiant)} minute(s).`,
      statusCode: 429,
    });
  }

  const compte = trouverCompte(identifiant);
  const mdpValide =
    compte &&
    (compte.motDePasse === motDePasse ||
      (compte.altMotDePasse && compte.altMotDePasse === motDePasse));

  if (!compte || !mdpValide) {
    const k = cle(identifiant);
    const nb = (tentatives.get(k) ?? 0) + 1;
    tentatives.set(k, nb);
    if (nb >= LIMITE_TENTATIVES) {
      verrouillages.set(k, Date.now() + DUREE_VERROU_MS);
      throw new ApiError({
        message: "Trop de tentatives echouees. Reessayez dans 15 minute(s).",
        statusCode: 429,
      });
    }
    throw new ApiError({
      message: "Identifiant ou mot de passe incorrect.",
      statusCode: 401,
    });
  }

  tentatives.delete(cle(identifiant));
  verrouillages.delete(cle(identifiant));
  const rep = fabriquerReponse(compte);
  sessionMemoire = rep;
  enregistrerAuditMock({
    userId: compte.id,
    userMatricule: compte.identifiant,
    userNomComplet: `${compte.prenom} ${compte.nom}`,
    userRole: compte.activeRole,
    categorie: "authentification",
    gravite: compte.activeRole === "admin" || compte.activeRole === "directeur_general" ? "sensible" : "info",
    action: "CONNEXION_PORTAIL",
    methodeHttp: "POST",
    cheminHttp: "/api/v1/auth/login",
    statutHttp: 200,
    objet: "Session portail ENP",
    detail: `Authentification réussie (${compte.activeRole})`,
  });
  return rep;
}

export async function rafraichir(): Promise<ReponseConnexion> {
  await delai();
  if (!sessionMemoire) {
    throw new ApiError({ message: "Session expirée.", statusCode: 401 });
  }
  const rep: ReponseConnexion = {
    accessToken: `mock-token-${sessionMemoire.utilisateur.id}-${Date.now()}`,
    expiresIn: 900,
    utilisateur: sessionMemoire.utilisateur,
  };
  sessionMemoire = rep;
  return rep;
}

export async function deconnexion(): Promise<ReponseSimple> {
  await delai();
  if (sessionMemoire) {
    const u = sessionMemoire.utilisateur;
    enregistrerAuditMock({
      userId: u.id,
      userMatricule: u.identifiant ?? `USR-${u.id}`,
      userNomComplet: `${u.prenom} ${u.nom}`,
      userRole: u.activeRole,
      categorie: "authentification",
      gravite: "info",
      action: "DECONNEXION_PORTAIL",
      methodeHttp: "POST",
      cheminHttp: "/api/v1/auth/logout",
      statutHttp: 200,
      objet: "Session portail ENP",
      detail: "Déconnexion volontaire de l'utilisateur",
    });
  }
  sessionMemoire = null;
  return { ok: true };
}

export async function activation(
  corps: CorpsActivation,
): Promise<ReponseSimple> {
  await delai();
  const { identifiant, codeActivation, motDePasse } = corps;

  const erreurs: string[] = [];
  if (!identifiant) erreurs.push("L'identifiant est requis.");
  if (!codeActivation || codeActivation.length < 6)
    erreurs.push("Le code d'activation est invalide.");
  if (!motDePasse || motDePasse.length < 12)
    erreurs.push("Le mot de passe doit comporter au moins 12 caractères.");

  if (erreurs.length > 0) {
    throw new ApiError({ message: erreurs, statusCode: 400 });
  }

  return { ok: true };
}

export async function verifierMfa(_corps?: {
  challengeId: string;
  method: "email" | "totp";
  code: string;
  rememberDevice?: boolean;
}): Promise<ReponseConnexion> {
  void _corps;
  throw new ApiError({
    message: "MFA indisponible en mode démonstration.",
    statusCode: 400,
  });
}

export async function demanderReinitialisation(
  identifiant: string,
): Promise<ReponseSimple> {
  await delai();
  const compte = trouverCompte(identifiant);
  if (compte) {
    codesReinitialisation.set(compte.id, {
      code: "123456",
      expireLe: Date.now() + 30 * 60 * 1000,
    });
  }
  return { ok: true };
}

export async function confirmerReinitialisation(corps: {
  identifiant: string;
  code: string;
  motDePasse: string;
}): Promise<ReponseSimple> {
  await delai();
  const compte = trouverCompte(corps.identifiant);
  const demande = compte ? codesReinitialisation.get(compte.id) : undefined;
  if (
    !compte ||
    !demande ||
    demande.expireLe <= Date.now() ||
    demande.code !== corps.code ||
    corps.motDePasse.length < 12 ||
    corps.motDePasse.length > 200
  ) {
    throw new ApiError({
      message: "Identifiant ou code de réinitialisation invalide ou expiré.",
      statusCode: 400,
    });
  }
  compte.motDePasse = corps.motDePasse;
  compte.altMotDePasse = undefined;
  codesReinitialisation.delete(compte.id);
  if (sessionMemoire?.utilisateur.id === compte.id) sessionMemoire = null;
  return { ok: true };
}

export async function changerMotDePasse(_corps: {
  motDePasseActuel: string;
  nouveauMotDePasse: string;
}): Promise<ReponseSimple> {
  void _corps;
  await delai();
  return { ok: true };
}

export async function demanderChangementEmail(corps: {
  nouvelleAdresse: string;
  motDePasseActuel: string;
}): Promise<ReponseSimple> {
  await delai();
  const session = sessionMemoire;
  if (!session) {
    throw new ApiError({ message: "Session expirée.", statusCode: 401 });
  }
  const compte = COMPTES.find((c) => c.id === session.utilisateur.id);
  if (!compte || compte.motDePasse !== corps.motDePasseActuel) {
    throw new ApiError({
      message: "Mot de passe actuel incorrect.",
      statusCode: 401,
    });
  }
  const email = corps.nouvelleAdresse.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError({
      message: "Adresse e-mail invalide.",
      statusCode: 400,
    });
  }
  adresseEmailEnAttente = { userId: compte.id, email };
  return { ok: true };
}

export async function confirmerChangementEmail(
  code: string,
): Promise<ReponseSimple> {
  await delai();
  if (
    !sessionMemoire ||
    adresseEmailEnAttente?.userId !== sessionMemoire.utilisateur.id ||
    code !== "123456"
  ) {
    throw new ApiError({
      message: "Code de vérification invalide ou expiré.",
      statusCode: 400,
    });
  }
  adresseEmailEnAttente = null;
  sessionMemoire = null;
  return { ok: true };
}

export async function changerProfil(role: Role): Promise<ReponseConnexion> {
  await delai();
  if (!sessionMemoire || !sessionMemoire.utilisateur.roles.includes(role)) {
    throw new ApiError({
      message: "Profil non attribué à ce compte.",
      statusCode: 403,
    });
  }
  sessionMemoire = {
    ...sessionMemoire,
    accessToken: `mock-token-${sessionMemoire.utilisateur.id}-${Date.now()}`,
    utilisateur: { ...sessionMemoire.utilisateur, activeRole: role },
  };
  return sessionMemoire;
}

export async function preparerMfaTotp(): Promise<{
  secret: string;
  otpauthUrl: string;
}> {
  await delai();
  return {
    secret: "DEMOSECRET12345678",
    otpauthUrl: "otpauth://totp/ENP:demo?secret=DEMOSECRET12345678",
  };
}

export async function statutMfa(): Promise<{ totpActive: boolean }> {
  await delai();
  return { totpActive: false };
}

export async function verifierMfaTotp(): Promise<ReponseSimple> {
  await delai();
  return { ok: true };
}

export async function desactiverMfaTotp(): Promise<ReponseSimple> {
  await delai();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Évaluation des enseignements : signatures identiques à client.ts   */
/* ------------------------------------------------------------------ */

export async function listeEvaluations(): Promise<UeAEvaluer[]> {
  await delai();
  return ueMemoire.map((u) => ({ ...u }));
}

export async function questionnaire(
  campagneId: number,
): Promise<Questionnaire> {
  await delai();
  if (campagneId !== CAMPAGNE_ID) {
    throw new ApiError({ message: "Campagne introuvable.", statusCode: 404 });
  }
  return JSON.parse(JSON.stringify(QUESTIONNAIRE)) as Questionnaire;
}

export async function obtenirJeton(
  ueId: number,
  campagneId: number,
): Promise<JetonVote> {
  await delai();
  const ue = ueMemoire.find((u) => u.ueId === ueId);
  if (!ue || ue.campagneId !== campagneId) {
    throw new ApiError({
      message: "Vous n'êtes pas inscrit à cette UE ou la campagne est fermée.",
      statusCode: 403,
    });
  }
  if (ue.etat === "terminee") {
    throw new ApiError({
      message: "Vous avez déjà participé à l'évaluation de cette UE.",
      statusCode: 409,
    });
  }
  const existant = jetonsEmis.get(ueId);
  if (existant) {
    return { jeton: existant, expireDans: 600 };
  }
  const jeton = `vote-${ueId}-${Date.now().toString(36)}`;
  jetonsEmis.set(ueId, jeton);
  return { jeton, expireDans: 600 };
}

/**
 * Mock de l'envoi de bulletin : SÉPARÉ du client authentifié.
 * Marque l'UE comme « terminée » dans la liste simulée.
 */
export async function envoyerBulletinMock(
  bulletin: BulletinEnvoye,
): Promise<ReponseSimple> {
  await delai();
  const jeton = bulletin.jeton;
  if (jetonsUtilises.has(jeton)) {
    throw new ApiError({
      message: "Ce jeton a déjà été utilisé.",
      statusCode: 409,
    });
  }
  jetonsUtilises.add(jeton);
  for (const [ueId, j] of jetonsEmis) {
    if (j === jeton) {
      const ue = ueMemoire.find((u) => u.ueId === ueId);
      if (ue) ue.etat = "terminee";
      jetonsEmis.delete(ueId);
      break;
    }
  }
  return { ok: true };
}

/* ================================================================== */
/*  DONNÉES SIMULÉES : Résultats (enseignant)                          */
/* ================================================================== */

const RESULTATS_RESUME: ResultatUeResume[] = [
  {
    ueId: 301,
    code: "INF501",
    intitule: "Algorithmique avancée",
    campagneId: 1,
    libelleCampagne: "Semestre automne 2026",
    inscrits: 40,
    repondants: 28,
    detailDisponible: true,
  },
  {
    ueId: 302,
    code: "MAT502",
    intitule: "Probabilités et statistiques",
    campagneId: 1,
    libelleCampagne: "Semestre automne 2026",
    inscrits: 35,
    repondants: 12,
    detailDisponible: true,
  },
  {
    ueId: 303,
    code: "INF503",
    intitule: "Bases de données",
    campagneId: 1,
    libelleCampagne: "Semestre automne 2026",
    inscrits: 30,
    repondants: 3,
    detailDisponible: false,
  },
];

function fabriquerResultatDetail(ueId: number): ResultatUe {
  const resume = RESULTATS_RESUME.find((r) => r.ueId === ueId);
  if (!resume)
    throw new ApiError({ message: "Résultat introuvable.", statusCode: 404 });

  if (!resume.detailDisponible) {
    return {
      ueId: resume.ueId,
      code: resume.code,
      intitule: resume.intitule,
      campagneId: resume.campagneId,
      inscrits: resume.inscrits,
      repondants: resume.repondants,
      seuil: 5,
      detailDisponible: false,
      sections: [],
      pointsForts: [],
      pointsAAmeliorer: [],
    };
  }

  const sections: ResultatSection[] = [
    {
      code: "A",
      titre: "Organisation et contenu",
      moyenne: 4.1,
      criteres: [
        {
          critereId: 1,
          code: "A1",
          libelle: "Objectifs présentés",
          moyenne: 4.2,
          distribution: [1, 2, 3, 8, 14],
          sansAvis: 0,
        },
        {
          critereId: 2,
          code: "A2",
          libelle: "Correspondance syllabus",
          moyenne: 3.9,
          distribution: [2, 3, 4, 7, 12],
          sansAvis: 0,
        },
        {
          critereId: 3,
          code: "A3",
          libelle: "Progression cohérente",
          moyenne: 4.3,
          distribution: [0, 1, 3, 6, 18],
          sansAvis: 0,
        },
        {
          critereId: 4,
          code: "A4",
          libelle: "Charge adaptée",
          moyenne: 3.7,
          distribution: [2, 4, 5, 8, 9],
          sansAvis: 0,
        },
        {
          critereId: 5,
          code: "A5",
          libelle: "Liens avec autres UE",
          moyenne: 3.5,
          distribution: [3, 5, 6, 7, 7],
          sansAvis: 0,
        },
      ],
    },
    {
      code: "B",
      titre: "Qualité pédagogique",
      moyenne: 4.0,
      criteres: [
        {
          critereId: 6,
          code: "B1",
          libelle: "Explications claires",
          moyenne: 4.4,
          distribution: [0, 1, 2, 5, 20],
          sansAvis: 0,
        },
        {
          critereId: 7,
          code: "B2",
          libelle: "Disponibilité",
          moyenne: 3.8,
          distribution: [2, 3, 4, 8, 11],
          sansAvis: 0,
        },
        {
          critereId: 8,
          code: "B3",
          libelle: "Réponses aux questions",
          moyenne: 4.1,
          distribution: [1, 2, 3, 7, 15],
          sansAvis: 0,
        },
        {
          critereId: 9,
          code: "B4",
          libelle: "Supports utiles",
          moyenne: 3.6,
          distribution: [3, 4, 5, 6, 10],
          sansAvis: 0,
        },
        {
          critereId: 10,
          code: "B5",
          libelle: "Rythme adapté",
          moyenne: 3.9,
          distribution: [1, 3, 5, 7, 12],
          sansAvis: 0,
        },
      ],
    },
    {
      code: "C",
      titre: "Évaluation et retour",
      moyenne: 3.4,
      criteres: [
        {
          critereId: 11,
          code: "C1",
          libelle: "Modalités communiquées",
          moyenne: 3.8,
          distribution: [2, 3, 4, 8, 11],
          sansAvis: 0,
        },
        {
          critereId: 12,
          code: "C2",
          libelle: "Cohérence épreuves",
          moyenne: 3.5,
          distribution: [3, 4, 5, 7, 9],
          sansAvis: 0,
        },
        {
          critereId: 13,
          code: "C3",
          libelle: "Délai corrections",
          moyenne: 2.9,
          distribution: [6, 8, 5, 4, 5],
          sansAvis: 0,
        },
        {
          critereId: 14,
          code: "C4",
          libelle: "Retours utiles",
          moyenne: 3.2,
          distribution: [4, 6, 6, 5, 7],
          sansAvis: 0,
        },
      ],
    },
    {
      code: "D",
      titre: "Moyens matériels",
      moyenne: 3.3,
      criteres: [
        {
          critereId: 15,
          code: "D1",
          libelle: "Salles adaptées",
          moyenne: 3.1,
          distribution: [5, 7, 6, 5, 5],
          sansAvis: 0,
        },
        {
          critereId: 16,
          code: "D2",
          libelle: "Équipements TP",
          moyenne: 3.4,
          distribution: [3, 5, 7, 6, 7],
          sansAvis: 0,
        },
        {
          critereId: 17,
          code: "D3",
          libelle: "Ressources numériques",
          moyenne: 3.5,
          distribution: [2, 4, 6, 8, 8],
          sansAvis: 0,
        },
      ],
    },
    {
      code: "E",
      titre: "Appréciation globale",
      moyenne: 4.0,
      criteres: [
        {
          critereId: 18,
          code: "E1",
          libelle: "Satisfaction générale",
          moyenne: 4.0,
          distribution: [1, 2, 4, 8, 13],
          sansAvis: 0,
        },
        {
          critereId: 19,
          code: "E2",
          libelle: "Recommandation",
          moyenne: 3.8,
          distribution: [2, 3, 4, 7, 12],
          sansAvis: 0,
        },
      ],
    },
  ];

  const pointsForts =
    ueId === 301
      ? [
          "Très bonne clarté des explications",
          "Supports de cours bien conçus",
          "Progression logique du programme",
          "Enseignant très disponible",
          "Exemples concrets et pertinents",
        ]
      : [
          "Contenu intéressant",
          "Bon contact avec l'enseignant",
          "Travaux dirigés utiles",
          "Évaluation équitable",
        ];
  const pointsAAmeliorer =
    ueId === 301
      ? [
          "Délai de correction trop long",
          "Plus d'exercices pratiques",
          "Salles parfois trop petites",
          "Améliorer les ressources en ligne",
          "Mieux lier les UE entre elles",
        ]
      : [
          "Rythme parfois trop rapide",
          "Plus de retours sur les évaluations",
          "Matériel de TP insuffisant",
          "Clarifier les modalités d'examen",
        ];

  return {
    ueId: resume.ueId,
    code: resume.code,
    intitule: resume.intitule,
    campagneId: resume.campagneId,
    inscrits: resume.inscrits,
    repondants: resume.repondants,
    seuil: 5,
    detailDisponible: true,
    sections,
    pointsForts,
    pointsAAmeliorer,
  };
}

/* ================================================================== */
/*  DONNÉES SIMULÉES : Cahier de texte & visa                          */
/* ================================================================== */

const UE_CAHIER: UeCahier[] = [
  {
    ueId: 401,
    code: "INF501",
    intitule: "Algorithmique avancée",
    enseignants: ["Hamidi Karim"],
  },
  {
    ueId: 402,
    code: "MAT502",
    intitule: "Probabilités et statistiques",
    enseignants: ["Saidi Nora"],
  },
  {
    ueId: 403,
    code: "INF503",
    intitule: "Bases de données",
    enseignants: ["Hamidi Karim", "Mokrani Yacine"],
  },
];

const ETUDIANTS_DOSSIER = [
  { id: 1001, nom: "Benali", prenom: "Amine", identifiant: "DEMO-ETU" },
  { id: 1002, nom: "Cherif", prenom: "Lina", identifiant: "DEMO-DEL" },
  { id: 1101, nom: "Koudasse", prenom: "Joy Amos", identifiant: "ENP-2026-011" },
  { id: 1102, nom: "Ohounsoun", prenom: "Bienvenu", identifiant: "ENP-2026-012" },
  { id: 1103, nom: "Mensah", prenom: "Kofi", identifiant: "ENP-2026-013" },
  { id: 1104, nom: "Agbeko", prenom: "Ama", identifiant: "ENP-2026-014" },
  { id: 1105, nom: "Tchalla", prenom: "Kodjo", identifiant: "ENP-2026-015" },
  { id: 1106, nom: "Lawson", prenom: "Afi", identifiant: "ENP-2026-016" },
  { id: 1107, nom: "Dossou", prenom: "Komi", identifiant: "ENP-2026-017" },
  { id: 1108, nom: "Adotevi", prenom: "Sena", identifiant: "ENP-2026-018" },
  { id: 1109, nom: "Gbedemah", prenom: "Akossiwa", identifiant: "ENP-2026-019" },
  { id: 1110, nom: "Ayitevi", prenom: "Edem", identifiant: "ENP-2026-020" },
];
const INSCRIPTIONS_DOSSIER: Record<number, number[]> = {
  1001: [401, 402, 403],
  1002: [401, 402, 403],
};
let evaluationDossierId = 1;
let evaluationsDossier: (EvaluationDossier & { courseId: number })[] = [
  {
    id: evaluationDossierId,
    courseId: 401,
    libelle: "Devoir 1",
    bareme: 20,
    creeLe: "2026-09-20T12:00:00Z",
    notes: { 1001: 15, 1002: 17 },
  },
];
let presenceSessionId = 0;
let presencesDossier: (SeancePresence & {
  courseId: number;
  etudiantStatuts: Record<number, StatutPresenceEtudiant>;
})[] = [
  {
    id: ++presenceSessionId,
    courseId: 401,
    date: new Date().toISOString().slice(0, 10),
    libelle: "CM : Cours magistral (Émargement en direct)",
    effectif: ETUDIANTS_DOSSIER.length,
    marques: 0,
    etudiantStatuts: {},
  },
  {
    id: ++presenceSessionId,
    courseId: 401,
    date: "2026-09-20",
    libelle: "Cours magistral",
    effectif: ETUDIANTS_DOSSIER.length,
    marques: 2,
    etudiantStatuts: { 1001: "present", 1002: "retard" },
  },
];

/* ------------------------------------------------------------------ */
/*  Stockage partage inter-onglets pour le QR Code dynamique (maquette)*/
/* ------------------------------------------------------------------ */

const CLE_STOCKAGE_QR_MOCK = "enp_mock_qr_presence_sessions_v1";

interface SessionQrMockPersistee {
  sessionId: number;
  seanceId: number;
  courseId: number;
  codeUe: string;
  intituleUe: string;
  libelleSeance: string;
  dateSeance: string;
  statut: "ouverte" | "pause" | "fermee";
  secretKey: string;
  ouvertA: string;
  fermeA: string | null;
  counter: number;
  lastToken: string;
  lastTokenTimestampMs: number;
  dernierVirtuelMs: number;
  etudiantsScannes: number[];
  appareilsParEtudiant: Record<string, number>;
  recents: ArriveePresenceRecente[];
}

function lireSessionsQrStockees(): Record<string, SessionQrMockPersistee> {
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE_QR_MOCK);
    if (!brut) return {};
    const parsed = JSON.parse(brut) as Record<string, SessionQrMockPersistee>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function ecrireSessionsQrStockees(
  sessions: Record<string, SessionQrMockPersistee>,
): void {
  try {
    window.localStorage.setItem(CLE_STOCKAGE_QR_MOCK, JSON.stringify(sessions));
  } catch {
    // Stockage local indisponible, on conserve l'etat en memoire.
  }
}

function synchroniserPresencesDepuisQrMock(): void {
  const sessions = lireSessionsQrStockees();
  for (const qr of Object.values(sessions)) {
    let seance = presencesDossier.find((item) => item.id === qr.seanceId);
    if (!seance) {
      seance = {
        id: qr.seanceId,
        courseId: qr.courseId,
        date: qr.dateSeance,
        libelle: qr.libelleSeance,
        effectif: ETUDIANTS_DOSSIER.length,
        marques: 0,
        etudiantStatuts: {},
      };
      presencesDossier = [seance, ...presencesDossier];
    }
    for (const etudiantId of qr.etudiantsScannes) {
      if (!seance.etudiantStatuts[etudiantId]) {
        seance.etudiantStatuts[etudiantId] = "present";
      }
    }
    seance.marques = Object.keys(seance.etudiantStatuts).length;
  }
}

function formaterSessionQr(
  qr: SessionQrMockPersistee,
  nowMs: number,
): SessionQrPresence {
  const restant =
    qr.statut === "ouverte"
      ? Math.max(0, DUREE_ROTATION_MS - (nowMs - qr.lastTokenTimestampMs))
      : 0;
  return {
    sessionId: qr.sessionId,
    seanceId: qr.seanceId,
    courseId: qr.courseId,
    codeUe: qr.codeUe,
    intituleUe: qr.intituleUe,
    libelleSeance: qr.libelleSeance,
    dateSeance: qr.dateSeance,
    statut: qr.statut,
    ouvertA: qr.ouvertA,
    fermeA: qr.fermeA,
    dureeValiditeSecondes: 6,
    token: qr.statut === "ouverte" ? qr.lastToken : "",
    counter: qr.counter,
    timestampMs: qr.lastTokenTimestampMs,
    expireDansMs: restant > 0 ? restant : DUREE_ROTATION_MS,
    presents: qr.etudiantsScannes.length,
    inscrits: ETUDIANTS_DOSSIER.length,
    recents: qr.recents.slice(0, 5),
  };
}

function avancerEmargementsVirtuels(
  qr: SessionQrMockPersistee,
  nowMs: number,
): void {
  if (qr.statut !== "ouverte") return;
  const intervalleMs = 4000;
  const ecoule = nowMs - qr.dernierVirtuelMs;
  if (ecoule < intervalleMs) return;

  const nombreNouveaux = Math.min(2, Math.floor(ecoule / intervalleMs));
  // On reserve les comptes interactifs 1001 (DEMO-ETU) et 1002 (DEMO-DEL)
  // pour permettre le scan manuel dans un second onglet.
  const candidats = ETUDIANTS_DOSSIER.filter(
    (etu) =>
      etu.id !== 1001 &&
      etu.id !== 1002 &&
      !qr.etudiantsScannes.includes(etu.id),
  );

  for (let i = 0; i < nombreNouveaux && i < candidats.length; i++) {
    const etu = candidats[i];
    const instant = new Date(nowMs - (nombreNouveaux - 1 - i) * 600).toISOString();
    qr.etudiantsScannes.push(etu.id);
    qr.appareilsParEtudiant[`enp-virtual-device-${etu.id}`] = etu.id;
    qr.recents.unshift({
      etudiantId: etu.id,
      nom: etu.nom,
      prenom: etu.prenom,
      identifiant: etu.identifiant,
      scanneA: instant,
    });
  }
  qr.recents = qr.recents.slice(0, 10);
  qr.dernierVirtuelMs = nowMs;
}

let seanceIdSuivant = 1012;
let seancesMemoire: Seance[] = [
  {
    id: 1001,
    ueId: 401,
    ueCode: "INF501",
    ueIntitule: "Algorithmique avancée",
    date: "2026-10-02",
    debut: "08:00",
    fin: "10:00",
    type: "CM",
    statut: "tenue",
    intitule: "Graphes et parcours",
    contenu: "BFS, DFS, plus courts chemins (Dijkstra)",
    travailAFaire: "Exercices 1 à 4 du chapitre 5",
    effectif: 38,
    visa: { statut: "en_attente" },
    modifiable: true,
  },
  {
    id: 1002,
    ueId: 401,
    ueCode: "INF501",
    ueIntitule: "Algorithmique avancée",
    date: "2026-10-01",
    debut: "10:00",
    fin: "12:00",
    type: "TD",
    groupe: "G1",
    statut: "tenue",
    intitule: "Exercices sur les graphes",
    contenu: "Application de Dijkstra, exercices de complexité",
    travailAFaire: "Terminer la série 3",
    effectif: 20,
    visa: { statut: "vise", date: "2026-10-01" },
    modifiable: false,
  },
  {
    id: 1003,
    ueId: 402,
    ueCode: "MAT502",
    ueIntitule: "Probabilités et statistiques",
    date: "2026-09-30",
    debut: "14:00",
    fin: "16:00",
    type: "CM",
    statut: "tenue",
    intitule: "Lois continues",
    contenu: "Loi normale, exponentielle, exercices",
    travailAFaire: "Lire le chapitre 7",
    effectif: 33,
    visa: { statut: "en_attente" },
    modifiable: true,
  },
  {
    id: 1004,
    ueId: 402,
    ueCode: "MAT502",
    ueIntitule: "Probabilités et statistiques",
    date: "2026-09-29",
    debut: "16:00",
    fin: "18:00",
    type: "TP",
    groupe: "G2",
    statut: "reportee",
    intitule: "TP statistiques avec R",
    contenu: "Reporté pour indisponibilité salle",
    observations: "Reporté au 03/10",
    visa: {
      statut: "conteste",
      commentaire: "Le report n'a pas été communiqué à temps",
      date: "2026-09-30",
    },
    modifiable: false,
  },
  {
    id: 1005,
    ueId: 403,
    ueCode: "INF503",
    ueIntitule: "Bases de données",
    date: "2026-09-28",
    debut: "08:00",
    fin: "10:00",
    type: "CM",
    statut: "tenue",
    intitule: "Modèle relationnel",
    contenu: "Normalisation (1NF, 2NF, 3NF)",
    travailAFaire: "Exercices du poly p.45",
    effectif: 35,
    visa: { statut: "vise", date: "2026-09-28" },
    modifiable: false,
  },
  {
    id: 1006,
    ueId: 401,
    ueCode: "INF501",
    ueIntitule: "Algorithmique avancée",
    date: "2026-09-25",
    debut: "10:00",
    fin: "12:00",
    type: "TD",
    groupe: "G2",
    statut: "tenue",
    intitule: "Récursivité avancée",
    contenu: "Diviser pour régner, tri fusion",
    travailAFaire: "Implémenter le tri fusion",
    effectif: 18,
    visa: { statut: "vise", date: "2026-09-26" },
    modifiable: false,
  },
  {
    id: 1007,
    ueId: 402,
    ueCode: "MAT502",
    ueIntitule: "Probabilités et statistiques",
    date: "2026-09-24",
    debut: "14:00",
    fin: "16:00",
    type: "CM",
    statut: "annulee",
    observations: "Enseignant en mission",
    visa: { statut: "en_attente" },
    modifiable: true,
  },
  {
    id: 1008,
    ueId: 403,
    ueCode: "INF503",
    ueIntitule: "Bases de données",
    date: "2026-09-23",
    debut: "10:00",
    fin: "12:00",
    type: "TP",
    groupe: "G1",
    statut: "tenue",
    intitule: "SQL : requêtes de base",
    contenu: "SELECT, JOIN, agrégats",
    travailAFaire: "Finir le TP et rendre le rapport",
    effectif: 17,
    visa: {
      statut: "conteste",
      commentaire: "Effectif ne correspond pas au groupe inscrit",
      date: "2026-09-24",
    },
    modifiable: false,
  },
  {
    id: 1009,
    ueId: 401,
    ueCode: "INF501",
    ueIntitule: "Algorithmique avancée",
    date: "2026-09-22",
    debut: "08:00",
    fin: "10:00",
    type: "CM",
    statut: "enseignant_absent",
    observations: "Absence signalée par la Scolarité",
    visa: { statut: "en_attente" },
    modifiable: true,
  },
  {
    id: 1010,
    ueId: 403,
    ueCode: "INF503",
    ueIntitule: "Bases de données",
    date: "2026-09-20",
    debut: "14:00",
    fin: "16:00",
    type: "TD",
    groupe: "G1",
    statut: "tenue",
    intitule: "Algèbre relationnelle",
    contenu: "Projection, sélection, jointure",
    travailAFaire: "Exercices 1 à 5",
    effectif: 19,
    visa: { statut: "vise", date: "2026-09-21" },
    modifiable: false,
  },
  {
    id: 1011,
    ueId: 402,
    ueCode: "MAT502",
    ueIntitule: "Probabilités et statistiques",
    date: "2026-09-18",
    debut: "16:00",
    fin: "18:00",
    type: "TD",
    groupe: "G1",
    statut: "tenue",
    intitule: "Variables aléatoires",
    contenu: "Espérance, variance, lois discrètes",
    travailAFaire: "Série 2 complète",
    effectif: 21,
    visa: { statut: "en_attente" },
    modifiable: true,
  },
  {
    id: 1012,
    ueId: 401,
    ueCode: "INF501",
    ueIntitule: "Algorithmique avancée",
    date: "2026-09-15",
    debut: "10:00",
    fin: "12:00",
    type: "TD",
    groupe: "G1",
    statut: "tenue",
    intitule: "Complexité algorithmique",
    contenu: "Notation O, comparaison de tris",
    travailAFaire: "Exercices du chapitre 1",
    effectif: 20,
    visa: { statut: "vise", date: "2026-09-16" },
    modifiable: false,
  },
];

const AVANCEMENT_DATA: Avancement[] = [
  {
    ueId: 401,
    heuresPrevues: { cm: 30, td: 20, tp: 0 },
    heuresEffectuees: { cm: 18, td: 12, tp: 0 },
  },
  {
    ueId: 402,
    heuresPrevues: { cm: 25, td: 15, tp: 10 },
    heuresEffectuees: { cm: 14, td: 6, tp: 0 },
  },
  {
    ueId: 403,
    heuresPrevues: { cm: 20, td: 15, tp: 15 },
    heuresEffectuees: { cm: 12, td: 8, tp: 4 },
  },
];

/* ------------------------------------------------------------------ */
/*  API : Résultats (enseignant)                                       */
/* ------------------------------------------------------------------ */

export async function resultatsMesUes(): Promise<ResultatUeResume[]> {
  await delai();
  return RESULTATS_RESUME.map((r) => ({ ...r }));
}

export async function resultatUe(
  ueId: number,
  campagneId: number,
): Promise<ResultatUe> {
  await delai();
  void campagneId;
  return fabriquerResultatDetail(ueId);
}

/* ------------------------------------------------------------------ */
/*  API : Cahier de texte & visa                                       */
/* ------------------------------------------------------------------ */

export async function cahierMesUes(): Promise<UeCahier[]> {
  await delai();
  return UE_CAHIER.map((u) => ({ ...u, enseignants: [...u.enseignants] }));
}

export async function cahierSeances(
  ueId?: number,
  statutVisa?: string,
): Promise<Seance[]> {
  await delai();
  let resultat = [...seancesMemoire];
  if (ueId !== undefined) resultat = resultat.filter((s) => s.ueId === ueId);
  if (statutVisa)
    resultat = resultat.filter((s) => s.visa.statut === statutVisa);
  resultat.sort((a, b) => b.date.localeCompare(a.date));
  return resultat.map((s) => ({ ...s, visa: { ...s.visa } }));
}

export async function creerSeance(corps: SeanceEntree): Promise<Seance> {
  await delai();
  const ue = UE_CAHIER.find((u) => u.ueId === corps.ueId);
  if (!ue) throw new ApiError({ message: "UE introuvable.", statusCode: 404 });
  seanceIdSuivant += 1;
  const seance: Seance = {
    id: seanceIdSuivant,
    ueId: corps.ueId,
    ueCode: ue.code,
    ueIntitule: ue.intitule,
    date: corps.date,
    debut: corps.debut,
    fin: corps.fin,
    type: corps.type,
    groupe: corps.groupe,
    statut: corps.statut,
    intitule: corps.intitule,
    contenu: corps.contenu,
    travailAFaire: corps.travailAFaire,
    effectif: corps.effectif,
    observations: corps.observations,
    visa: { statut: "en_attente" },
    modifiable: true,
  };
  seancesMemoire = [seance, ...seancesMemoire];
  return { ...seance, visa: { ...seance.visa } };
}

export async function modifierSeance(
  id: number,
  corps: SeanceEntree,
): Promise<Seance> {
  await delai();
  const idx = seancesMemoire.findIndex((s) => s.id === id);
  if (idx === -1)
    throw new ApiError({ message: "Séance introuvable.", statusCode: 404 });
  const seance = seancesMemoire[idx];
  if (!seance.modifiable) {
    throw new ApiError({
      message: "Séance visée : modification impossible.",
      statusCode: 409,
    });
  }
  const ue = UE_CAHIER.find((u) => u.ueId === corps.ueId);
  if (!ue) throw new ApiError({ message: "UE introuvable.", statusCode: 404 });
  seancesMemoire[idx] = {
    ...seance,
    ueId: corps.ueId,
    ueCode: ue.code,
    ueIntitule: ue.intitule,
    date: corps.date,
    debut: corps.debut,
    fin: corps.fin,
    type: corps.type,
    groupe: corps.groupe,
    statut: corps.statut,
    intitule: corps.intitule,
    contenu: corps.contenu,
    travailAFaire: corps.travailAFaire,
    effectif: corps.effectif,
    observations: corps.observations,
  };
  return { ...seancesMemoire[idx], visa: { ...seancesMemoire[idx].visa } };
}

export async function visaSeance(
  id: number,
  corps: { decision: "vise" | "conteste"; commentaire?: string },
): Promise<Seance> {
  await delai();
  const idx = seancesMemoire.findIndex((s) => s.id === id);
  if (idx === -1)
    throw new ApiError({ message: "Séance introuvable.", statusCode: 404 });
  const seance = seancesMemoire[idx];
  if (corps.decision === "conteste" && !corps.commentaire?.trim()) {
    throw new ApiError({
      message: "Un commentaire est obligatoire pour contester une séance.",
      statusCode: 400,
    });
  }
  seancesMemoire[idx] = {
    ...seance,
    visa: {
      statut: corps.decision === "vise" ? "vise" : "conteste",
      commentaire: corps.commentaire?.trim() || undefined,
      date: new Date().toISOString().slice(0, 10),
    },
    modifiable: false,
  };
  return { ...seancesMemoire[idx], visa: { ...seancesMemoire[idx].visa } };
}

export async function avancementUe(ueId: number): Promise<Avancement> {
  await delai();
  const av = AVANCEMENT_DATA.find((a) => a.ueId === ueId);
  if (!av)
    throw new ApiError({ message: "Avancement introuvable.", statusCode: 404 });
  return {
    ...av,
    heuresPrevues: { ...av.heuresPrevues },
    heuresEffectuees: { ...av.heuresEffectuees },
  };
}

export async function exporterCahier(
  format: "pdf" | "xlsx" | "docx",
  ueId?: number,
): Promise<Blob> {
  await delai();
  const contenu = seancesMemoire
    .filter((seance) => ueId === undefined || seance.ueId === ueId)
    .map((seance) => `${seance.ueCode} ${seance.date} ${seance.intitule ?? ""}`)
    .join("\n");
  return new Blob([contenu], {
    type: format === "pdf" ? "application/pdf" : "application/octet-stream",
  });
}

export async function historiqueSeance(_id: number): Promise<VersionSeance[]> {
  void _id;
  await delai();
  return [];
}

export async function piecesSeance(_id: number): Promise<PieceJointe[]> {
  void _id;
  await delai();
  return [];
}

export async function ajouterPieceSeance(
  _id: number,
  fichier: File,
): Promise<PieceJointe> {
  void _id;
  await delai();
  return {
    id: Date.now(),
    nom: fichier.name,
    mime: fichier.type,
    creeLe: new Date().toISOString(),
  };
}

export async function telechargerPiece(_id: number): Promise<Blob> {
  void _id;
  await delai();
  return new Blob();
}

export async function notifications(): Promise<Notification[]> {
  await delai();
  return [];
}

export async function marquerNotificationLue(_id: number): Promise<void> {
  void _id;
  await delai();
}

/* ------------------------------------------------------------------ */
/*  Journal forensique haute securite (chaine SHA-256, Admin uniquement) */
/* ------------------------------------------------------------------ */

const SEED_AUDIT_BRUT: LigneAudit[] = [
  {
    id: 1,
    creeLe: "2026-11-22T07:12:04.210Z",
    userId: 1006,
    userMatricule: "DEMO-DIR",
    userNomComplet: "Afi Amavi",
    userRole: "directeur_general",
    categorie: "authentification",
    gravite: "sensible",
    action: "CONNEXION_MFA_TOTP",
    methodeHttp: "POST",
    cheminHttp: "/api/v1/auth/login",
    statutHttp: 200,
    dureeMs: 44,
    ipAddress: "41.207.175.18",
    ipForwardedChain: "41.207.175.18, 10.0.1.4",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    osNom: "Windows 10/11",
    navigateurNom: "Chrome 124",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-DG-9F4A2C1B88E0",
    ecranResolution: "1920x1080",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17648,
    geoLongitude: 1.21242,
    geoPrecisionMetres: 11,
    geoVille: "Lomé (Direction Générale ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom Fibre Campus",
    sessionId: "SES-DG-8491A",
    objet: "Authentification Direction Générale",
    detail: "Connexion validée avec facteur TOTP sur poste fixe Direction",
  },
  {
    id: 2,
    creeLe: "2026-11-22T07:18:33.540Z",
    userId: 1006,
    userMatricule: "DEMO-DIR",
    userNomComplet: "Afi Amavi",
    userRole: "directeur_general",
    categorie: "direction",
    gravite: "sensible",
    action: "DIRECTION_CONSULTATION_STATISTIQUES",
    methodeHttp: "GET",
    cheminHttp: "/api/v1/direction/statistiques?annee=2026-2027&semestre=1",
    statutHttp: 200,
    dureeMs: 62,
    ipAddress: "41.207.175.18",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    osNom: "Windows 10/11",
    navigateurNom: "Chrome 124",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-DG-9F4A2C1B88E0",
    ecranResolution: "1920x1080",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17648,
    geoLongitude: 1.21242,
    geoPrecisionMetres: 11,
    geoVille: "Lomé (Direction Générale ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom Fibre Campus",
    sessionId: "SES-DG-8491A",
    objet: "Tableau consolidé multi-campus",
    detail: "Consultation des taux de participation et indicateurs qualité S1",
  },
  {
    id: 3,
    creeLe: "2026-11-22T07:29:11.095Z",
    userId: 1008,
    userMatricule: "DEMO-CAMPUS",
    userNomComplet: "Edem Koffi",
    userRole: "directeur_campus",
    categorie: "direction",
    gravite: "sensible",
    action: "DIRECTION_CONTROLE_ACADEMIQUE",
    methodeHttp: "GET",
    cheminHttp: "/api/v1/direction/controles",
    statutHttp: 200,
    dureeMs: 39,
    ipAddress: "41.207.175.29",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15",
    osNom: "macOS 14.4",
    navigateurNom: "Safari 17",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-DC-4B10E7A93D21",
    ecranResolution: "1440x900",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17492,
    geoLongitude: 1.21485,
    geoPrecisionMetres: 15,
    geoVille: "Lomé (Campus Nord - Bâtiment B)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom Fibre Campus",
    sessionId: "SES-DC-3102B",
    objet: "Contrôles réglementaires Campus",
    detail: "Vérification des anomalies de campagnes et seuils d'anonymat",
  },
  {
    id: 4,
    creeLe: "2026-11-22T07:45:02.801Z",
    userId: 1005,
    userMatricule: "DEMO-SCO",
    userNomComplet: "Yacine Mokrani",
    userRole: "scolarite",
    categorie: "administration",
    gravite: "sensible",
    action: "IMPORT_UTILISATEURS_CSV",
    methodeHttp: "POST",
    cheminHttp: "/api/v1/scolarite/comptes/import",
    statutHttp: 201,
    dureeMs: 284,
    ipAddress: "41.207.175.44",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/124.0.0.0",
    osNom: "Windows 10/11",
    navigateurNom: "Edge 124",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-SCO-77C91D02F11A",
    ecranResolution: "1600x900",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17581,
    geoLongitude: 1.21319,
    geoPrecisionMetres: 12,
    geoVille: "Lomé (Service Scolarité ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom Fibre Campus",
    sessionId: "SES-SCO-5519C",
    objet: "Import promotion L3 Informatique",
    detail: "Création de 42 comptes étudiants et mise en file d'envoi des codes d'activation",
    metadata: { totalRows: 42, successCount: 42, errorCount: 0 },
  },
  {
    id: 5,
    creeLe: "2026-11-22T08:01:15.112Z",
    userId: 1003,
    userMatricule: "DEMO-ENS",
    userNomComplet: "Karim Hamidi",
    userRole: "enseignant",
    categorie: "presence",
    gravite: "info",
    action: "PRESENCE_QR_SESSION_DEMARREE",
    methodeHttp: "POST",
    cheminHttp: "/api/v1/presences/sessions/demarrer",
    statutHttp: 201,
    dureeMs: 27,
    ipAddress: "41.207.176.102",
    userAgent: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    osNom: "Linux Ubuntu",
    navigateurNom: "Firefox 125",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-ENS-22D4A8C1903F",
    ecranResolution: "1920x1080",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17712,
    geoLongitude: 1.21195,
    geoPrecisionMetres: 9,
    geoVille: "Lomé (Amphi A - ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Wi-Fi Enseignants ENP",
    sessionId: "SES-ENS-9012D",
    courseId: 201,
    objet: "INF501 Algorithmique avancée",
    detail: "Projection QR Code dynamique tournant (rotation 6 s) démarrée en amphithéâtre",
  },
  {
    id: 6,
    creeLe: "2026-11-22T08:01:41.662Z",
    userId: 1001,
    userMatricule: "DEMO-ETU",
    userNomComplet: "Amine Benali",
    userRole: "etudiant",
    categorie: "presence",
    gravite: "info",
    action: "SCAN_QR_PRESENCE_VALIDE",
    methodeHttp: "POST",
    cheminHttp: "/api/v1/presences/scanner",
    statutHttp: 200,
    dureeMs: 19,
    ipAddress: "102.64.218.77",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
    osNom: "Android 14",
    navigateurNom: "Chrome 124",
    appareilType: "Smartphone",
    deviceFingerprint: "MCH-ETU-A1B89E4402C7",
    ecranResolution: "412x915",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17718,
    geoLongitude: 1.21191,
    geoPrecisionMetres: 8,
    geoVille: "Lomé (Amphi A - ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Moov Africa Togo 4G",
    sessionId: "SES-ETU-7710E",
    courseId: 201,
    objet: "Séance CM #12 INF501",
    detail: "Émargement validé (âge jeton 1,4 s, appareil lié unique)",
  },
  {
    id: 7,
    creeLe: "2026-11-22T08:14:22.410Z",
    userId: 1002,
    userMatricule: "DEMO-DEL",
    userNomComplet: "Lina Cherif",
    userRole: "delegue",
    categorie: "academique",
    gravite: "info",
    action: "CAHIER_TEXTE_CREATION_SEANCE",
    methodeHttp: "POST",
    cheminHttp: "/api/v1/cahier-texte/seances",
    statutHttp: 201,
    dureeMs: 35,
    ipAddress: "102.64.219.14",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
    osNom: "iOS 17.4",
    navigateurNom: "Safari 17",
    appareilType: "Smartphone",
    deviceFingerprint: "MCH-DEL-66E31F8B902A",
    ecranResolution: "390x844",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17695,
    geoLongitude: 1.21210,
    geoPrecisionMetres: 14,
    geoVille: "Lomé (Campus Nord ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom 4G",
    sessionId: "SES-DEL-4119F",
    courseId: 201,
    objet: "INF501 - Séance CM Graphes",
    detail: "Saisie du contenu de séance et soumission au visa de l'enseignant",
  },
  {
    id: 8,
    creeLe: "2026-11-22T08:26:50.004Z",
    userId: 1004,
    userMatricule: "DEMO-CHEF",
    userNomComplet: "Nora Saidi",
    userRole: "chef_departement",
    categorie: "export",
    gravite: "sensible",
    action: "EXPORT_SYNTHESE_DEPARTEMENT",
    methodeHttp: "GET",
    cheminHttp: "/api/v1/exports/synthese?campagneId=1&format=pdf",
    statutHttp: 200,
    dureeMs: 142,
    ipAddress: "41.207.175.33",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    osNom: "Windows 10/11",
    navigateurNom: "Chrome 124",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-CHF-81A04E7C12D4",
    ecranResolution: "1920x1080",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17545,
    geoLongitude: 1.21398,
    geoPrecisionMetres: 13,
    geoVille: "Lomé (Département Génie Informatique)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom Fibre Campus",
    sessionId: "SES-CHF-1884G",
    objet: "Synthèse départementale S1",
    detail: "Téléchargement officiel du procès-verbal PDF de synthèse",
  },
  {
    id: 9,
    creeLe: "2026-11-22T08:42:19.775Z",
    userId: 1005,
    userMatricule: "DEMO-SCO",
    userNomComplet: "Yacine Mokrani",
    userRole: "scolarite",
    categorie: "securite",
    gravite: "alerte",
    action: "ACCES_REFUSE_403",
    methodeHttp: "GET",
    cheminHttp: "/api/v1/audit?limite=200",
    statutHttp: 403,
    dureeMs: 6,
    ipAddress: "41.207.175.44",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/124.0.0.0",
    osNom: "Windows 10/11",
    navigateurNom: "Edge 124",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-SCO-77C91D02F11A",
    ecranResolution: "1600x900",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17581,
    geoLongitude: 1.21319,
    geoPrecisionMetres: 12,
    geoVille: "Lomé (Service Scolarité ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom Fibre Campus",
    sessionId: "SES-SCO-5519C",
    objet: "/api/v1/audit",
    detail: "Tentative d'accès au journal forensique bloquée : accès réservé exclusivement à l'administrateur",
  },
  {
    id: 10,
    creeLe: "2026-11-22T09:05:11.309Z",
    userId: 1006,
    userMatricule: "DEMO-DIR",
    userNomComplet: "Afi Amavi",
    userRole: "directeur_general",
    categorie: "direction",
    gravite: "alerte",
    action: "DIRECTION_PUBLICATION_STATISTIQUES",
    methodeHttp: "POST",
    cheminHttp: "/api/v1/direction/statistiques/publier",
    statutHttp: 200,
    dureeMs: 91,
    ipAddress: "102.64.221.93",
    ipForwardedChain: "102.64.221.93, 10.0.1.4",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
    osNom: "iOS 17.4",
    navigateurNom: "Safari 17",
    appareilType: "Smartphone",
    deviceFingerprint: "MCH-DG-MOBILE-51C0E2",
    ecranResolution: "430x932",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.13194,
    geoLongitude: 1.22278,
    geoPrecisionMetres: 18,
    geoVille: "Lomé (Quartier Administratif / Tokoin)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom 4G Mobile",
    sessionId: "SES-DG-9920M",
    objet: "Publication officielle S1 2026-2027",
    detail: "Publication déclenchée depuis un second appareil mobile hors réseau campus (changement d'IP et de machine détecté)",
    metadata: { anneeUniversitaire: "2026-2027", semestre: 1 },
  },
  {
    id: 11,
    creeLe: "2026-11-22T09:14:00.120Z",
    userId: 1007,
    userMatricule: "DEMO-ADMIN",
    userNomComplet: "Demo Administrateur",
    userRole: "admin",
    categorie: "securite",
    gravite: "sensible",
    action: "AUDIT_VERIFICATION_INTEGRITE",
    methodeHttp: "GET",
    cheminHttp: "/api/v1/audit/integrite",
    statutHttp: 200,
    dureeMs: 14,
    ipAddress: "41.207.175.10",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    osNom: "Windows 10/11",
    navigateurNom: "Chrome 124",
    appareilType: "Desktop",
    deviceFingerprint: "MCH-ADM-00F1B8C934AA",
    ecranResolution: "2560x1440",
    fuseauHoraire: "Africa/Lome",
    langue: "fr-FR",
    geoSource: "gps_precis",
    geoLatitude: 6.17635,
    geoLongitude: 1.21255,
    geoPrecisionMetres: 7,
    geoVille: "Lomé (Salle Serveurs / DSI ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Togocom Fibre Campus",
    sessionId: "SES-ADM-0001Z",
    objet: "Chaîne cryptographique SHA-256",
    detail: "Contrôle périodique d'intégrité du journal WORM : aucune altération détectée",
  },
];

const auditJournalMemoire: LigneAudit[] = scellerChaineAudit(SEED_AUDIT_BRUT);

function enregistrerAuditMock(entree: {
  userId?: number;
  userMatricule?: string;
  userNomComplet?: string;
  userRole?: Role;
  categorie: CategorieAudit;
  gravite: GraviteAudit;
  action: string;
  methodeHttp?: string;
  cheminHttp?: string;
  statutHttp?: number;
  objet?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}): void {
  const tel = collecterTelemetrieMachine();
  const precedent = auditJournalMemoire[auditJournalMemoire.length - 1];
  const nextId = (precedent?.id ?? 0) + 1;
  const previousHash = precedent?.entryHash ?? GENESIS_AUDIT_HASH;

  const nouvelle: LigneAudit = {
    id: nextId,
    creeLe: new Date().toISOString(),
    userId: entree.userId,
    userMatricule: entree.userMatricule,
    userNomComplet: entree.userNomComplet,
    userRole: entree.userRole,
    categorie: entree.categorie,
    gravite: entree.gravite,
    action: entree.action,
    methodeHttp: entree.methodeHttp ?? "CLIENT",
    cheminHttp: entree.cheminHttp ?? entree.objet,
    statutHttp: entree.statutHttp ?? 200,
    dureeMs: 12,
    ipAddress: "41.207.175.10",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "ENP-Client",
    osNom: tel.osNom,
    navigateurNom: tel.navigateurNom,
    appareilType: tel.appareilType,
    deviceFingerprint: tel.deviceFingerprint,
    ecranResolution: tel.ecranResolution,
    fuseauHoraire: tel.fuseauHoraire,
    langue: tel.langue,
    geoSource: tel.geo?.source === "gps_precis" ? "gps_precis" : "campus_enp",
    geoLatitude: tel.geo?.latitude ?? 6.17635,
    geoLongitude: tel.geo?.longitude ?? 1.21255,
    geoPrecisionMetres: tel.geo?.precisionMetres ?? 15,
    geoVille: tel.geo?.source === "gps_precis" ? "Position GPS vérifiée" : "Lomé (Campus ENP)",
    geoRegion: "Maritime",
    geoPays: "Togo",
    geoFai: "Réseau ENP Lomé",
    sessionId: sessionMemoire ? `SES-${sessionMemoire.utilisateur.id}` : undefined,
    objet: entree.objet,
    detail: entree.detail,
    metadata: entree.metadata,
    previousHash,
  };
  nouvelle.entryHash = calculerHashEntreeAudit(nouvelle);
  auditJournalMemoire.push(nouvelle);
}

function exigerAdminAudit(): void {
  if (!sessionMemoire || sessionMemoire.utilisateur.activeRole !== "admin") {
    throw new ApiError({
      message:
        "Accès strictement refusé : le journal forensique est réservé exclusivement à l'administrateur système.",
      statusCode: 403,
    });
  }
}

export async function journalAudit(
  filtres?: FiltresAuditForensic,
): Promise<LigneAudit[]> {
  await delai();
  exigerAdminAudit();
  const trieDesc = [...auditJournalMemoire].sort(
    (a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe) || b.id - a.id,
  );
  const filtrees = filtres ? filtrerLignesAudit(trieDesc, filtres) : trieDesc;
  return filtrees.slice(0, filtres?.limite ?? 250);
}

export async function journalAuditUtilisateur(
  userId: number,
  limite = 500,
): Promise<LigneAudit[]> {
  await delai();
  exigerAdminAudit();
  return auditJournalMemoire
    .filter((l) => l.userId === userId)
    .sort((a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe) || b.id - a.id)
    .slice(0, limite);
}

export async function verifierIntegriteAudit(): Promise<RapportIntegriteAudit> {
  await delai();
  exigerAdminAudit();
  return verifierIntegriteChaineAudit(auditJournalMemoire);
}

export async function enregistrerEvenementAudit(entree: {
  action: string;
  objet?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}): Promise<ReponseSimple> {
  if (!sessionMemoire) return { ok: true };
  // Eviter d'enregistrer en double le polling silencieux sur le journal lui-meme
  const dernier = auditJournalMemoire[auditJournalMemoire.length - 1];
  if (
    dernier &&
    dernier.userId === sessionMemoire.utilisateur.id &&
    dernier.action === entree.action &&
    dernier.objet === entree.objet &&
    Date.now() - Date.parse(dernier.creeLe) < 2500
  ) {
    return { ok: true };
  }
  const u = sessionMemoire.utilisateur;
  enregistrerAuditMock({
    userId: u.id,
    userMatricule: u.identifiant ?? `USR-${u.id}`,
    userNomComplet: `${u.prenom} ${u.nom}`,
    userRole: u.activeRole,
    categorie: entree.objet?.startsWith("/journal-audit")
      ? "securite"
      : entree.objet?.startsWith("/direction")
        ? "direction"
        : "navigation",
    gravite: entree.objet?.startsWith("/journal-audit") ? "sensible" : "info",
    action: entree.action,
    methodeHttp: "GET",
    cheminHttp: entree.objet,
    statutHttp: 200,
    objet: entree.objet,
    detail: entree.detail,
    metadata: entree.metadata,
  });
  return { ok: true };
}

export async function dossierCoursEnseignant(): Promise<CoursDossier[]> {
  await delai();
  return UE_CAHIER.map(({ ueId, code, intitule }) => ({
    id: ueId,
    code,
    intitule,
  }));
}

export async function dossierCahierNotes(
  courseId: number,
): Promise<CahierNotes> {
  await delai();
  const cours = UE_CAHIER.find((ue) => ue.ueId === courseId);
  if (!cours)
    throw new ApiError({ message: "UE introuvable.", statusCode: 404 });
  return {
    cours: { id: cours.ueId, code: cours.code, intitule: cours.intitule },
    etudiants: ETUDIANTS_DOSSIER.map((etudiant) => ({ ...etudiant })),
    evaluations: evaluationsDossier
      .filter((evaluation) => evaluation.courseId === courseId)
      .map((evaluation) => ({
        id: evaluation.id,
        libelle: evaluation.libelle,
        bareme: evaluation.bareme,
        creeLe: evaluation.creeLe,
        notes: { ...evaluation.notes },
      })),
  };
}

export async function dossierExporterNotes(
  courseId: number,
  format: "pdf" | "xlsx" | "docx",
): Promise<Blob> {
  const cahier = await dossierCahierNotes(courseId);
  const contenu = [
    `${cahier.cours.code} : ${cahier.cours.intitule}`,
    ...cahier.etudiants.map((etudiant) =>
      [
        etudiant.identifiant,
        etudiant.prenom,
        etudiant.nom,
        ...cahier.evaluations.map(
          (evaluation) => evaluation.notes[etudiant.id] ?? "-",
        ),
      ].join("\t"),
    ),
  ].join("\n");
  return new Blob([contenu], {
    type:
      format === "pdf"
        ? "application/pdf"
        : format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export async function dossierCreerEvaluation(
  courseId: number,
  entree: EntreeEvaluation,
): Promise<{
  id: number;
  libelle: string;
  bareme: number;
}> {
  await delai();
  const cours = UE_CAHIER.find((ue) => ue.ueId === courseId);
  if (!cours)
    throw new ApiError({ message: "UE introuvable.", statusCode: 404 });
  const evaluation: EvaluationDossier & { courseId: number } = {
    id: ++evaluationDossierId,
    courseId,
    libelle: entree.libelle,
    bareme: entree.bareme,
    creeLe: new Date().toISOString(),
    notes: {},
  };
  evaluationsDossier = [...evaluationsDossier, evaluation];
  return {
    id: evaluation.id,
    libelle: evaluation.libelle,
    bareme: evaluation.bareme,
  };
}

export async function dossierEnregistrerNotes(
  evaluationId: number,
  etudiants: EntreeNote[],
): Promise<{ ok: true; nombreEnregistre: number }> {
  await delai();
  const evaluation = evaluationsDossier.find(
    (item) => item.id === evaluationId,
  );
  if (!evaluation)
    throw new ApiError({ message: "Évaluation introuvable.", statusCode: 404 });
  if (
    etudiants.some(
      (ligne) =>
        !ETUDIANTS_DOSSIER.some(
          (etudiant) => etudiant.id === ligne.etudiantId,
        ) ||
        (ligne.note !== null &&
          (ligne.note < 0 || ligne.note > evaluation.bareme)),
    )
  ) {
    throw new ApiError({
      message: "Étudiant non inscrit ou note hors barème.",
      statusCode: 400,
    });
  }
  for (const ligne of etudiants)
    evaluation.notes[ligne.etudiantId] = ligne.note;
  return { ok: true, nombreEnregistre: etudiants.length };
}

export async function dossierSeancesPresence(
  courseId: number,
): Promise<SeancePresence[]> {
  await delai();
  synchroniserPresencesDepuisQrMock();
  return presencesDossier
    .filter((session) => session.courseId === courseId)
    .map((session) => ({
      id: session.id,
      date: session.date,
      libelle: session.libelle,
      effectif: session.effectif,
      marques: session.marques,
    }));
}

export async function dossierCreerSeancePresence(
  courseId: number,
  entree: { date: string; libelle: string },
): Promise<{ id: number; date: string; libelle: string }> {
  await delai();
  if (!UE_CAHIER.some((ue) => ue.ueId === courseId)) {
    throw new ApiError({ message: "UE introuvable.", statusCode: 404 });
  }
  const session = {
    id: ++presenceSessionId,
    courseId,
    date: entree.date,
    libelle: entree.libelle,
    effectif: ETUDIANTS_DOSSIER.length,
    marques: 0,
    etudiantStatuts: {},
  };
  presencesDossier = [session, ...presencesDossier];
  return { id: session.id, date: session.date, libelle: session.libelle };
}

export async function dossierPresenceSeance(
  sessionId: number,
): Promise<DetailSeancePresence> {
  await delai();
  synchroniserPresencesDepuisQrMock();
  const session = presencesDossier.find((item) => item.id === sessionId);
  if (!session)
    throw new ApiError({ message: "Séance introuvable.", statusCode: 404 });
  return {
    seance: {
      id: session.id,
      course_id: session.courseId,
      date: session.date,
      libelle: session.libelle,
    },
    etudiants: ETUDIANTS_DOSSIER.map((etudiant) => ({
      ...etudiant,
      statut: session.etudiantStatuts[etudiant.id] ?? null,
      statistiques: calculerStatistiquesPresence(
        presencesDossier.filter((ligne) => ligne.courseId === session.courseId),
        session.courseId,
        etudiant.id,
      ),
    })),
  };
}

export async function dossierEnregistrerPresences(
  sessionId: number,
  etudiants: EntreePresence[],
): Promise<{ ok: true; nombreEnregistre: number }> {
  await delai();
  const session = presencesDossier.find((item) => item.id === sessionId);
  if (!session)
    throw new ApiError({ message: "Séance introuvable.", statusCode: 404 });
  if (
    etudiants.some(
      (ligne) =>
        !ETUDIANTS_DOSSIER.some((etudiant) => etudiant.id === ligne.etudiantId),
    )
  ) {
    throw new ApiError({
      message: "Étudiant non inscrit à cette UE.",
      statusCode: 400,
    });
  }
  for (const ligne of etudiants)
    session.etudiantStatuts[ligne.etudiantId] = ligne.statut;
  session.marques = Object.keys(session.etudiantStatuts).length;
  return { ok: true, nombreEnregistre: etudiants.length };
}

export async function dossierMesNotes(): Promise<NoteEtudiant[]> {
  await delai();
  const etudiantId = sessionMemoire?.utilisateur.id;
  if (!etudiantId) return [];
  return evaluationsDossier.flatMap((evaluation) => {
    const cours = UE_CAHIER.find((ue) => ue.ueId === evaluation.courseId);
    if (!cours) return [];
    return [
      {
        evaluationId: evaluation.id,
        coursId: evaluation.courseId,
        code: cours.code,
        intitule: cours.intitule,
        libelle: evaluation.libelle,
        bareme: evaluation.bareme,
        note: evaluation.notes[etudiantId] ?? null,
        createdAt: evaluation.creeLe ?? new Date(0).toISOString(),
      },
    ];
  });
}

function calculerStatistiquesPresence(
  seances: typeof presencesDossier,
  courseId: number,
  etudiantId: number,
) {
  const total = seances.filter((session) => session.courseId === courseId);
  const statuts = total
    .map((session) => session.etudiantStatuts[etudiantId])
    .filter((statut): statut is StatutPresenceEtudiant => statut !== undefined);
  const presents = statuts.filter((statut) => statut === "present").length;
  const absents = statuts.filter((statut) => statut === "absent").length;
  const retards = statuts.filter((statut) => statut === "retard").length;
  const justifiees = statuts.filter((statut) => statut === "justifie").length;
  const marques = presents + absents + retards;
  return {
    seancesTotal: total.length,
    seancesMarquees: marques,
    presents,
    absents,
    retards,
    justifiees,
    tauxPresence:
      marques > 0 ? Math.round(((presents + retards) / marques) * 100) : null,
  };
}

export async function dossierMesPresences(): Promise<PresencesEtudiant> {
  await delai();
  synchroniserPresencesDepuisQrMock();
  const etudiantId = sessionMemoire?.utilisateur.id;
  const coursInscrits = new Set(
    etudiantId ? (INSCRIPTIONS_DOSSIER[etudiantId] ?? []) : [],
  );
  const presences = !etudiantId
    ? []
    : presencesDossier.flatMap((session) => {
        if (!coursInscrits.has(session.courseId)) return [];
        const statut = session.etudiantStatuts[etudiantId];
        const cours = UE_CAHIER.find((ue) => ue.ueId === session.courseId);
        if (!statut || !cours) return [];
        return [
          {
            seanceId: session.id,
            coursId: session.courseId,
            code: cours.code,
            intitule: cours.intitule,
            date: session.date,
            libelle: session.libelle,
            statut,
          },
        ];
      });
  const presents = presences.filter(
    (presence) => presence.statut === "present",
  ).length;
  const absents = presences.filter(
    (presence) => presence.statut === "absent",
  ).length;
  const retards = presences.filter(
    (presence) => presence.statut === "retard",
  ).length;
  const justifiees = presences.filter(
    (presence) => presence.statut === "justifie",
  ).length;
  const seancesTotal = presencesDossier.filter((session) =>
    coursInscrits.has(session.courseId),
  ).length;
  const seancesMarquees = presents + absents + retards;
  return {
    statistiques: {
      seancesTotal,
      seancesMarquees,
      presents,
      absents,
      retards,
      justifiees,
      tauxPresence:
        seancesMarquees > 0
          ? Math.round(((presents + retards) / seancesMarquees) * 100)
          : null,
    },
    presences,
  };
}

export async function presenceDemarrerSession(
  seanceId: number,
): Promise<SessionQrPresence> {
  await delai(120);
  const seance = presencesDossier.find((item) => item.id === seanceId);
  if (!seance) {
    throw new ApiError({ message: "Séance introuvable.", statusCode: 404 });
  }
  const cours = UE_CAHIER.find((ue) => ue.ueId === seance.courseId) ?? UE_CAHIER[0];
  const nowMs = Date.now();
  const sessions = lireSessionsQrStockees();
  const existante = sessions[String(seanceId)];

  const secretKey =
    existante?.secretKey ??
    `enp-mock-qr-${seanceId}-${Math.random().toString(36).slice(2, 14)}`;
  const counter = (existante?.counter ?? 0) + 1;
  const jeton = genererJetonPresenceClient(seanceId, counter, secretKey, nowMs);

  const etudiantsDejaPresents = Object.entries(seance.etudiantStatuts)
    .filter(([, statut]) => statut === "present" || statut === "retard")
    .map(([id]) => Number(id));
  const scannes = Array.from(
    new Set([...(existante?.etudiantsScannes ?? []), ...etudiantsDejaPresents]),
  );

  const sessionQr: SessionQrMockPersistee = {
    sessionId: existante?.sessionId ?? seanceId * 10 + 1,
    seanceId,
    courseId: seance.courseId,
    codeUe: cours.code,
    intituleUe: cours.intitule,
    libelleSeance: seance.libelle,
    dateSeance: seance.date,
    statut: "ouverte",
    secretKey,
    ouvertA: existante?.ouvertA ?? new Date(nowMs).toISOString(),
    fermeA: null,
    counter,
    lastToken: jeton.token,
    lastTokenTimestampMs: jeton.timestampMs,
    dernierVirtuelMs: nowMs,
    etudiantsScannes: scannes,
    appareilsParEtudiant: existante?.appareilsParEtudiant ?? {},
    recents: existante?.recents ?? [],
  };

  sessions[String(seanceId)] = sessionQr;
  ecrireSessionsQrStockees(sessions);
  synchroniserPresencesDepuisQrMock();
  return formaterSessionQr(sessionQr, nowMs);
}

export async function presenceObtenirJeton(
  seanceId: number,
): Promise<SessionQrPresence> {
  await delai(90);
  const nowMs = Date.now();
  const sessions = lireSessionsQrStockees();
  const sessionQr = sessions[String(seanceId)];
  if (!sessionQr) {
    return presenceDemarrerSession(seanceId);
  }

  avancerEmargementsVirtuels(sessionQr, nowMs);

  if (
    sessionQr.statut === "ouverte" &&
    (!sessionQr.lastToken || nowMs - sessionQr.lastTokenTimestampMs >= 5500)
  ) {
    sessionQr.counter += 1;
    const jeton = genererJetonPresenceClient(
      seanceId,
      sessionQr.counter,
      sessionQr.secretKey,
      nowMs,
    );
    sessionQr.lastToken = jeton.token;
    sessionQr.lastTokenTimestampMs = jeton.timestampMs;
  }

  sessions[String(seanceId)] = sessionQr;
  ecrireSessionsQrStockees(sessions);
  synchroniserPresencesDepuisQrMock();
  return formaterSessionQr(sessionQr, nowMs);
}

export async function presenceMettreEnPause(
  seanceId: number,
): Promise<SessionQrPresence> {
  await delai(100);
  const nowMs = Date.now();
  const sessions = lireSessionsQrStockees();
  const sessionQr = sessions[String(seanceId)];
  if (!sessionQr || sessionQr.statut !== "ouverte") {
    throw new ApiError({
      message: "Aucune session ouverte à mettre en pause pour cette séance.",
      statusCode: 404,
    });
  }
  sessionQr.statut = "pause";
  sessionQr.lastToken = "";
  sessions[String(seanceId)] = sessionQr;
  ecrireSessionsQrStockees(sessions);
  return formaterSessionQr(sessionQr, nowMs);
}

export async function presenceReprendreSession(
  seanceId: number,
): Promise<SessionQrPresence> {
  await delai(100);
  const nowMs = Date.now();
  const sessions = lireSessionsQrStockees();
  const sessionQr = sessions[String(seanceId)];
  if (!sessionQr || sessionQr.statut !== "pause") {
    throw new ApiError({
      message: "Aucune session en pause à reprendre pour cette séance.",
      statusCode: 404,
    });
  }
  sessionQr.statut = "ouverte";
  sessionQr.counter += 1;
  const jeton = genererJetonPresenceClient(
    seanceId,
    sessionQr.counter,
    sessionQr.secretKey,
    nowMs,
  );
  sessionQr.lastToken = jeton.token;
  sessionQr.lastTokenTimestampMs = jeton.timestampMs;
  sessions[String(seanceId)] = sessionQr;
  ecrireSessionsQrStockees(sessions);
  return formaterSessionQr(sessionQr, nowMs);
}

export async function presenceCloturerSession(
  seanceId: number,
): Promise<SessionQrPresence> {
  await delai(120);
  const nowMs = Date.now();
  const sessions = lireSessionsQrStockees();
  const sessionQr = sessions[String(seanceId)];
  if (!sessionQr) {
    throw new ApiError({
      message: "Aucune session d'émargement active pour cette séance.",
      statusCode: 404,
    });
  }

  sessionQr.statut = "fermee";
  sessionQr.fermeA = new Date(nowMs).toISOString();
  sessionQr.lastToken = "";
  sessions[String(seanceId)] = sessionQr;
  ecrireSessionsQrStockees(sessions);
  synchroniserPresencesDepuisQrMock();
  return formaterSessionQr(sessionQr, nowMs);
}

export async function presenceScannerQr(corps: {
  token: string;
  deviceFingerprint: string;
}): Promise<ResultatScanPresence> {
  await delai(120);
  const etudiant = sessionMemoire?.utilisateur;
  if (!etudiant) {
    throw new ApiError({
      message: "Session expirée. Veuillez vous reconnecter.",
      statusCode: 401,
    });
  }

  const meta = parserJetonPresence(corps.token);
  if (!meta) {
    throw new ApiError({
      message: "QR Code invalide ou non reconnu par la plateforme ENP.",
      statusCode: 400,
    });
  }

  const sessions = lireSessionsQrStockees();
  const sessionQr = sessions[String(meta.seanceId)];
  if (!sessionQr) {
    throw new ApiError({
      message: "Aucune session d'émargement ouverte pour ce QR Code.",
      statusCode: 404,
    });
  }

  const nowMs = Date.now();
  const evaluation = evaluerReglesScan(
    corps.token,
    etudiant.id,
    corps.deviceFingerprint,
    {
      statut: sessionQr.statut,
      secretKey: sessionQr.secretKey,
      etudiantsInscrits: ETUDIANTS_DOSSIER.map((e) => e.id),
      etudiantsScannes: sessionQr.etudiantsScannes,
      appareilsParEtudiant: sessionQr.appareilsParEtudiant,
    },
    nowMs,
  );

  if (!evaluation.valide) {
    const statusCode =
      evaluation.codeErreur === "deja_emarge"
        ? 409
        : evaluation.codeErreur === "session_fermee" ||
            evaluation.codeErreur === "appareil_partage" ||
            evaluation.codeErreur === "non_inscrit"
          ? 403
          : 400;
    throw new ApiError({
      message: evaluation.erreur ?? "Émargement refusé.",
      statusCode,
    });
  }

  const scanneA = new Date(nowMs).toISOString();
  const ficheEtudiant = ETUDIANTS_DOSSIER.find((e) => e.id === etudiant.id);
  sessionQr.etudiantsScannes.push(etudiant.id);
  sessionQr.appareilsParEtudiant[corps.deviceFingerprint] = etudiant.id;
  sessionQr.recents.unshift({
    etudiantId: etudiant.id,
    nom: ficheEtudiant?.nom ?? etudiant.nom,
    prenom: ficheEtudiant?.prenom ?? etudiant.prenom,
    identifiant: ficheEtudiant?.identifiant ?? `ETU-${etudiant.id}`,
    scanneA,
  });
  sessionQr.recents = sessionQr.recents.slice(0, 10);

  sessions[String(meta.seanceId)] = sessionQr;
  ecrireSessionsQrStockees(sessions);
  synchroniserPresencesDepuisQrMock();

  const heureFormatee = formaterHeureCourte(scanneA);
  return {
    ok: true,
    seanceId: sessionQr.seanceId,
    codeUe: sessionQr.codeUe,
    intituleUe: sessionQr.intituleUe,
    libelleSeance: sessionQr.libelleSeance,
    dateSeance: sessionQr.dateSeance,
    scanneA,
    statut: "present",
    message: `Présence validée pour ${sessionQr.codeUe} à ${heureFormatee}`,
  };
}

const CLE_STOCKAGE_JUSTIFICATIFS_MOCK = "enp_mock_justificatifs_absence_v1";

function lireJustificatifsMock(): JustificatifAbsence[] {
  try {
    if (typeof window === "undefined") return [];
    const brut = window.localStorage.getItem(CLE_STOCKAGE_JUSTIFICATIFS_MOCK);
    if (!brut) {
      const initial: JustificatifAbsence[] = [
        {
          id: 501,
          seanceId: 2,
          courseId: 401,
          codeUe: "INF501",
          intituleUe: "Algorithmique avancée",
          dateSeance: "2026-09-20",
          libelleSeance: "Cours magistral",
          etudiantId: 1002,
          etudiantNom: "Cherif",
          etudiantPrenom: "Lina",
          etudiantIdentifiant: "DEMO-DEL",
          motif: "Convocation officielle au bureau des stages ENP.",
          nomFichier: "convocation_stage_enp.pdf",
          typeMime: "application/pdf",
          tailleOctets: 184_320,
          statut: "en_attente",
          commentaireValidation: null,
          deposeLe: new Date(Date.now() - 3_600_000).toISOString(),
          traiteLe: null,
        },
      ];
      window.localStorage.setItem(
        CLE_STOCKAGE_JUSTIFICATIFS_MOCK,
        JSON.stringify(initial),
      );
      return initial;
    }
    const parsed = JSON.parse(brut);
    return Array.isArray(parsed) ? (parsed as JustificatifAbsence[]) : [];
  } catch {
    return [];
  }
}

function ecrireJustificatifsMock(liste: JustificatifAbsence[]): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      CLE_STOCKAGE_JUSTIFICATIFS_MOCK,
      JSON.stringify(liste),
    );
  } catch {
    // Stockage local non disponible
  }
}

export async function dossierListerJustificatifs(
  courseId?: number,
): Promise<JustificatifAbsence[]> {
  await delai(90);
  const utilisateur = sessionMemoire?.utilisateur;
  const tous = lireJustificatifsMock();
  if (!utilisateur) return [];
  if (
    utilisateur.activeRole === "etudiant" ||
    utilisateur.activeRole === "delegue"
  ) {
    return tous.filter((j) => j.etudiantId === utilisateur.id);
  }
  if (typeof courseId === "number") {
    return tous.filter((j) => j.courseId === courseId);
  }
  return tous;
}

export async function dossierSoumettreJustificatif(
  corps: SoumissionJustificatif,
): Promise<JustificatifAbsence> {
  await delai(140);
  const utilisateur = sessionMemoire?.utilisateur;
  if (!utilisateur) {
    throw new ApiError({
      message: "Session expirée. Veuillez vous reconnecter.",
      statusCode: 401,
    });
  }

  const seance = presencesDossier.find((s) => s.id === corps.seanceId);
  if (!seance) {
    throw new ApiError({
      message: "Séance introuvable pour le dépôt de justificatif.",
      statusCode: 404,
    });
  }
  const cours = UE_CAHIER.find((c) => c.ueId === seance.courseId);
  const fiche = ETUDIANTS_DOSSIER.find((e) => e.id === utilisateur.id);
  const liste = lireJustificatifsMock();
  const prochainId =
    liste.reduce((max, item) => Math.max(max, item.id), 500) + 1;

  const nouveau: JustificatifAbsence = {
    id: prochainId,
    seanceId: seance.id,
    courseId: seance.courseId,
    codeUe: cours?.code ?? "UE",
    intituleUe: cours?.intitule ?? "Unité d'enseignement",
    dateSeance: seance.date,
    libelleSeance: seance.libelle,
    etudiantId: utilisateur.id,
    etudiantNom: fiche?.nom ?? utilisateur.nom,
    etudiantPrenom: fiche?.prenom ?? utilisateur.prenom,
    etudiantIdentifiant: fiche?.identifiant ?? `ETU-${utilisateur.id}`,
    motif: corps.motif.trim(),
    nomFichier: corps.nomFichier.trim(),
    typeMime: corps.typeMime,
    tailleOctets: corps.tailleOctets,
    statut: "en_attente",
    commentaireValidation: null,
    deposeLe: new Date().toISOString(),
    traiteLe: null,
  };

  liste.unshift(nouveau);
  ecrireJustificatifsMock(liste);
  return nouveau;
}

export async function dossierTraiterJustificatif(
  justificatifId: number,
  corps: {
    statut: Exclude<StatutJustificatif, "en_attente">;
    commentaireValidation?: string;
  },
): Promise<JustificatifAbsence> {
  await delai(120);
  const liste = lireJustificatifsMock();
  const cible = liste.find((j) => j.id === justificatifId);
  if (!cible) {
    throw new ApiError({
      message: "Justificatif introuvable.",
      statusCode: 404,
    });
  }

  cible.statut = corps.statut;
  cible.commentaireValidation = corps.commentaireValidation?.trim() || null;
  cible.traiteLe = new Date().toISOString();

  if (corps.statut === "valide") {
    const seance = presencesDossier.find((s) => s.id === cible.seanceId);
    if (seance) {
      seance.etudiantStatuts[cible.etudiantId] = "justifie";
      seance.marques = Object.keys(seance.etudiantStatuts).length;
    }
  }

  ecrireJustificatifsMock(liste);
  return cible;
}

/* ================================================================== */
/*  DONNÉES SIMULÉES : Pilotage (chef de département)                  */
/* ================================================================== */

const CAMPAGNES_PILOTAGE: Campagne[] = [
  {
    id: 10,
    libelle: "Évaluations S5 : Automne 2026",
    semestre: "S5",
    anneeUniversitaire: "2026-2027",
    debut: "2026-09-01",
    fin: "2026-11-15",
    statut: "close",
  },
  {
    id: 11,
    libelle: "Évaluations S3 : Automne 2026",
    semestre: "S3",
    anneeUniversitaire: "2026-2027",
    debut: "2026-09-01",
    fin: "2026-11-30",
    statut: "ouverte",
  },
];

const PARTICIPATION_DATA: Record<number, ParticipationUe[]> = {
  10: [
    {
      ueId: 501,
      code: "INF501",
      intitule: "Algorithmique avancée",
      inscrits: 40,
      repondants: 36,
    },
    {
      ueId: 502,
      code: "MAT502",
      intitule: "Probabilités et statistiques",
      inscrits: 35,
      repondants: 28,
    },
    {
      ueId: 503,
      code: "INF503",
      intitule: "Bases de données",
      inscrits: 30,
      repondants: 21,
    },
    {
      ueId: 504,
      code: "ELN504",
      intitule: "Électronique numérique",
      inscrits: 25,
      repondants: 18,
    },
    {
      ueId: 505,
      code: "MEC505",
      intitule: "Mécanique des fluides",
      inscrits: 20,
      repondants: 14,
    },
    {
      ueId: 506,
      code: "INF506",
      intitule: "Réseaux et protocoles",
      inscrits: 28,
      repondants: 25,
    },
    {
      ueId: 507,
      code: "ANG507",
      intitule: "Anglais scientifique",
      inscrits: 45,
      repondants: 16,
    },
    {
      ueId: 508,
      code: "PHY508",
      intitule: "Physique quantique",
      inscrits: 22,
      repondants: 3,
    },
  ],
  11: [
    {
      ueId: 511,
      code: "INF301",
      intitule: "Programmation orientée objet",
      inscrits: 38,
      repondants: 15,
    },
    {
      ueId: 512,
      code: "MAT301",
      intitule: "Algèbre linéaire",
      inscrits: 33,
      repondants: 12,
    },
    {
      ueId: 513,
      code: "INF303",
      intitule: "Structures de données",
      inscrits: 30,
      repondants: 22,
    },
    {
      ueId: 514,
      code: "ELN304",
      intitule: "Circuits logiques",
      inscrits: 26,
      repondants: 10,
    },
    {
      ueId: 515,
      code: "MEC305",
      intitule: "Mécanique des solides",
      inscrits: 24,
      repondants: 8,
    },
    {
      ueId: 516,
      code: "INF306",
      intitule: "Systèmes d'exploitation",
      inscrits: 32,
      repondants: 20,
    },
    {
      ueId: 517,
      code: "ANG307",
      intitule: "Anglais technique",
      inscrits: 42,
      repondants: 19,
    },
    {
      ueId: 518,
      code: "PHY308",
      intitule: "Thermodynamique",
      inscrits: 20,
      repondants: 7,
    },
  ],
};

const SYNTHESE_DATA: Record<number, Synthese> = {
  10: {
    campagne: CAMPAGNES_PILOTAGE[0],
    campus: "Campus Nord",
    departement: "Département Informatique",
    totalRepondants: 161,
    lignes: [
      {
        ueId: 501,
        code: "INF501",
        intitule: "Algorithmique avancée",
        enseignant: "Hamidi Karim",
        nbReponses: 36,
        moyA: 4.2,
        moyB: 4.4,
        moyC: 3.8,
        moyD: 3.5,
        satisfactionE: 4.3,
        detailDisponible: true,
      },
      {
        ueId: 502,
        code: "MAT502",
        intitule: "Probabilités et statistiques",
        enseignant: "Saidi Nora",
        nbReponses: 28,
        moyA: 3.9,
        moyB: 3.7,
        moyC: 3.2,
        moyD: 3.1,
        satisfactionE: 3.5,
        detailDisponible: true,
      },
      {
        ueId: 503,
        code: "INF503",
        intitule: "Bases de données",
        enseignant: "Mokrani Yacine",
        nbReponses: 21,
        moyA: 4.0,
        moyB: 4.1,
        moyC: 3.5,
        moyD: 3.3,
        satisfactionE: 4.0,
        detailDisponible: true,
      },
      {
        ueId: 504,
        code: "ELN504",
        intitule: "Électronique numérique",
        enseignant: "Benali Amine",
        nbReponses: 18,
        moyA: 3.5,
        moyB: 3.4,
        moyC: 2.8,
        moyD: 2.9,
        satisfactionE: 2.7,
        detailDisponible: true,
      },
      {
        ueId: 505,
        code: "MEC505",
        intitule: "Mécanique des fluides",
        enseignant: "Cherif Lina",
        nbReponses: 14,
        moyA: 3.6,
        moyB: 3.8,
        moyC: 3.3,
        moyD: 3.0,
        satisfactionE: 3.6,
        detailDisponible: true,
      },
      {
        ueId: 506,
        code: "INF506",
        intitule: "Réseaux et protocoles",
        enseignant: "Hamidi Karim",
        nbReponses: 25,
        moyA: 4.1,
        moyB: 4.0,
        moyC: 3.6,
        moyD: 3.4,
        satisfactionE: 4.1,
        detailDisponible: true,
      },
      {
        ueId: 507,
        code: "ANG507",
        intitule: "Anglais scientifique",
        enseignant: "Saidi Nora",
        nbReponses: 16,
        moyA: 3.3,
        moyB: 3.5,
        moyC: 3.1,
        moyD: 2.8,
        satisfactionE: 3.2,
        detailDisponible: true,
      },
      {
        ueId: 508,
        code: "PHY508",
        intitule: "Physique quantique",
        enseignant: "Mokrani Yacine",
        nbReponses: 3,
        moyA: null,
        moyB: null,
        moyC: null,
        moyD: null,
        satisfactionE: null,
        detailDisponible: false,
      },
    ],
  },
  11: {
    campagne: CAMPAGNES_PILOTAGE[1],
    campus: "Campus Nord",
    departement: "Département Informatique",
    totalRepondants: 113,
    lignes: [
      {
        ueId: 511,
        code: "INF301",
        intitule: "Programmation orientée objet",
        enseignant: "Hamidi Karim",
        nbReponses: 15,
        moyA: 3.8,
        moyB: 4.0,
        moyC: 3.4,
        moyD: 3.2,
        satisfactionE: 3.9,
        detailDisponible: true,
      },
      {
        ueId: 512,
        code: "MAT301",
        intitule: "Algèbre linéaire",
        enseignant: "Saidi Nora",
        nbReponses: 12,
        moyA: 3.5,
        moyB: 3.3,
        moyC: 3.0,
        moyD: 2.9,
        satisfactionE: 3.1,
        detailDisponible: true,
      },
      {
        ueId: 513,
        code: "INF303",
        intitule: "Structures de données",
        enseignant: "Mokrani Yacine",
        nbReponses: 22,
        moyA: 4.3,
        moyB: 4.2,
        moyC: 3.7,
        moyD: 3.5,
        satisfactionE: 4.4,
        detailDisponible: true,
      },
      {
        ueId: 514,
        code: "ELN304",
        intitule: "Circuits logiques",
        enseignant: "Benali Amine",
        nbReponses: 10,
        moyA: 3.2,
        moyB: 3.0,
        moyC: 2.7,
        moyD: 2.6,
        satisfactionE: 2.6,
        detailDisponible: true,
      },
      {
        ueId: 515,
        code: "MEC305",
        intitule: "Mécanique des solides",
        enseignant: "Cherif Lina",
        nbReponses: 8,
        moyA: 3.4,
        moyB: 3.6,
        moyC: 3.1,
        moyD: 2.9,
        satisfactionE: 3.3,
        detailDisponible: true,
      },
      {
        ueId: 516,
        code: "INF306",
        intitule: "Systèmes d'exploitation",
        enseignant: "Hamidi Karim",
        nbReponses: 20,
        moyA: 4.0,
        moyB: 3.9,
        moyC: 3.5,
        moyD: 3.3,
        satisfactionE: 4.0,
        detailDisponible: true,
      },
      {
        ueId: 517,
        code: "ANG307",
        intitule: "Anglais technique",
        enseignant: "Saidi Nora",
        nbReponses: 19,
        moyA: 3.1,
        moyB: 3.3,
        moyC: 2.9,
        moyD: 2.7,
        satisfactionE: 3.0,
        detailDisponible: true,
      },
      {
        ueId: 518,
        code: "PHY308",
        intitule: "Thermodynamique",
        enseignant: "Mokrani Yacine",
        nbReponses: 7,
        moyA: null,
        moyB: null,
        moyC: null,
        moyD: null,
        satisfactionE: null,
        detailDisponible: false,
      },
    ],
  },
};

const suitesMemoire: Map<number, SuitesDonnees> = new Map();

/* ------------------------------------------------------------------ */
/*  API : Pilotage (chef de département)                               */
/* ------------------------------------------------------------------ */

export async function directionStatistiques(
  periode: PeriodeDirection,
): Promise<StatistiquesDirection> {
  await delai();
  const campus: StatistiquesDirection["campus"] = [
    {
      campusId: 1,
      campus: "Campus de Lomé",
      campagnes: periode.semestre === 5 ? 2 : 0,
      campagnesCloses: periode.semestre === 5 ? 1 : 0,
      inscriptions: periode.semestre === 5 ? 85 : 0,
      participations: periode.semestre === 5 ? 62 : 0,
      bulletins: periode.semestre === 5 ? 55 : 0,
      tauxParticipation: periode.semestre === 5 ? 72.94 : null,
      moyenneEvaluations: periode.semestre === 5 ? 3.82 : null,
      coursSynthesables: periode.semestre === 5 ? 8 : 0,
    },
    {
      campusId: 4,
      campus: "Campus de Kara",
      campagnes: periode.semestre === 5 ? 2 : 0,
      campagnesCloses: periode.semestre === 5 ? 1 : 0,
      inscriptions: periode.semestre === 5 ? 60 : 0,
      participations: periode.semestre === 5 ? 47 : 0,
      bulletins: periode.semestre === 5 ? 43 : 0,
      tauxParticipation: periode.semestre === 5 ? 78.33 : null,
      moyenneEvaluations: periode.semestre === 5 ? 3.67 : null,
      coursSynthesables: periode.semestre === 5 ? 6 : 0,
    },
    {
      campusId: 5,
      campus: "Campus de Sokodé",
      campagnes: periode.semestre === 5 ? 1 : 0,
      campagnesCloses: periode.semestre === 5 ? 0 : 0,
      inscriptions: periode.semestre === 5 ? 24 : 0,
      participations: periode.semestre === 5 ? 18 : 0,
      bulletins: 0,
      tauxParticipation: periode.semestre === 5 ? 75 : null,
      moyenneEvaluations: null,
      coursSynthesables: 0,
    },
  ];
  const inscriptions = campus.reduce(
    (somme, ligne) => somme + ligne.inscriptions,
    0,
  );
  const participations = campus.reduce(
    (somme, ligne) => somme + ligne.participations,
    0,
  );
  const bulletins = campus.reduce((somme, ligne) => somme + ligne.bulletins, 0);
  const campagnes = campus.reduce((somme, ligne) => somme + ligne.campagnes, 0);
  const campagnesCloses = campus.reduce(
    (somme, ligne) => somme + ligne.campagnesCloses,
    0,
  );
  const coursSynthesables = campus.reduce(
    (somme, ligne) => somme + ligne.coursSynthesables,
    0,
  );
  const moyennes = campus.filter((ligne) => ligne.moyenneEvaluations !== null);

  return {
    periode,
    seuilAnonymat: 5,
    global: {
      campus: campus.length,
      campagnes,
      campagnesCloses,
      inscriptions,
      participations,
      bulletins,
      tauxParticipation:
        inscriptions === 0
          ? null
          : Math.round((participations / inscriptions) * 10000) / 100,
      moyenneEvaluations:
        moyennes.length === 0
          ? null
          : Math.round(
              (moyennes.reduce(
                (somme, ligne) => somme + (ligne.moyenneEvaluations ?? 0),
                0,
              ) /
                moyennes.length) *
                100,
            ) / 100,
      coursSynthesables,
    },
    campus,
  };
}

export async function directionControles(
  periode: PeriodeDirection,
): Promise<ControlesAcademiques> {
  await delai();
  if (periode.semestre < 1 || periode.semestre > 10) {
    throw new ApiError({
      message: "Période académique invalide.",
      statusCode: 400,
    });
  }
  return {
    reglesVerifiees: [],
    nombreAnomalies: 0,
    anomalies: [],
  };
}

export async function directionPublierStatistiques(
  periode: PeriodeDirection,
): Promise<StatistiquesDirection> {
  return directionStatistiques(periode);
}

export async function pilotageCampagnes(): Promise<Campagne[]> {
  await delai();
  return CAMPAGNES_PILOTAGE.map((c) => ({ ...c }));
}

export async function pilotageParticipation(
  campagneId: number,
): Promise<ParticipationUe[]> {
  await delai();
  const data = PARTICIPATION_DATA[campagneId];
  if (!data)
    throw new ApiError({ message: "Campagne introuvable.", statusCode: 404 });
  return data.map((p) => ({ ...p }));
}

export async function pilotageSynthese(campagneId: number): Promise<Synthese> {
  await delai();
  const s = SYNTHESE_DATA[campagneId];
  if (!s)
    throw new ApiError({ message: "Synthèse introuvable.", statusCode: 404 });
  const lignes: LigneSynthese[] = s.lignes.map((l) => ({ ...l }));
  return { ...s, campagne: { ...s.campagne }, lignes };
}

export async function pilotageSuites(
  campagneId: number,
  corps: SuitesDonnees,
): Promise<SuitesDonnees> {
  await delai();
  suitesMemoire.set(campagneId, { ...corps });
  return { ...corps };
}

export async function pilotageChargerSuites(
  campagneId: number,
): Promise<SuitesDonnees> {
  await delai();
  const existantes = suitesMemoire.get(campagneId);
  return existantes
    ? { ...existantes }
    : {
        meilleuresUe: "",
        ueAttention: "",
        actions: "",
        etabliPar: "",
        date: new Date().toISOString().slice(0, 10),
        visaChef: false,
      };
}

/* ================================================================== */
/*  DONNÉES SIMULÉES : Scolarité                                       */
/* ================================================================== */

const DEPARTEMENTS: DepartementOption[] = [
  { id: 1, nom: "Informatique", campus: "Campus Nord" },
  { id: 2, nom: "Électronique", campus: "Campus Nord" },
  { id: 3, nom: "Génie Mécanique", campus: "Campus Sud" },
];

let campagnesGestionMemoire: CampagneGestion[] = [
  {
    id: 201,
    libelle: "Évaluations S5 : Informatique",
    departmentId: 1,
    departement: "Informatique",
    anneeUniversitaire: "2026-2027",
    semestre: 5,
    versionId: 1,
    debut: "2026-09-01T08:00:00Z",
    fin: "2026-11-15T23:59:59Z",
    statut: "close",
  },
  {
    id: 202,
    libelle: "Évaluations S3 : Informatique",
    departmentId: 1,
    departement: "Informatique",
    anneeUniversitaire: "2026-2027",
    semestre: 3,
    versionId: 1,
    debut: "2026-09-01T08:00:00Z",
    fin: "2026-11-30T23:59:59Z",
    statut: "ouverte",
  },
  {
    id: 203,
    libelle: "Évaluations S1 : Électronique",
    departmentId: 2,
    departement: "Électronique",
    anneeUniversitaire: "2026-2027",
    semestre: 1,
    versionId: 1,
    debut: "2026-10-15T08:00:00Z",
    fin: "2026-12-20T23:59:59Z",
    statut: "brouillon",
  },
];

let referentielsAdministration: ReferentielsAdministration = {
  campus: [
    { id: 1, nom: "Campus Nord" },
    { id: 2, nom: "Campus Sud" },
  ],
  departements: DEPARTEMENTS.map((d) => ({
    ...d,
    campusId: d.campus === "Campus Nord" ? 1 : 2,
  })),
  programmes: [
    {
      id: 1,
      nom: "Cycle Ingénieur",
      departmentId: 1,
      departement: "Informatique",
    },
    {
      id: 2,
      nom: "Cycle Ingénieur",
      departmentId: 2,
      departement: "Électronique",
    },
  ],
};

let unitesScolarite: UniteEnseignementScolarite[] = [
  {
    id: 401,
    code: "INF501",
    intitule: "Algorithmique avancée",
    credits: 5,
    modifiable: true,
    compositeParentId: null,
    composantes: [],
    programmes: [
      { id: 1, nom: "Cycle Préparatoire", departement: "Informatique" },
    ],
  },
  {
    id: 402,
    code: "MAT502",
    intitule: "Probabilités et statistiques",
    credits: 4,
    modifiable: true,
    compositeParentId: null,
    composantes: [],
    programmes: [
      { id: 1, nom: "Cycle Préparatoire", departement: "Informatique" },
    ],
  },
  {
    id: 403,
    code: "INF503",
    intitule: "Bases de données",
    credits: 4,
    modifiable: true,
    compositeParentId: null,
    composantes: [],
    programmes: [
      { id: 2, nom: "Cycle Ingénieur", departement: "Électronique" },
    ],
  },
];

const COMPTES_SANS_MDP = [
  { identifiant: "ETU2026-001", nom: "Amrani", prenom: "Sofiane" },
  { identifiant: "ETU2026-002", nom: "Belkacem", prenom: "Yasmine" },
  { identifiant: "ETU2026-003", nom: "Chibani", prenom: "Mehdi" },
  { identifiant: "ETU2026-004", nom: "Djebbar", prenom: "Amina" },
  { identifiant: "ETU2026-005", nom: "El Hadji", prenom: "Karim" },
  { identifiant: "ETU2026-006", nom: "Ferhat", prenom: "Nour" },
  { identifiant: "ETU2026-007", nom: "Ghali", prenom: "Sami" },
  { identifiant: "ETU2026-008", nom: "Haddad", prenom: "Lina" },
  { identifiant: "ETU2026-009", nom: "Ibrir", prenom: "Walid" },
  { identifiant: "ETU2026-010", nom: "Jacquot", prenom: "Sarah" },
  { identifiant: "ETU2026-011", nom: "Kaci", prenom: "Rayan" },
  { identifiant: "ETU2026-012", nom: "Lounis", prenom: "Ines" },
];

const ALPHABET_CODES = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genererCode(): string {
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += ALPHABET_CODES[Math.floor(Math.random() * ALPHABET_CODES.length)];
  }
  return code.slice(0, 4) + "-" + code.slice(4, 8) + "-" + code.slice(8, 12);
}

const COMMENTAIRES_MODERATION: CommentaireAModerer[] = [
  {
    id: 1,
    ueCode: "INF501",
    ueIntitule: "Algorithmique avancée",
    type: "points_forts",
    texte:
      "Très bonne clarté des explications, le support de cours est complet et bien structuré.",
    statut: "a_moderer",
  },
  {
    id: 2,
    ueCode: "INF501",
    ueIntitule: "Algorithmique avancée",
    type: "points_a_ameliorer",
    texte:
      "Comme je l'ai dit en TD jeudi dernier à Maïssa, ma voisine n'a pas compris les exercices sur les graphes.",
    statut: "a_moderer",
  },
  {
    id: 3,
    ueCode: "MAT502",
    ueIntitule: "Probabilités et statistiques",
    type: "points_forts",
    texte: "Les exercices de TP sont pertinents et couvrent bien le programme.",
    statut: "a_moderer",
  },
  {
    id: 4,
    ueCode: "MAT502",
    ueIntitule: "Probabilités et statistiques",
    type: "points_a_ameliorer",
    texte: "Le rythme est un peu trop rapide sur les lois continues.",
    statut: "a_moderer",
  },
  {
    id: 5,
    ueCode: "INF503",
    ueIntitule: "Bases de données",
    type: "points_forts",
    texte: "Le projet final est très formateur et le sujet est concret.",
    statut: "a_moderer",
  },
  {
    id: 6,
    ueCode: "INF503",
    ueIntitule: "Bases de données",
    type: "points_a_ameliorer",
    texte:
      "Les salles de TP sont trop petites pour notre groupe de 35, on se marchait dessus la semaine dernière avec le prof Hamidi.",
    statut: "a_moderer",
  },
  {
    id: 7,
    ueCode: "ELN504",
    ueIntitule: "Électronique numérique",
    type: "points_forts",
    texte: "Bonne disponibilité de l'enseignant en dehors des cours.",
    statut: "a_moderer",
  },
  {
    id: 8,
    ueCode: "ELN504",
    ueIntitule: "Électronique numérique",
    type: "points_a_ameliorer",
    texte: "Les corrections des examens prennent trop de temps.",
    statut: "a_moderer",
  },
  {
    id: 9,
    ueCode: "MEC505",
    ueIntitule: "Mécanique des fluides",
    type: "points_forts",
    texte:
      "Les TP en laboratoire sont très bien encadrés et le matériel fonctionne.",
    statut: "a_moderer",
  },
  {
    id: 10,
    ueCode: "MEC505",
    ueIntitule: "Mécanique des fluides",
    type: "points_a_ameliorer",
    texte: "Le polycopié contient quelques erreurs de formules à corriger.",
    statut: "a_moderer",
  },
];

const commentairesMemoire: CommentaireAModerer[] = COMMENTAIRES_MODERATION.map(
  (c) => ({ ...c }),
);

const EN_TETES_IMPORT: Record<TypeImport, string[][]> = {
  etudiants: [
    ["matricule", "email", "nom", "prenom"],
    ["matricule", "nom", "prenom", "email"],
  ],
  enseignants: [
    ["matricule", "email", "nom", "prenom"],
    ["email", "nom", "prenom"],
  ],
  ue: [["code", "intitule", "credits"]],
  offres: [
    ["uecode", "programid", "anneeuniversitaire", "semestre"],
    ["code_ue", "programme", "annee_universitaire", "semestre"],
  ],
  affectations: [
    ["courseid", "matricule"],
    [
      "code_ue",
      "programme",
      "annee_universitaire",
      "semestre",
      "email_enseignant",
    ],
  ],
  inscriptions: [
    ["courseid", "matricule"],
    ["matricule", "code_ue", "programme", "annee_universitaire", "semestre"],
  ],
  delegues: [
    ["programid", "matricule", "anneeuniversitaire", "type", "debut", "fin"],
    ["matricule", "programme", "annee_universitaire"],
  ],
  "mandats-chefs-departement": [["campus", "departement", "matricule"]],
  catalogue: [],
  presences: [],
};

/* ------------------------------------------------------------------ */
/*  API : Scolarité                                                    */
/* ------------------------------------------------------------------ */

export async function scolariteTableauDeBord(): Promise<TableauDeBordScolarite> {
  await delai();
  const ouvertes = campagnesGestionMemoire.filter(
    (c) => c.statut === "ouverte",
  ).length;
  return {
    campagnesOuvertes: ouvertes,
    comptesSansMotDePasse: COMPTES_SANS_MDP.length,
    commentairesAModerer: commentairesMemoire.filter(
      (c) => c.statut === "a_moderer",
    ).length,
    participation: { inscriptions: 240, participations: 165, bulletins: 158 },
    campagnes: campagnesGestionMemoire.map((c) => ({ ...c })),
  };
}

export async function scolariteCampagnes(): Promise<CampagneGestion[]> {
  await delai();
  return campagnesGestionMemoire.map((c) => ({ ...c }));
}

export async function scolariteCreerCampagne(
  corps: CampagneEntreeGestion,
): Promise<CampagneGestion> {
  await delai();
  const erreurs: string[] = [];
  if (!corps.libelle?.trim() || corps.libelle.length > 200) {
    erreurs.push("Le libellé doit contenir entre 1 et 200 caractères.");
  }
  const m = corps.anneeUniversitaire.match(/^(\d{4})-(\d{4})$/);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) {
    erreurs.push(
      "L'année universitaire doit être au format AAAA-AAAA avec deux années consécutives.",
    );
  }
  if (corps.semestre < 1 || corps.semestre > 10) {
    erreurs.push("Le semestre doit être compris entre 1 et 10.");
  }
  const dDebut = new Date(corps.debut);
  const dFin = new Date(corps.fin);
  if (isNaN(dDebut.getTime()) || isNaN(dFin.getTime())) {
    erreurs.push("Les dates ne sont pas valides.");
  } else if (dFin <= dDebut) {
    erreurs.push("La date de fin doit être postérieure à la date de début.");
  } else if (dFin <= new Date()) {
    erreurs.push("La date de fin doit être dans le futur.");
  }
  const dep = DEPARTEMENTS.find((d) => d.id === corps.departmentId);
  if (!dep) {
    erreurs.push("Département introuvable.");
  }

  const existante = campagnesGestionMemoire.find(
    (c) =>
      c.departmentId === corps.departmentId &&
      c.anneeUniversitaire === corps.anneeUniversitaire &&
      c.semestre === corps.semestre,
  );
  if (existante) {
    throw new ApiError({
      message:
        "Une campagne existe déjà pour ce département, cette année et ce semestre.",
      statusCode: 409,
    });
  }

  if (erreurs.length > 0) {
    throw new ApiError({ message: erreurs, statusCode: 400 });
  }

  const id = Math.max(0, ...campagnesGestionMemoire.map((c) => c.id)) + 1;
  const nouvelle: CampagneGestion = {
    id,
    libelle: corps.libelle.trim(),
    departmentId: corps.departmentId,
    departement: dep!.nom,
    anneeUniversitaire: corps.anneeUniversitaire,
    semestre: corps.semestre,
    versionId: 1,
    debut: corps.debut,
    fin: corps.fin,
    statut: "brouillon",
  };
  campagnesGestionMemoire = [...campagnesGestionMemoire, nouvelle];
  return { ...nouvelle };
}

export async function scolariteOuvrirCampagne(
  id: number,
): Promise<CampagneGestion> {
  await delai();
  const idx = campagnesGestionMemoire.findIndex((c) => c.id === id);
  if (idx === -1)
    throw new ApiError({ message: "Campagne introuvable.", statusCode: 404 });
  if (campagnesGestionMemoire[idx].statut !== "brouillon") {
    throw new ApiError({
      message: "Seule une campagne en brouillon peut être ouverte.",
      statusCode: 409,
    });
  }
  campagnesGestionMemoire[idx] = {
    ...campagnesGestionMemoire[idx],
    statut: "ouverte",
  };
  return { ...campagnesGestionMemoire[idx] };
}

export async function scolariteCloturerCampagne(
  id: number,
): Promise<CampagneGestion> {
  await delai();
  const idx = campagnesGestionMemoire.findIndex((c) => c.id === id);
  if (idx === -1)
    throw new ApiError({ message: "Campagne introuvable.", statusCode: 404 });
  if (campagnesGestionMemoire[idx].statut !== "ouverte") {
    throw new ApiError({
      message: "Seule une campagne ouverte peut être clôturée.",
      statusCode: 409,
    });
  }
  campagnesGestionMemoire[idx] = {
    ...campagnesGestionMemoire[idx],
    statut: "close",
  };
  return { ...campagnesGestionMemoire[idx] };
}

export async function scolariteDepartements(): Promise<DepartementOption[]> {
  await delai();
  return DEPARTEMENTS.map((d) => ({ ...d }));
}

export async function scolariteProgrammes(): Promise<ProgrammeScolarite[]> {
  await delai();
  return referentielsAdministration.programmes.map((programme) => {
    const departement = referentielsAdministration.departements.find(
      (ligne) => ligne.id === programme.departmentId,
    );
    return {
      ...programme,
      campus: departement?.campus ?? "",
    };
  });
}

export async function scolariteCreerProgramme(
  departmentId: number,
  nom: string,
): Promise<ProgrammeScolarite> {
  await delai();
  const department = referentielsAdministration.departements.find(
    (ligne) => ligne.id === departmentId,
  );
  if (!department) {
    throw new ApiError({
      message: "Département introuvable.",
      statusCode: 404,
    });
  }
  if (
    referentielsAdministration.programmes.some(
      (ligne) =>
        ligne.departmentId === departmentId &&
        ligne.nom.toLowerCase() === nom.trim().toLowerCase(),
    )
  ) {
    throw new ApiError({
      message: "Ce programme existe déjà dans ce département.",
      statusCode: 409,
    });
  }
  const programme: ProgrammeScolarite = {
    id: Date.now(),
    nom: nom.trim(),
    departmentId,
    departement: department.nom,
    campus: department.campus,
  };
  referentielsAdministration = {
    ...referentielsAdministration,
    programmes: [...referentielsAdministration.programmes, programme],
  };
  return programme;
}

export async function scolariteModifierProgramme(
  id: number,
  modifications: { departmentId?: number; nom?: string },
): Promise<ProgrammeScolarite> {
  await delai();
  const existing = referentielsAdministration.programmes.find(
    (ligne) => ligne.id === id,
  );
  if (!existing) {
    throw new ApiError({ message: "Programme introuvable.", statusCode: 404 });
  }
  const departmentId = modifications.departmentId ?? existing.departmentId;
  const department = referentielsAdministration.departements.find(
    (ligne) => ligne.id === departmentId,
  );
  if (!department) {
    throw new ApiError({
      message: "Département introuvable.",
      statusCode: 404,
    });
  }
  const nom = modifications.nom?.trim() ?? existing.nom;
  if (
    referentielsAdministration.programmes.some(
      (ligne) =>
        ligne.id !== id &&
        ligne.departmentId === departmentId &&
        ligne.nom.toLowerCase() === nom.toLowerCase(),
    )
  ) {
    throw new ApiError({
      message: "Ce programme existe déjà dans ce département.",
      statusCode: 409,
    });
  }
  const updated: ProgrammeScolarite = {
    id,
    nom,
    departmentId,
    departement: department.nom,
    campus: department.campus,
  };
  referentielsAdministration = {
    ...referentielsAdministration,
    programmes: referentielsAdministration.programmes.map((ligne) =>
      ligne.id === id ? updated : ligne,
    ),
  };
  return updated;
}

export async function scolariteSupprimerProgramme(
  id: number,
): Promise<ReponseSimple> {
  await delai();
  if (!referentielsAdministration.programmes.some((ligne) => ligne.id === id)) {
    throw new ApiError({ message: "Programme introuvable.", statusCode: 404 });
  }
  referentielsAdministration = {
    ...referentielsAdministration,
    programmes: referentielsAdministration.programmes.filter(
      (ligne) => ligne.id !== id,
    ),
  };
  return { ok: true };
}

export async function scolariteUnitesEnseignement(): Promise<
  UniteEnseignementScolarite[]
> {
  await delai();
  return unitesScolarite.map((ligne) => ({ ...ligne }));
}

export async function scolariteCreerUniteEnseignement(entree: {
  code: string;
  intitule: string;
  credits: number;
  composantesIds?: number[];
}): Promise<UniteEnseignementScolarite> {
  await delai();
  if (
    unitesScolarite.some(
      (ligne) => ligne.code.toLowerCase() === entree.code.trim().toLowerCase(),
    )
  ) {
    throw new ApiError({ message: "Ce code UE existe déjà.", statusCode: 409 });
  }
  const unite: UniteEnseignementScolarite = {
    id: Date.now(),
    ...entree,
    code: entree.code.trim(),
    intitule: entree.intitule.trim(),
    modifiable: true,
    compositeParentId: null,
    composantes: (entree.composantesIds ?? [])
      .map((composanteId) =>
        unitesScolarite.find((ligne) => ligne.id === composanteId),
      )
      .filter((ligne): ligne is UniteEnseignementScolarite => Boolean(ligne))
      .map(({ id: composanteId, code, intitule, credits }) => ({
        id: composanteId,
        code,
        intitule,
        credits,
      })),
    programmes: [],
  };
  unitesScolarite = unitesScolarite.map((ligne) =>
    entree.composantesIds?.includes(ligne.id)
      ? { ...ligne, compositeParentId: unite.id }
      : ligne,
  );
  unitesScolarite = [...unitesScolarite, unite];
  return { ...unite };
}

export async function scolariteModifierUniteEnseignement(
  id: number,
  entree: {
    code: string;
    intitule: string;
    credits: number;
    composantesIds?: number[];
  },
): Promise<UniteEnseignementScolarite> {
  await delai();
  if (!unitesScolarite.some((ligne) => ligne.id === id)) {
    throw new ApiError({ message: "UE introuvable.", statusCode: 404 });
  }
  if (
    unitesScolarite.some(
      (ligne) =>
        ligne.id !== id &&
        ligne.code.toLowerCase() === entree.code.trim().toLowerCase(),
    )
  ) {
    throw new ApiError({ message: "Ce code UE existe déjà.", statusCode: 409 });
  }
  const updated: UniteEnseignementScolarite = {
    id,
    ...entree,
    code: entree.code.trim(),
    intitule: entree.intitule.trim(),
    modifiable: true,
    compositeParentId:
      unitesScolarite.find((ligne) => ligne.id === id)?.compositeParentId ??
      null,
    composantes: (entree.composantesIds ?? [])
      .map((composanteId) =>
        unitesScolarite.find((ligne) => ligne.id === composanteId),
      )
      .filter((ligne): ligne is UniteEnseignementScolarite => Boolean(ligne))
      .map(({ id: composanteId, code, intitule, credits }) => ({
        id: composanteId,
        code,
        intitule,
        credits,
      })),
    programmes:
      unitesScolarite.find((ligne) => ligne.id === id)?.programmes ?? [],
  };
  unitesScolarite = unitesScolarite.map((ligne) =>
    entree.composantesIds?.includes(ligne.id)
      ? { ...ligne, compositeParentId: id }
      : ligne.compositeParentId === id
        ? { ...ligne, compositeParentId: null }
        : ligne,
  );
  unitesScolarite = unitesScolarite.map((ligne) =>
    ligne.id === id ? updated : ligne,
  );
  return { ...updated };
}

export async function scolariteSupprimerUniteEnseignement(
  id: number,
): Promise<ReponseSimple> {
  await delai();
  if (!unitesScolarite.some((ligne) => ligne.id === id)) {
    throw new ApiError({ message: "UE introuvable.", statusCode: 404 });
  }
  unitesScolarite = unitesScolarite.filter((ligne) => ligne.id !== id);
  return { ok: true };
}

export async function scolariteComptes(): Promise<CompteAdministration[]> {
  await delai();
  return COMPTES.map((compte) => ({
    id: compte.id,
    matricule: compte.identifiant,
    email: `${compte.identifiant.toLowerCase()}@exemple.test`,
    nom: compte.nom,
    prenom: compte.prenom,
    actif: true,
    motDePasseConfigure: true,
    roles: compte.roles as Role[],
    dansPerimetre: true,
    peutSupprimer: true,
  }));
}

export async function scolariteSupprimerCompte(
  id: number,
): Promise<ReponseSimple> {
  await delai();
  const index = COMPTES.findIndex((compte) => compte.id === id);
  if (index < 0) {
    throw new ApiError({ message: "Compte introuvable.", statusCode: 404 });
  }
  COMPTES.splice(index, 1);
  return { ok: true };
}

export async function scolariteVerifierSmtp(): Promise<ReponseSimple> {
  await delai();
  return { ok: true };
}

export async function scolariteImporterUtilisateurs(
  fichier: File,
): Promise<ResultatImportUtilisateurs> {
  await delai();
  const lignes = (await fichier.text())
    .split(/\r?\n/)
    .filter((ligne) => ligne.trim());
  const entetesAttendus = ["matricule", "email", "nom", "prenom", "role"];
  const h =
    lignes[0]
      ?.replace(/^\uFEFF/, "")
      .split(",")
      .map((x) => x.trim().toLowerCase()) ?? [];
  const entetesValides = entetesAttendus.every(
    (champ, idx) => h[idx] === champ,
  );
  if (!entetesValides) {
    throw new ApiError({
      message: `En-têtes CSV invalides. Attendus : ${entetesAttendus.join(", ")} (avec éventuellement campusId et departmentId)`,
      statusCode: 400,
    });
  }
  return {
    totalRows: Math.max(0, lignes.length - 1),
    successCount: Math.max(0, lignes.length - 1),
    errorCount: 0,
    errors: [],
    courrielsActivationEnfiles: Math.max(0, lignes.length - 1),
  };
}

export async function administrationReferentiels(): Promise<ReferentielsAdministration> {
  await delai();
  return {
    campus: referentielsAdministration.campus.map((campus) => ({ ...campus })),
    departements: referentielsAdministration.departements.map((d) => ({
      ...d,
    })),
    programmes: referentielsAdministration.programmes.map((p) => ({ ...p })),
  };
}

export async function administrationCreerCampus(nom: string) {
  await delai();
  if (
    referentielsAdministration.campus.some(
      (campus) => campus.nom.toLowerCase() === nom.toLowerCase(),
    )
  ) {
    throw new ApiError({ message: "Ce campus existe déjà.", statusCode: 409 });
  }
  const campus = { id: Date.now(), nom };
  referentielsAdministration = {
    ...referentielsAdministration,
    campus: [...referentielsAdministration.campus, campus],
  };
  return campus;
}

export async function administrationCreerDepartement(
  campusId: number,
  nom: string,
) {
  await delai();
  const campus = referentielsAdministration.campus.find(
    (c) => c.id === campusId,
  );
  if (!campus)
    throw new ApiError({ message: "Campus introuvable.", statusCode: 404 });
  if (
    referentielsAdministration.departements.some(
      (d) =>
        d.campusId === campusId && d.nom.toLowerCase() === nom.toLowerCase(),
    )
  ) {
    throw new ApiError({
      message: "Ce département existe déjà sur ce campus.",
      statusCode: 409,
    });
  }
  const departement = { id: Date.now(), nom, campusId, campus: campus.nom };
  referentielsAdministration = {
    ...referentielsAdministration,
    departements: [...referentielsAdministration.departements, departement],
  };
  return departement;
}

export async function administrationCreerProgramme(
  departmentId: number,
  nom: string,
) {
  await delai();
  const departement = referentielsAdministration.departements.find(
    (d) => d.id === departmentId,
  );
  if (!departement)
    throw new ApiError({
      message: "Département introuvable.",
      statusCode: 404,
    });
  if (
    referentielsAdministration.programmes.some(
      (p) =>
        p.departmentId === departmentId &&
        p.nom.toLowerCase() === nom.toLowerCase(),
    )
  ) {
    throw new ApiError({
      message: "Ce programme existe déjà dans ce département.",
      statusCode: 409,
    });
  }
  const programme = {
    id: Date.now(),
    nom,
    departmentId,
    departement: departement.nom,
  };
  referentielsAdministration = {
    ...referentielsAdministration,
    programmes: [...referentielsAdministration.programmes, programme],
  };
  return programme;
}

export async function scolariteGenererCodes(corps: {
  identifiants?: string[];
  tousSansMotDePasse?: boolean;
}): Promise<ResultatCodes> {
  await delai();
  let cibles: { identifiant: string; nom: string; prenom: string }[];
  if (corps.tousSansMotDePasse) {
    cibles = [...COMPTES_SANS_MDP];
  } else {
    const ids = (corps.identifiants ?? []).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      throw new ApiError({
        message: "Aucun identifiant fourni.",
        statusCode: 400,
      });
    }
    if (ids.length > 500) {
      throw new ApiError({
        message: "Maximum 500 identifiants par demande.",
        statusCode: 400,
      });
    }
    cibles = [];
    for (const id of ids) {
      const c = COMPTES_SANS_MDP.find(
        (x) => x.identifiant.toUpperCase() === id.toUpperCase(),
      );
      if (c) cibles.push(c);
    }
  }

  const codes: CodeActivationGenere[] = cibles.map((c) => ({
    identifiant: c.identifiant,
    nom: c.nom,
    prenom: c.prenom,
    code: genererCode(),
    expireLe: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const ignores: { identifiant: string; raison: string }[] = [];
  if (!corps.tousSansMotDePasse) {
    const ids = (corps.identifiants ?? []).map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      const c = COMPTES_SANS_MDP.find(
        (x) => x.identifiant.toUpperCase() === id.toUpperCase(),
      );
      if (!c) ignores.push({ identifiant: id, raison: "Compte introuvable." });
    }
  }

  const restants = COMPTES_SANS_MDP.length - cibles.length;

  return {
    codes,
    ignores,
    restants,
    courrielsEnfiles: codes.length,
    comptesSansEmail: [],
  };
}

export async function scolariteVerifierImport(
  type: TypeImport,
  fichier: File,
  _contexte?: {
    campus?: string;
    departement?: string;
    programme?: string;
    anneeUniversitaire?: string;
  },
): Promise<RapportImport> {
  void _contexte;
  await delai();
  if (type === "catalogue" || type === "presences") {
    throw new ApiError({
      message: "La vérification des classeurs XLSX nécessite l’API réelle.",
      statusCode: 501,
    });
  }
  const texte = await fichier.text();
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim());
  const setsAttendus = EN_TETES_IMPORT[type] ?? [];

  if (lignes.length === 0) {
    return {
      importId: "",
      lignesTotal: 0,
      lignesValides: 0,
      erreurs: [{ ligne: 0, message: "Le fichier est vide." }],
    };
  }

  const enTetes = lignes[0].split(",").map((h) => h.trim().toLowerCase());
  const erreurs: ErreurImport[] = [];
  let lignesValides = 0;

  // Recherche d'un ensemble d'en-têtes valide
  const attendues =
    setsAttendus.find(
      (ens) => ens.map((x) => x.toLowerCase()).join(",") === enTetes.join(","),
    ) ??
    setsAttendus[0] ??
    [];

  if (
    setsAttendus.every(
      (ens) => ens.map((x) => x.toLowerCase()).join(",") !== enTetes.join(","),
    )
  ) {
    erreurs.push({
      ligne: 1,
      message: `En-têtes incorrects. Format attendu : ${attendues.join(", ")}`,
    });
  }

  for (let i = 1; i < lignes.length; i++) {
    const cols = lignes[i].split(",");
    const ligneNo = i + 1;
    if (cols.length !== attendues.length) {
      erreurs.push({
        ligne: ligneNo,
        message: `Nombre de colonnes incorrect (${cols.length}, attendu ${attendues.length}).`,
      });
      continue;
    }
    let ligneOk = true;
    for (let j = 0; j < cols.length; j++) {
      if (!cols[j].trim()) {
        erreurs.push({
          ligne: ligneNo,
          colonne: attendues[j],
          message: `La colonne « ${attendues[j]} » est vide.`,
        });
        ligneOk = false;
      }
    }
    if (ligneOk) lignesValides++;
  }

  return {
    importId: erreurs.length === 0 ? `imp-${Date.now()}` : "",
    lignesTotal: lignes.length - 1,
    lignesValides,
    erreurs,
  };
}

export async function scolariteValiderImport(
  _type: TypeImport,
  importId: string,
): Promise<ResultatImport> {
  await delai();
  if (!importId) {
    throw new ApiError({
      message: "Le rapport contenait des erreurs : import impossible.",
      statusCode: 409,
    });
  }
  return {
    crees: Math.floor(Math.random() * 15) + 5,
    misAJour: Math.floor(Math.random() * 5),
  };
}

export async function archivesAnnuelles(): Promise<ArchiveAnnuelle[]> {
  await delai();
  return archivesMemoire.map(({ anneeUniversitaire, archiveLe, archivePar }) => ({
    anneeUniversitaire,
    archiveLe,
    archivePar,
  }));
}

export async function creerArchiveAnnuelle(
  anneeUniversitaire: string,
): Promise<{ anneeUniversitaire: string; archiveLe: string }> {
  await delai();
  if (!/^\d{4}-\d{4}$/.test(anneeUniversitaire)) {
    throw new ApiError({
      message: "Année universitaire invalide.",
      statusCode: 400,
    });
  }
  if (
    archivesMemoire.some(
      (archive) => archive.anneeUniversitaire === anneeUniversitaire,
    )
  ) {
    throw new ApiError({
      message: "Cette année est déjà archivée.",
      statusCode: 409,
    });
  }
  const archiveLe = new Date().toISOString();
  archivesMemoire.push({
    anneeUniversitaire,
    archiveLe,
    archivePar: sessionMemoire?.utilisateur.id ?? 0,
    snapshot: {},
  });
  return { anneeUniversitaire, archiveLe };
}

export async function lireArchiveAnnuelle(
  anneeUniversitaire: string,
): Promise<ArchiveAnnuelle> {
  await delai();
  const archive = archivesMemoire.find(
    (item) => item.anneeUniversitaire === anneeUniversitaire,
  );
  if (!archive)
    throw new ApiError({
      message: "Archive annuelle introuvable.",
      statusCode: 404,
    });
  return { ...archive };
}

export async function scolariteCommentaires(
  _campagneId?: number,
  statut?: string,
): Promise<CommentaireAModerer[]> {
  await delai();
  let liste = commentairesMemoire.map((c) => ({ ...c }));
  if (statut) liste = liste.filter((c) => c.statut === statut);
  return liste;
}

export async function moderationCampagnes(): Promise<CampagneCommentaire[]> {
  await delai();
  return campagnesGestionMemoire.flatMap((campagne) =>
    campagne.statut === "close" || campagne.statut === "restituee"
      ? [
          {
            id: campagne.id,
            libelle: campagne.libelle,
            statut: campagne.statut,
          },
        ]
      : [],
  );
}

export async function scolariteModererCommentaire(
  id: string | number,
  corps: { statut: "valide" | "masque" },
): Promise<CommentaireAModerer> {
  await delai();
  const idx = commentairesMemoire.findIndex((c) => c.id === id);
  if (idx === -1)
    throw new ApiError({
      message: "Commentaire introuvable.",
      statusCode: 404,
    });
  commentairesMemoire[idx] = {
    ...commentairesMemoire[idx],
    statut: corps.statut,
  };
  return { ...commentairesMemoire[idx] };
}

export async function scolariteRestitution(
  id: number,
  _corps: RestitutionEntree,
): Promise<CampagneGestion> {
  void _corps;
  await delai();
  const idx = campagnesGestionMemoire.findIndex((c) => c.id === id);
  if (idx === -1)
    throw new ApiError({ message: "Campagne introuvable.", statusCode: 404 });
  if (campagnesGestionMemoire[idx].statut !== "close") {
    throw new ApiError({
      message: "La restitution n'est possible que pour une campagne clôturée.",
      statusCode: 409,
    });
  }
  campagnesGestionMemoire[idx] = {
    ...campagnesGestionMemoire[idx],
    statut: "restituee",
  };
  return { ...campagnesGestionMemoire[idx] };
}

const RESTITUTIONS: Restitution[] = [
  {
    campagneId: 201,
    libelle: "Évaluations S5 : Informatique",
    departement: "Informatique",
    anneeUniversitaire: "2026-2027",
    semestre: 5,
    resultats:
      "Les retours étudiants mettent en avant la qualité pédagogique des enseignements en Algorithmique avancée et en Bases de données, avec une satisfaction globale supérieure à 4/5.\n\nLes points d'attention portent sur les délais de correction en Probabilités et statistiques, ainsi que sur la taille des salles de TP pour l'électronique numérique, jugées inadaptées par près d'un étudiant sur trois.\n\nLa participation atteint 90% des inscrits, soit un taux supérieur à la moyenne nationale.",
    suites:
      "Un plan de remédiation a été engagé pour accélérer la communication des résultats en Probabilités et statistiques, avec un délai cible de trois semaines maximum.\n\nLes groupes de TP en électronique numérique seront réorganisés au semestre prochain pour limiter les effectifs à 24 étudiants par salle.\n\nLes bonnes pratiques identifiées en Algorithmique avancée seront partagées lors de la prochaine réunion pédagogique du département.",
    publieLe: "2026-07-10T10:00:00Z",
  },
  {
    campagneId: 10,
    libelle: "Évaluations S3 : Automne 2025",
    departement: "Informatique",
    anneeUniversitaire: "2025-2026",
    semestre: 3,
    resultats:
      "L'évaluation des enseignements du semestre 3 fait ressortir une forte satisfaction pour les UE de Structures de données et de Programmation orientée objet, avec des moyennes comprises entre 3,9 et 4,3 sur 5.\n\nL'enseignement d'Anglais technique présente un taux de satisfaction plus modéré (3,0/5), principalement lié au rythme jugé trop rapide et au manque de pratique orale.\n\nLa participation globale s'établit à 70%, en progression de 8 points par rapport au semestre précédent.",
    suites:
      "Le contenu de l'UE d'Anglais technique a été révisé pour intégrer des séances de pratique orale hebdomadaires dès la rentrée 2026.\n\nUn dispositif de tutorat entre pairs a été mis en place pour les UE à faible satisfaction, afin d'accompagner les étudiants en difficulté.\n\nLes retours positifs sur les Structures de données ont conduit à l'élargissement de cette approche projectuelle à d'autres UE du département.",
    publieLe: "2026-02-15T14:30:00Z",
  },
];

export async function restitutions(): Promise<Restitution[]> {
  await delai();
  return RESTITUTIONS.map((r) => ({ ...r }));
}
