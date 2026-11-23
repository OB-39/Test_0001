import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { LigneAudit } from "../api/types";
import {
  analyserUserAgent,
  calculerHashEntreeAudit,
  construireDossierUtilisateurAudit,
  construireUrlCarteSecurisee,
  filtrerLignesAudit,
  genererCsvForensicAudit,
  scellerChaineAudit,
  sha256HexSync,
  verifierIntegriteChaineAudit,
} from "./auditForensic";

test("sha256HexSync correspond exactement a node:crypto SHA-256", () => {
  const payload = "ENP-LOME|FORENSIC|2026|Pr Adekunle Akim SALAMI";
  const attendu = createHash("sha256").update(payload).digest("hex");
  assert.equal(sha256HexSync(payload), attendu);
});

test("analyserUserAgent extrait OS, navigateur et type d'appareil", () => {
  const win = analyserUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  );
  assert.equal(win.osNom, "Windows 10/11");
  assert.equal(win.navigateurNom, "Chrome 124");
  assert.equal(win.appareilType, "Desktop");

  const iphone = analyserUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
  );
  assert.equal(iphone.osNom, "iOS 17.4");
  assert.equal(iphone.navigateurNom, "Safari 17");
  assert.equal(iphone.appareilType, "Smartphone");
});

test("scellerChaineAudit et verifierIntegriteChaineAudit valident une chaine intacte et detectent toute alteration", () => {
  const base: LigneAudit[] = [
    {
      id: 1,
      creeLe: "2026-11-22T08:00:00.000Z",
      userId: 501,
      userMatricule: "DG-001",
      userNomComplet: "Pr Adekunle Akim SALAMI",
      userRole: "directeur_general",
      categorie: "direction",
      gravite: "sensible",
      action: "DIRECTION_PUBLICATION_STATISTIQUES",
      methodeHttp: "POST",
      cheminHttp: "/api/v1/direction/statistiques/publier",
      statutHttp: 200,
      ipAddress: "196.168.10.24",
      deviceFingerprint: "fp_dg_station_01",
      geoLatitude: 6.1725,
      geoLongitude: 1.2134,
      objet: "Statistiques 2026-2027",
      detail: "Publication consolidée",
    },
    {
      id: 2,
      creeLe: "2026-11-22T08:05:00.000Z",
      userId: 501,
      userMatricule: "DG-001",
      userNomComplet: "Pr Adekunle Akim SALAMI",
      userRole: "directeur_general",
      categorie: "export",
      gravite: "sensible",
      action: "EXPORT_SYNTHESE_PDF",
      methodeHttp: "GET",
      cheminHttp: "/api/v1/exports/synthese",
      statutHttp: 200,
      ipAddress: "196.168.10.24",
      deviceFingerprint: "fp_dg_station_01",
      geoLatitude: 6.1725,
      geoLongitude: 1.2134,
      objet: "Synthèse ENP",
      detail: "Export officiel",
    },
  ];

  const scellee = scellerChaineAudit(base);
  const ok = verifierIntegriteChaineAudit([...scellee].reverse());
  assert.equal(ok.intact, true);
  assert.equal(ok.totalVerifie, 2);
  assert.equal(ok.anomalies.length, 0);

  // Alteration malveillante de l'IP sur l'entree 1
  const alteree = scellee.map((l) =>
    l.id === 1 ? { ...l, ipAddress: "10.0.0.1" } : l,
  );
  const rapportAlter = verifierIntegriteChaineAudit(alteree);
  assert.equal(rapportAlter.intact, false);
  assert.equal(rapportAlter.anomalies[0].id, 1);

  // Suppression d'une ligne intermediaire -> rupture de previousHash
  const ligne3: LigneAudit = {
    ...base[1],
    id: 3,
    creeLe: "2026-11-22T08:10:00.000Z",
    previousHash: scellee[1].entryHash,
  };
  ligne3.entryHash = calculerHashEntreeAudit(ligne3);
  const avecTrou = [scellee[0], ligne3];
  const rapportTrou = verifierIntegriteChaineAudit(avecTrou);
  assert.equal(rapportTrou.intact, false);
  assert.ok(rapportTrou.anomalies.some((a) => a.id === 3));
});

test("filtrerLignesAudit et construireDossierUtilisateurAudit tracent meme les directeurs", () => {
  const scellee = scellerChaineAudit([
    {
      id: 10,
      creeLe: "2026-11-22T09:00:00.000Z",
      userId: 700,
      userMatricule: "DG-ENP-01",
      userNomComplet: "Directeur Général ENP",
      userRole: "directeur_general",
      categorie: "direction",
      gravite: "sensible",
      action: "CONSULTATION_CONTROLES",
      ipAddress: "41.207.175.42",
      osNom: "Windows 10/11",
      navigateurNom: "Chrome 124",
      appareilType: "Desktop",
      deviceFingerprint: "MCH-DG-8812",
      geoSource: "gps_precis",
      geoLatitude: 6.17642,
      geoLongitude: 1.21238,
      geoPrecisionMetres: 14,
      geoVille: "Lomé (Campus Nord)",
      geoPays: "Togo",
    },
    {
      id: 11,
      creeLe: "2026-11-22T10:15:00.000Z",
      userId: 700,
      userMatricule: "DG-ENP-01",
      userNomComplet: "Directeur Général ENP",
      userRole: "directeur_general",
      categorie: "securite",
      gravite: "alerte",
      action: "CHANGEMENT_IP_SESSION",
      ipAddress: "102.64.220.19",
      osNom: "iOS 17.4",
      navigateurNom: "Safari 17",
      appareilType: "Smartphone",
      deviceFingerprint: "MCH-DG-IPHONE",
      geoSource: "gps_precis",
      geoLatitude: 6.13194,
      geoLongitude: 1.22278,
      geoPrecisionMetres: 22,
      geoVille: "Lomé (Tokoin)",
      geoPays: "Togo",
    },
  ]);

  const filtresDg = filtrerLignesAudit(scellee, { role: "directeur_general" });
  assert.equal(filtresDg.length, 2);

  const dossier = construireDossierUtilisateurAudit(scellee, 700);
  assert.ok(dossier);
  assert.equal(dossier.totalActions, 2);
  assert.equal(dossier.nombreAlertes, 1);
  assert.equal(dossier.adressesIp.length, 2);
  assert.equal(dossier.machines.length, 2);
  assert.equal(dossier.localisations.length, 2);
});

test("genererCsvForensicAudit neutralise les formules tableur et inclut IP et empreinte", () => {
  const scellee = scellerChaineAudit([
    {
      id: 1,
      creeLe: "2026-11-22T09:00:00.000Z",
      userId: 12,
      userMatricule: "ETU-012",
      action: "CONNEXION",
      ipAddress: "41.207.175.11",
      detail: "=CMD('calc')",
      geoLatitude: 6.17642,
      geoLongitude: 1.21238,
    },
  ]);
  const csv = genererCsvForensicAudit(scellee);
  assert.ok(csv.startsWith("\uFEFFID;Horodatage_UTC"));
  assert.ok(csv.includes("'=CMD('calc')"));
  assert.ok(csv.includes("41.207.175.11"));
  assert.ok(csv.includes(scellee[0].entryHash!));
});

test("construireUrlCarteSecurisee rejette les coordonnees invalides et valide les coordonnees GPS", () => {
  assert.equal(construireUrlCarteSecurisee(95, 1.2), null);
  assert.equal(construireUrlCarteSecurisee(Number.NaN, 1.2), null);
  const url = construireUrlCarteSecurisee(6.17642, 1.21238);
  assert.ok(url?.startsWith("https://www.openstreetmap.org/?mlat=6.176420&mlon=1.212380"));
});
