import type {
  CategorieAudit,
  DossierUtilisateurAudit,
  FiltresAuditForensic,
  GraviteAudit,
  LigneAudit,
  RapportIntegriteAudit,
} from "@/api/types";

export const GENESIS_AUDIT_HASH = "GENESIS_ENP_AUDIT_V2";

export interface InfoMachineParsee {
  osNom: string;
  navigateurNom: string;
  appareilType: "Desktop" | "Smartphone" | "Tablette" | "Bot / Script" | "Inconnu";
}

/**
 * Analyse un User-Agent de maniere deterministe (sans dependance externe)
 * pour extraire le systeme d'exploitation, le navigateur et le type d'appareil.
 */
export function analyserUserAgent(userAgent: string | null | undefined): InfoMachineParsee {
  const ua = (userAgent ?? "").trim();
  if (!ua) {
    return {
      osNom: "Inconnu",
      navigateurNom: "Inconnu",
      appareilType: "Inconnu",
    };
  }

  let osNom = "Inconnu";
  if (/Windows NT 10\.0/i.test(ua)) osNom = "Windows 10/11";
  else if (/Windows NT/i.test(ua)) osNom = "Windows";
  else if (/Android\s+([\d.]+)/i.test(ua)) {
    const m = ua.match(/Android\s+([\d.]+)/i);
    osNom = `Android ${m?.[1] ?? ""}`.trim();
  } else if (/iPhone OS\s+([\d_]+)/i.test(ua)) {
    const m = ua.match(/iPhone OS\s+([\d_]+)/i);
    osNom = `iOS ${(m?.[1] ?? "").replace(/_/g, ".")}`.trim();
  } else if (/iPad.*OS\s+([\d_]+)/i.test(ua)) {
    const m = ua.match(/OS\s+([\d_]+)/i);
    osNom = `iPadOS ${(m?.[1] ?? "").replace(/_/g, ".")}`.trim();
  } else if (/Mac OS X\s+([\d_]+)/i.test(ua)) {
    const m = ua.match(/Mac OS X\s+([\d_]+)/i);
    osNom = `macOS ${(m?.[1] ?? "").replace(/_/g, ".")}`.trim();
  } else if (/Ubuntu/i.test(ua)) osNom = "Linux Ubuntu";
  else if (/Linux/i.test(ua)) osNom = "Linux";

  let navigateurNom = "Inconnu";
  if (/Edg\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/i);
    navigateurNom = `Edge ${m?.[1]?.split(".")[0] ?? ""}`.trim();
  } else if (/OPR\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/OPR\/([\d.]+)/i);
    navigateurNom = `Opera ${m?.[1]?.split(".")[0] ?? ""}`.trim();
  } else if (/Chrome\/([\d.]+)/i.test(ua) && !/Chromium/i.test(ua)) {
    const m = ua.match(/Chrome\/([\d.]+)/i);
    navigateurNom = `Chrome ${m?.[1]?.split(".")[0] ?? ""}`.trim();
  } else if (/Firefox\/([\d.]+)/i.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/i);
    navigateurNom = `Firefox ${m?.[1]?.split(".")[0] ?? ""}`.trim();
  } else if (/Version\/([\d.]+).*Safari/i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/i);
    navigateurNom = `Safari ${m?.[1]?.split(".")[0] ?? ""}`.trim();
  } else if (/curl|python-requests|Postman|insomnia|axios/i.test(ua)) {
    navigateurNom = "Client API / Script";
  }

  let appareilType: InfoMachineParsee["appareilType"] = "Desktop";
  if (/bot|crawler|spider|curl|python-requests|Postman/i.test(ua)) {
    appareilType = "Bot / Script";
  } else if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) {
    appareilType = "Tablette";
  } else if (/Mobile|iPhone|Android/i.test(ua)) {
    appareilType = "Smartphone";
  }

  return { osNom, navigateurNom, appareilType };
}

/**
 * Implementation SHA-256 pure en TypeScript (FIPS 180-4) afin de pouvoir calculer
 * et verifier la chaine cryptographique de maniere synchrone et deterministe
 * dans le navigateur comme dans Node.js sans dependance externe.
 */
const K_SHA256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256HexSync(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K_SHA256[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * Construit la charge canonique signee pour une entree du journal d'audit.
 * Toute alteration d'un seul caractere d'un champ rompt l'empreinte SHA-256.
 */
export function construireChargeCanoniqueAudit(
  ligne: Pick<
    LigneAudit,
    | "id"
    | "creeLe"
    | "userId"
    | "userMatricule"
    | "userRole"
    | "action"
    | "methodeHttp"
    | "cheminHttp"
    | "statutHttp"
    | "ipAddress"
    | "deviceFingerprint"
    | "geoLatitude"
    | "geoLongitude"
    | "objet"
    | "detail"
    | "previousHash"
  >,
): string {
  const parts = [
    String(ligne.id),
    ligne.creeLe,
    ligne.userId !== undefined ? String(ligne.userId) : "",
    ligne.userMatricule ?? "",
    ligne.userRole ?? "",
    ligne.action,
    ligne.methodeHttp ?? "",
    ligne.cheminHttp ?? "",
    ligne.statutHttp !== undefined ? String(ligne.statutHttp) : "",
    ligne.ipAddress ?? "",
    ligne.deviceFingerprint ?? "",
    ligne.geoLatitude !== undefined ? ligne.geoLatitude.toFixed(6) : "",
    ligne.geoLongitude !== undefined ? ligne.geoLongitude.toFixed(6) : "",
    ligne.objet ?? "",
    ligne.detail ?? "",
    ligne.previousHash ?? GENESIS_AUDIT_HASH,
  ];
  return parts.join("|");
}

export function calculerHashEntreeAudit(
  ligne: Parameters<typeof construireChargeCanoniqueAudit>[0],
): string {
  return sha256HexSync(construireChargeCanoniqueAudit(ligne));
}

/**
 * Scelle une liste d'entrees chronologiques (ordre croissant d'id) en chaine cryptographique.
 */
export function scellerChaineAudit(entreesChronologiques: LigneAudit[]): LigneAudit[] {
  let prevHash = GENESIS_AUDIT_HASH;
  return entreesChronologiques.map((entree) => {
    const avecPrev: LigneAudit = {
      ...entree,
      previousHash: prevHash,
    };
    const entryHash = calculerHashEntreeAudit(avecPrev);
    prevHash = entryHash;
    return {
      ...avecPrev,
      entryHash,
    };
  });
}

/**
 * Verifie l'integrite cryptographique complete d'un journal d'audit.
 * Accepte les lignes dans n'importe quel ordre (tri interne par id croissant).
 */
export function verifierIntegriteChaineAudit(lignes: LigneAudit[]): RapportIntegriteAudit {
  const triees = [...lignes].sort((a, b) => a.id - b.id);
  const anomalies: RapportIntegriteAudit["anomalies"] = [];

  for (let i = 0; i < triees.length; i += 1) {
    const ligne = triees[i];
    const prevAttendu = i === 0 ? GENESIS_AUDIT_HASH : (triees[i - 1].entryHash ?? GENESIS_AUDIT_HASH);

    if (!ligne.entryHash || !ligne.previousHash) {
      anomalies.push({
        id: ligne.id,
        raison: "Empreinte cryptographique manquante sur cette ligne.",
      });
      continue;
    }

    if (i > 0 && ligne.previousHash !== prevAttendu) {
      anomalies.push({
        id: ligne.id,
        raison: `Rupture de chaînage détectée entre l'événement #${triees[i - 1].id} et #${ligne.id}.`,
      });
    }

    const recalcule = calculerHashEntreeAudit(ligne);
    if (recalcule !== ligne.entryHash) {
      anomalies.push({
        id: ligne.id,
        raison: "Altération détectée : le contenu ne correspond plus à son empreinte SHA-256.",
      });
    }
  }

  return {
    intact: anomalies.length === 0,
    totalVerifie: triees.length,
    dernierHash: triees.length > 0 ? triees[triees.length - 1].entryHash : undefined,
    verifieLe: new Date().toISOString(),
    anomalies,
  };
}

/**
 * Filtre multi-criteres du journal forensique.
 */
export function filtrerLignesAudit(
  lignes: LigneAudit[],
  filtres: FiltresAuditForensic,
): LigneAudit[] {
  const q = (filtres.recherche ?? "").trim().toLowerCase();
  const ipQuery = (filtres.ip ?? "").trim().toLowerCase();
  const dateDebutMs = filtres.dateDebut ? Date.parse(`${filtres.dateDebut}T00:00:00Z`) : null;
  const dateFinMs = filtres.dateFin ? Date.parse(`${filtres.dateFin}T23:59:59.999Z`) : null;

  return lignes.filter((l) => {
    if (filtres.userId !== undefined && l.userId !== filtres.userId) return false;
    if (filtres.role && l.userRole !== filtres.role) return false;
    if (filtres.categorie && l.categorie !== filtres.categorie) return false;
    if (filtres.gravite && l.gravite !== filtres.gravite) return false;
    if (ipQuery && !(l.ipAddress ?? "").toLowerCase().includes(ipQuery)) return false;

    const ts = Date.parse(l.creeLe);
    if (dateDebutMs !== null && !Number.isNaN(dateDebutMs) && ts < dateDebutMs) return false;
    if (dateFinMs !== null && !Number.isNaN(dateFinMs) && ts > dateFinMs) return false;

    if (q) {
      const champ = [
        l.userMatricule,
        l.userNomComplet,
        l.userRole,
        l.action,
        l.objet,
        l.detail,
        l.ipAddress,
        l.cheminHttp,
        l.osNom,
        l.navigateurNom,
        l.deviceFingerprint,
        l.geoVille,
        l.geoRegion,
        l.geoPays,
        l.geoFai,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!champ.includes(q)) return false;
    }

    return true;
  });
}

/**
 * Construit le dossier forensique complet d'un utilisateur specifique (tous roles confondus,
 * y compris directeurs, scolarite, enseignants, delegues, etudiants et administrateurs).
 */
export function construireDossierUtilisateurAudit(
  lignes: LigneAudit[],
  userId: number,
): DossierUtilisateurAudit | null {
  const evenements = lignes
    .filter((l) => l.userId === userId)
    .sort((a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe) || b.id - a.id);

  if (evenements.length === 0) return null;

  const recent = evenements[0];
  const ancien = evenements[evenements.length - 1];

  const ipsMap = new Map<string, { ip: string; occurrences: number; derniereVue: string; localisation: string }>();
  const machinesMap = new Map<
    string,
    {
      empreinte: string;
      osNom: string;
      navigateurNom: string;
      appareilType: string;
      ecranResolution?: string;
      occurrences: number;
      derniereVue: string;
    }
  >();
  const lieuxMap = new Map<
    string,
    {
      libelle: string;
      latitude?: number;
      longitude?: number;
      precisionMetres?: number;
      source?: LigneAudit["geoSource"];
      occurrences: number;
      derniereVue: string;
    }
  >();

  let nombreAlertes = 0;

  for (const ev of evenements) {
    if (ev.gravite === "alerte" || ev.gravite === "critique") {
      nombreAlertes += 1;
    }

    if (ev.ipAddress) {
      const existing = ipsMap.get(ev.ipAddress);
      const loc = [ev.geoVille, ev.geoPays].filter(Boolean).join(", ") || "Localisation inconnue";
      if (!existing) {
        ipsMap.set(ev.ipAddress, {
          ip: ev.ipAddress,
          occurrences: 1,
          derniereVue: ev.creeLe,
          localisation: loc,
        });
      } else {
        existing.occurrences += 1;
      }
    }

    const machineKey =
      ev.deviceFingerprint ||
      `${ev.osNom ?? "Inconnu"}|${ev.navigateurNom ?? "Inconnu"}|${ev.appareilType ?? "Inconnu"}`;
    const mExisting = machinesMap.get(machineKey);
    if (!mExisting) {
      machinesMap.set(machineKey, {
        empreinte: ev.deviceFingerprint ?? "Non transmise",
        osNom: ev.osNom ?? "Inconnu",
        navigateurNom: ev.navigateurNom ?? "Inconnu",
        appareilType: ev.appareilType ?? "Inconnu",
        ecranResolution: ev.ecranResolution,
        occurrences: 1,
        derniereVue: ev.creeLe,
      });
    } else {
      mExisting.occurrences += 1;
    }

    const geoLabel = formaterLocalisationAudit(ev);
    if (geoLabel !== "Non renseignée") {
      const geoKey =
        ev.geoLatitude !== undefined && ev.geoLongitude !== undefined
          ? `${ev.geoLatitude.toFixed(4)},${ev.geoLongitude.toFixed(4)}`
          : geoLabel;
      const gExisting = lieuxMap.get(geoKey);
      if (!gExisting) {
        lieuxMap.set(geoKey, {
          libelle: geoLabel,
          latitude: ev.geoLatitude,
          longitude: ev.geoLongitude,
          precisionMetres: ev.geoPrecisionMetres,
          source: ev.geoSource,
          occurrences: 1,
          derniereVue: ev.creeLe,
        });
      } else {
        gExisting.occurrences += 1;
      }
    }
  }

  return {
    userId,
    userMatricule: recent.userMatricule ?? `USR-${userId}`,
    userNomComplet: recent.userNomComplet ?? recent.userMatricule ?? `Utilisateur #${userId}`,
    userRole: recent.userRole,
    totalActions: evenements.length,
    nombreAlertes,
    premiereActivite: ancien.creeLe,
    derniereActivite: recent.creeLe,
    adressesIp: Array.from(ipsMap.values()),
    machines: Array.from(machinesMap.values()),
    localisations: Array.from(lieuxMap.values()),
    evenements,
  };
}

export function formaterLocalisationAudit(ligne: LigneAudit): string {
  const parts = [ligne.geoVille, ligne.geoRegion, ligne.geoPays].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (ligne.geoLatitude !== undefined && ligne.geoLongitude !== undefined) {
    return `${ligne.geoLatitude.toFixed(5)}, ${ligne.geoLongitude.toFixed(5)}`;
  }
  return "Non renseignée";
}

export function construireUrlCarteSecurisee(
  latitude?: number,
  longitude?: number,
): string | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  const lat = latitude.toFixed(6);
  const lon = longitude.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=16/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
}

function echapperCelluleCsvSecurisee(valeur: string | number | null | undefined): string {
  const brut = valeur === null || valeur === undefined ? "" : String(valeur);
  const nettoye = brut.replace(/\r?\n/g, " ");
  const neutre = /^[=+\-@\t\r]/.test(nettoye) ? `'${nettoye}` : nettoye;
  if (/[;"\n\r,]/.test(neutre)) {
    return `"${neutre.replace(/"/g, '""')}"`;
  }
  return neutre;
}

/**
 * Genere un export CSV forensique complet UTF-8 BOM securise contre l'injection tableur.
 */
export function genererCsvForensicAudit(lignes: LigneAudit[]): string {
  const entetes = [
    "ID",
    "Horodatage_UTC",
    "User_ID",
    "Matricule",
    "Nom_Complet",
    "Role",
    "Categorie",
    "Gravite",
    "Action",
    "Methode_HTTP",
    "Chemin_HTTP",
    "Statut_HTTP",
    "Duree_ms",
    "Adresse_IP",
    "OS",
    "Navigateur",
    "Type_Appareil",
    "Empreinte_Machine",
    "Resolution",
    "Fuseau_Horaire",
    "Source_Geo",
    "Latitude",
    "Longitude",
    "Precision_m",
    "Ville",
    "Pays",
    "FAI",
    "Objet",
    "Detail",
    "Hash_SHA256",
    "Hash_Precedent",
  ];

  const corps = lignes.map((l) =>
    [
      l.id,
      l.creeLe,
      l.userId ?? "",
      l.userMatricule ?? "",
      l.userNomComplet ?? "",
      l.userRole ?? "",
      l.categorie ?? "",
      l.gravite ?? "",
      l.action,
      l.methodeHttp ?? "",
      l.cheminHttp ?? "",
      l.statutHttp ?? "",
      l.dureeMs ?? "",
      l.ipAddress ?? "",
      l.osNom ?? "",
      l.navigateurNom ?? "",
      l.appareilType ?? "",
      l.deviceFingerprint ?? "",
      l.ecranResolution ?? "",
      l.fuseauHoraire ?? "",
      l.geoSource ?? "",
      l.geoLatitude !== undefined ? l.geoLatitude.toFixed(6) : "",
      l.geoLongitude !== undefined ? l.geoLongitude.toFixed(6) : "",
      l.geoPrecisionMetres ?? "",
      l.geoVille ?? "",
      l.geoPays ?? "",
      l.geoFai ?? "",
      l.objet ?? "",
      l.detail ?? "",
      l.entryHash ?? "",
      l.previousHash ?? "",
    ]
      .map(echapperCelluleCsvSecurisee)
      .join(";"),
  );

  return `\uFEFF${entetes.join(";")}\n${corps.join("\n")}`;
}

export const LIBELLES_CATEGORIE_AUDIT: Record<CategorieAudit, string> = {
  authentification: "Authentification",
  navigation: "Consultation",
  academique: "Académique",
  presence: "Émargement QR",
  administration: "Administration",
  direction: "Direction",
  securite: "Sécurité",
  export: "Export",
};

export const LIBELLES_GRAVITE_AUDIT: Record<GraviteAudit, string> = {
  info: "Standard",
  sensible: "Sensible",
  alerte: "Alerte",
  critique: "Critique",
};
