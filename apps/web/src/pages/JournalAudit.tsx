import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Globe,
  Laptop,
  Lock,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { api, ApiError } from "@/api";
import type {
  CategorieAudit,
  GraviteAudit,
  LigneAudit,
  RapportIntegriteAudit,
  Role,
} from "@/api/types";
import { LIBELLES_ROLES } from "@/components/menuConfig";
import { Alert, Button, PageHeader } from "@/components/ui";
import {
  construireDossierUtilisateurAudit,
  construireUrlCarteSecurisee,
  filtrerLignesAudit,
  formaterLocalisationAudit,
  genererCsvForensicAudit,
  LIBELLES_CATEGORIE_AUDIT,
  LIBELLES_GRAVITE_AUDIT,
  verifierIntegriteChaineAudit,
} from "@/utils/auditForensic";

type OngletJournal = "global" | "utilisateur";

const TOUS_ROLES: Role[] = [
  "directeur_general",
  "directeur_campus",
  "admin",
  "scolarite",
  "chef_departement",
  "enseignant",
  "delegue",
  "etudiant",
];

const TOUTES_CATEGORIES: CategorieAudit[] = [
  "authentification",
  "direction",
  "administration",
  "securite",
  "presence",
  "academique",
  "export",
  "navigation",
];

const TOUTES_GRAVITES: GraviteAudit[] = ["info", "sensible", "alerte", "critique"];

function classeGravite(gravite?: GraviteAudit): string {
  switch (gravite) {
    case "critique":
      return "bg-enp-red-light text-enp-red-inst border-enp-red-error/40";
    case "alerte":
      return "bg-amber-50 text-amber-800 border-amber-300";
    case "sensible":
      return "bg-enp-blue-ice text-enp-blue-deep border-enp-blue-primary/30";
    default:
      return "bg-slate-50 text-enp-gray-dark border-enp-border";
  }
}

function libelleSourceGeo(source?: LigneAudit["geoSource"]): string {
  switch (source) {
    case "gps_precis":
      return "GPS haute précision";
    case "ip_reseau":
      return "Géolocalisation IP réseau";
    case "campus_enp":
      return "Réseau Campus ENP";
    case "fuseau_navigateur":
      return "Fuseau navigateur";
    default:
      return "Non précisée";
  }
}

function telechargerFichier(contenu: string, nom: string, mime: string) {
  const blob = new Blob([contenu], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function JournalAudit() {
  const [lignes, setLignes] = useState<LigneAudit[]>([]);
  const [integrite, setIntegrite] = useState<RapportIntegriteAudit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [verifEnCours, setVerifEnCours] = useState(false);

  const [onglet, setOnglet] = useState<OngletJournal>("global");
  const [recherche, setRecherche] = useState("");
  const [filtreRole, setFiltreRole] = useState<Role | "">("");
  const [filtreCategorie, setFiltreCategorie] = useState<CategorieAudit | "">("");
  const [filtreGravite, setFiltreGravite] = useState<GraviteAudit | "">("");
  const [filtreIp, setFiltreIp] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  const [utilisateurSelectionneId, setUtilisateurSelectionneId] = useState<number | null>(null);
  const [detailSelectionne, setDetailSelectionne] = useState<LigneAudit | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [data, rapport] = await Promise.all([
        api.journalAudit({ limite: 250 }),
        api.verifierIntegriteAudit(),
      ]);
      setLignes(data);
      setIntegrite(rapport);
      if (data.length > 0) {
        setUtilisateurSelectionneId((prev) => {
          if (prev !== null && data.some((d) => d.userId === prev)) return prev;
          const directeur = data.find((d) => d.userRole === "directeur_general");
          return directeur?.userId ?? data.find((d) => d.userId !== undefined)?.userId ?? null;
        });
      }
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Consultation du journal forensique impossible.",
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleVerifierIntegrite() {
    setVerifEnCours(true);
    try {
      const rapportServeur = await api.verifierIntegriteAudit();
      const rapportLocal = verifierIntegriteChaineAudit(lignes);
      setIntegrite(rapportServeur.intact ? rapportLocal : rapportServeur);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Vérification cryptographique impossible.",
      );
    } finally {
      setVerifEnCours(false);
    }
  }

  const lignesFiltrees = useMemo(
    () =>
      filtrerLignesAudit(lignes, {
        recherche,
        role: filtreRole,
        categorie: filtreCategorie,
        gravite: filtreGravite,
        ip: filtreIp,
        dateDebut,
        dateFin,
      }),
    [lignes, recherche, filtreRole, filtreCategorie, filtreGravite, filtreIp, dateDebut, dateFin],
  );

  // Liste de tous les utilisateurs presents dans le journal (y compris directeurs)
  const utilisateursTraces = useMemo(() => {
    const map = new Map<
      number,
      {
        userId: number;
        matricule: string;
        nomComplet: string;
        role?: Role;
        total: number;
        alertes: number;
        derniereActivite: string;
      }
    >();
    for (const l of lignes) {
      if (l.userId === undefined) continue;
      const cur = map.get(l.userId);
      const estAlerte = l.gravite === "alerte" || l.gravite === "critique";
      if (!cur) {
        map.set(l.userId, {
          userId: l.userId,
          matricule: l.userMatricule ?? `USR-${l.userId}`,
          nomComplet: l.userNomComplet ?? l.userMatricule ?? `Utilisateur #${l.userId}`,
          role: l.userRole,
          total: 1,
          alertes: estAlerte ? 1 : 0,
          derniereActivite: l.creeLe,
        });
      } else {
        cur.total += 1;
        if (estAlerte) cur.alertes += 1;
        if (Date.parse(l.creeLe) > Date.parse(cur.derniereActivite)) {
          cur.derniereActivite = l.creeLe;
          if (l.userRole) cur.role = l.userRole;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => Date.parse(b.derniereActivite) - Date.parse(a.derniereActivite),
    );
  }, [lignes]);

  const dossierUtilisateur = useMemo(() => {
    if (utilisateurSelectionneId === null) return null;
    return construireDossierUtilisateurAudit(lignes, utilisateurSelectionneId);
  }, [lignes, utilisateurSelectionneId]);

  const stats = useMemo(() => {
    const ips = new Set<string>();
    const machines = new Set<string>();
    const users = new Set<number>();
    let alertes = 0;
    for (const l of lignes) {
      if (l.ipAddress) ips.add(l.ipAddress);
      if (l.deviceFingerprint) machines.add(l.deviceFingerprint);
      if (l.userId !== undefined) users.add(l.userId);
      if (l.gravite === "alerte" || l.gravite === "critique") alertes += 1;
    }
    return {
      total: lignes.length,
      utilisateurs: users.size,
      ips: ips.size,
      machines: machines.size,
      alertes,
    };
  }, [lignes]);

  function exporterCsv(source: LigneAudit[], prefixe: string) {
    const csv = genererCsvForensicAudit(source);
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    telechargerFichier(csv, `${prefixe}-${horodatage}.csv`, "text/csv;charset=utf-8");
  }

  function exporterJsonScelle(source: LigneAudit[], prefixe: string) {
    const rapport = verifierIntegriteChaineAudit(source);
    const payload = {
      institution: "École Nationale Polytechnique de Lomé (ENP)",
      exporteLe: new Date().toISOString(),
      integrite: rapport,
      totalEvenements: source.length,
      evenements: source,
    };
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    telechargerFichier(
      JSON.stringify(payload, null, 2),
      `${prefixe}-${horodatage}.json`,
      "application/json;charset=utf-8",
    );
  }

  function reinitialiserFiltres() {
    setRecherche("");
    setFiltreRole("");
    setFiltreCategorie("");
    setFiltreGravite("");
    setFiltreIp("");
    setDateDebut("");
    setDateFin("");
  }

  const aFiltresActifs = Boolean(
    recherche || filtreRole || filtreCategorie || filtreGravite || filtreIp || dateDebut || dateFin,
  );

  return (
    <div className="space-y-4 sm:space-y-5 max-w-6xl mx-auto animate-fade-in pb-8">
      <PageHeader
        title="Journal forensique haute sécurité"
        description="Traçabilité complète réservée exclusivement à l'administrateur : identité, adresse IP, machine, localisation précise et scellement SHA-256 pour tous les profils, y compris la direction."
        breadcrumbs={[
          { label: "Accueil", href: "/" },
          { label: "Journal forensique" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={chargement || lignesFiltrees.length === 0}
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => exporterCsv(lignesFiltrees, "enp-audit-forensic")}
            >
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={chargement || lignesFiltrees.length === 0}
              leftIcon={<Lock className="w-3.5 h-3.5" />}
              onClick={() => exporterJsonScelle(lignesFiltrees, "enp-audit-scelle")}
            >
              Dossier JSON
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={chargement}
              leftIcon={
                <RefreshCw className={`w-3.5 h-3.5 ${chargement ? "animate-spin" : ""}`} />
              }
              onClick={() => void charger()}
            >
              Actualiser
            </Button>
          </div>
        }
      />

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {/* BANDEAU D'INTÉGRITÉ CRYPTOGRAPHIQUE WORM */}
      <section
        className={`border p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          integrite?.intact === false
            ? "bg-enp-red-light border-enp-red-error text-enp-red-inst"
            : "bg-white border-enp-border text-enp-black"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          {integrite?.intact === false ? (
            <ShieldAlert className="w-5 h-5 text-enp-red-inst shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-enp-green-valid shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold">
              {integrite?.intact === false
                ? `Alerte d'intégrité : ${integrite.anomalies.length} anomalie(s) détectée(s) dans la chaîne`
                : `Chaîne cryptographique WORM intègre (${integrite?.totalVerifie ?? lignes.length} événements scellés SHA-256)`}
            </p>
            <p className="text-[11px] text-enp-gray-medium font-mono truncate">
              {integrite?.dernierHash
                ? `Dernière empreinte : ${integrite.dernierHash.slice(0, 28)}...`
                : "Accès exclusif Administrateur · Aucune modification ni suppression autorisée"}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={verifEnCours || chargement}
          onClick={() => void handleVerifierIntegrite()}
          className="self-start sm:self-auto shrink-0"
        >
          {verifEnCours ? "Vérification..." : "Vérifier l'intégrité"}
        </Button>
      </section>

      {/* REPÈRES CHIFFRÉS */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-enp-border">
        <div className="p-3.5 sm:p-4">
          <p className="text-[11px] uppercase tracking-wider text-enp-gray-medium font-semibold">
            Événements tracés
          </p>
          <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-blue-deep mt-1">
            {stats.total}
          </p>
        </div>
        <div className="p-3.5 sm:p-4 border-l border-enp-border">
          <p className="text-[11px] uppercase tracking-wider text-enp-gray-medium font-semibold">
            Utilisateurs suivis
          </p>
          <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-blue-deep mt-1">
            {stats.utilisateurs}
          </p>
        </div>
        <div className="p-3.5 sm:p-4 border-t lg:border-t-0 lg:border-l border-enp-border">
          <p className="text-[11px] uppercase tracking-wider text-enp-gray-medium font-semibold">
            IP / Machines
          </p>
          <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-black mt-1">
            {stats.ips} <span className="text-xs font-normal text-enp-gray-medium">/ {stats.machines}</span>
          </p>
        </div>
        <div className="p-3.5 sm:p-4 border-t border-l lg:border-t-0 border-enp-border">
          <p className="text-[11px] uppercase tracking-wider text-enp-gray-medium font-semibold">
            Alertes sécurité
          </p>
          <p
            className={`text-xl sm:text-2xl font-bold font-mono tabular-nums mt-1 ${
              stats.alertes > 0 ? "text-amber-700" : "text-enp-green-valid"
            }`}
          >
            {stats.alertes}
          </p>
        </div>
      </section>

      {/* NAVIGATION PAR ONGLETS */}
      <div className="flex border-b border-enp-border bg-white" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === "global"}
          onClick={() => setOnglet("global")}
          className={`px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            onglet === "global"
              ? "border-enp-blue-primary text-enp-blue-deep bg-enp-blue-ice/40"
              : "border-transparent text-enp-gray-medium hover:text-enp-black"
          }`}
        >
          Journal global ({lignesFiltrees.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onglet === "utilisateur"}
          onClick={() => setOnglet("utilisateur")}
          className={`px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            onglet === "utilisateur"
              ? "border-enp-blue-primary text-enp-blue-deep bg-enp-blue-ice/40"
              : "border-transparent text-enp-gray-medium hover:text-enp-black"
          }`}
        >
          <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Historique par utilisateur</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* ONGLET 1 : JOURNAL GLOBAL MULTI-FILTRES                      */}
      {/* ============================================================ */}
      {onglet === "global" && (
        <div className="space-y-4">
          {/* BARRE DE FILTRES FORENSIQUES */}
          <section className="bg-white border border-enp-border p-3.5 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="relative sm:col-span-2">
                <Search
                  className="w-4 h-4 text-enp-gray-medium absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher nom, matricule, action, IP, ville, empreinte..."
                  aria-label="Rechercher dans le journal forensique"
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[38px]"
                />
              </div>

              <select
                value={filtreRole}
                onChange={(e) => setFiltreRole(e.target.value as Role | "")}
                aria-label="Filtrer par rôle"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[38px]"
              >
                <option value="">Tous les rôles (y compris Direction)</option>
                {TOUS_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {LIBELLES_ROLES[r]}
                  </option>
                ))}
              </select>

              <select
                value={filtreGravite}
                onChange={(e) => setFiltreGravite(e.target.value as GraviteAudit | "")}
                aria-label="Filtrer par gravité"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[38px]"
              >
                <option value="">Toutes gravités</option>
                {TOUTES_GRAVITES.map((g) => (
                  <option key={g} value={g}>
                    {LIBELLES_GRAVITE_AUDIT[g]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-center">
              <select
                value={filtreCategorie}
                onChange={(e) => setFiltreCategorie(e.target.value as CategorieAudit | "")}
                aria-label="Filtrer par catégorie"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[38px]"
              >
                <option value="">Toutes catégories</option>
                {TOUTES_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {LIBELLES_CATEGORIE_AUDIT[c]}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={filtreIp}
                onChange={(e) => setFiltreIp(e.target.value)}
                placeholder="Filtrer par IP (ex: 41.207...)"
                aria-label="Filtrer par adresse IP"
                className="w-full px-3 py-2 text-xs sm:text-sm font-mono border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[38px]"
              />

              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                aria-label="Date de début"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[38px]"
              />

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  aria-label="Date de fin"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[38px]"
                />
                {aFiltresActifs && (
                  <button
                    type="button"
                    onClick={reinitialiserFiltres}
                    className="px-2.5 py-2 text-xs font-medium text-enp-gray-dark hover:text-enp-black border border-enp-border shrink-0 min-h-[38px]"
                  >
                    Effacer
                  </button>
                )}
              </div>
            </div>
          </section>

          {chargement ? (
            <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
              Chargement du journal forensique…
            </div>
          ) : lignesFiltrees.length === 0 ? (
            <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
              Aucun événement ne correspond aux filtres sélectionnés.
            </div>
          ) : (
            <div className="bg-white border border-enp-border overflow-hidden">
              {/* VUE MOBILE */}
              <div className="block lg:hidden divide-y divide-enp-border">
                {lignesFiltrees.map((ligne) => (
                  <div key={ligne.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-enp-black break-words">
                          {ligne.action}
                        </p>
                        <p className="text-xs text-enp-blue-deep font-medium mt-0.5">
                          {ligne.userNomComplet ?? ligne.userMatricule ?? "Système"}
                          {ligne.userRole ? ` · ${LIBELLES_ROLES[ligne.userRole]}` : ""}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 border shrink-0 ${classeGravite(
                          ligne.gravite,
                        )}`}
                      >
                        {LIBELLES_GRAVITE_AUDIT[ligne.gravite ?? "info"]}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-1 text-xs text-enp-gray-dark bg-enp-bg/60 border border-enp-border/70 p-2.5">
                      <p className="font-mono text-[11px] tabular-nums text-enp-gray-medium">
                        {new Date(ligne.creeLe).toLocaleString("fr-FR")} · IP :{" "}
                        <span className="text-enp-black font-semibold">
                          {ligne.ipAddress ?? "-"}
                        </span>
                      </p>
                      <p className="text-[11px]">
                        Machine : {ligne.osNom ?? "Inconnu"} · {ligne.navigateurNom ?? "Inconnu"} (
                        {ligne.appareilType ?? "-"})
                      </p>
                      <p className="text-[11px] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-enp-blue-primary shrink-0" />
                        <span className="truncate">
                          {formaterLocalisationAudit(ligne)}
                          {ligne.geoLatitude !== undefined && ligne.geoLongitude !== undefined
                            ? ` (${ligne.geoLatitude.toFixed(4)}, ${ligne.geoLongitude.toFixed(4)})`
                            : ""}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      {ligne.userId !== undefined ? (
                        <button
                          type="button"
                          onClick={() => {
                            setUtilisateurSelectionneId(ligne.userId!);
                            setOnglet("utilisateur");
                          }}
                          className="text-xs font-medium text-enp-blue-primary hover:underline"
                        >
                          Tout l&apos;historique
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => setDetailSelectionne(ligne)}
                        className="text-xs font-semibold text-enp-blue-deep border border-enp-border px-2.5 py-1 hover:bg-enp-blue-ice"
                      >
                        Inspecter
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* VUE BUREAU */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-enp-bg border-b border-enp-border text-enp-gray-dark">
                      <th scope="col" className="px-3.5 py-3 font-semibold">Horodatage</th>
                      <th scope="col" className="px-3.5 py-3 font-semibold">Acteur &amp; Rôle</th>
                      <th scope="col" className="px-3.5 py-3 font-semibold">Action &amp; Route</th>
                      <th scope="col" className="px-3.5 py-3 font-semibold">IP &amp; Machine</th>
                      <th scope="col" className="px-3.5 py-3 font-semibold">Localisation précise</th>
                      <th scope="col" className="px-3.5 py-3 font-semibold text-right">Détail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-enp-border">
                    {lignesFiltrees.map((ligne) => (
                      <tr
                        key={ligne.id}
                        className="hover:bg-enp-blue-ice/25 transition-colors align-top"
                      >
                        <td className="px-3.5 py-3 whitespace-nowrap font-mono tabular-nums text-enp-gray-medium">
                          <div>{new Date(ligne.creeLe).toLocaleDateString("fr-FR")}</div>
                          <div className="text-enp-black font-semibold">
                            {new Date(ligne.creeLe).toLocaleTimeString("fr-FR")}
                          </div>
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="font-semibold text-enp-black">
                            {ligne.userNomComplet ?? ligne.userMatricule ?? "Système"}
                          </div>
                          <div className="text-[11px] text-enp-gray-medium font-mono">
                            {ligne.userMatricule ?? "-"}
                            {ligne.userRole ? ` · ${LIBELLES_ROLES[ligne.userRole]}` : ""}
                          </div>
                          {ligne.userId !== undefined && (
                            <button
                              type="button"
                              onClick={() => {
                                setUtilisateurSelectionneId(ligne.userId!);
                                setOnglet("utilisateur");
                              }}
                              className="text-[11px] text-enp-blue-primary hover:underline mt-0.5"
                            >
                              Voir tout l&apos;historique
                            </button>
                          )}
                        </td>
                        <td className="px-3.5 py-3 max-w-[260px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-enp-black">
                              {ligne.action}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 border ${classeGravite(
                                ligne.gravite,
                              )}`}
                            >
                              {LIBELLES_GRAVITE_AUDIT[ligne.gravite ?? "info"]}
                            </span>
                          </div>
                          <div className="text-[11px] text-enp-gray-medium font-mono truncate mt-0.5">
                            {ligne.methodeHttp ? `${ligne.methodeHttp} ` : ""}
                            {ligne.cheminHttp ?? ligne.objet ?? "-"}
                            {ligne.statutHttp ? ` (${ligne.statutHttp})` : ""}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <div className="font-mono font-semibold text-enp-blue-deep">
                            {ligne.ipAddress ?? "-"}
                          </div>
                          <div className="text-[11px] text-enp-gray-dark">
                            {ligne.osNom ?? "Inconnu"} · {ligne.navigateurNom ?? "Inconnu"}
                          </div>
                          <div className="text-[10px] font-mono text-enp-gray-medium">
                            {ligne.deviceFingerprint ?? "-"}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 max-w-[230px]">
                          <div className="font-medium text-enp-black truncate">
                            {formaterLocalisationAudit(ligne)}
                          </div>
                          {ligne.geoLatitude !== undefined && ligne.geoLongitude !== undefined && (
                            <div className="text-[11px] font-mono tabular-nums text-enp-gray-medium">
                              {ligne.geoLatitude.toFixed(5)}, {ligne.geoLongitude.toFixed(5)}
                              {ligne.geoPrecisionMetres !== undefined
                                ? ` (±${ligne.geoPrecisionMetres}m)`
                                : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailSelectionne(ligne)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-enp-blue-deep border border-enp-border hover:bg-enp-blue-ice transition-colors"
                          >
                            Inspecter
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* ONGLET 2 : DOSSIER & HISTORIQUE COMPLET PAR UTILISATEUR      */}
      {/* ============================================================ */}
      {onglet === "utilisateur" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Liste des comptes tracés (tous rôles, y compris Direction) */}
          <aside className="lg:col-span-4 bg-white border border-enp-border overflow-hidden">
            <div className="px-4 py-3 border-b border-enp-border bg-enp-bg">
              <h2 className="text-xs font-bold uppercase tracking-wider text-enp-blue-deep">
                Utilisateurs tracés ({utilisateursTraces.length})
              </h2>
              <p className="text-[11px] text-enp-gray-medium mt-0.5">
                Tous profils inclus : Direction, Scolarité, Enseignants, Étudiants, Admin.
              </p>
            </div>
            <div className="divide-y divide-enp-border max-h-[540px] overflow-y-auto scrollbar-thin">
              {utilisateursTraces.map((u) => {
                const actif = u.userId === utilisateurSelectionneId;
                return (
                  <button
                    key={u.userId}
                    type="button"
                    onClick={() => setUtilisateurSelectionneId(u.userId)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-2 ${
                      actif
                        ? "bg-enp-blue-ice border-l-2 border-l-enp-blue-primary"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-enp-black truncate">
                        {u.nomComplet}
                      </p>
                      <p className="text-[11px] text-enp-gray-medium truncate">
                        <span className="font-mono">{u.matricule}</span>
                        {u.role ? ` · ${LIBELLES_ROLES[u.role]}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-bold text-enp-blue-deep">
                        {u.total} act.
                      </p>
                      {u.alertes > 0 && (
                        <p className="text-[10px] font-semibold text-amber-700">
                          {u.alertes} alerte{u.alertes > 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Dossier forensique détaillé de l'utilisateur sélectionné */}
          <div className="lg:col-span-8 space-y-4 min-w-0">
            {!dossierUtilisateur ? (
              <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
                Sélectionnez un utilisateur pour consulter son dossier forensique complet.
              </div>
            ) : (
              <>
                <section className="bg-white border border-enp-border p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-enp-border pb-3.5">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-enp-blue-primary">
                        Dossier forensique individuel
                      </p>
                      <h2 className="text-lg font-bold text-enp-blue-deep mt-0.5">
                        {dossierUtilisateur.userNomComplet}
                      </h2>
                      <p className="text-xs text-enp-gray-medium mt-0.5">
                        Matricule :{" "}
                        <span className="font-mono font-semibold text-enp-black">
                          {dossierUtilisateur.userMatricule}
                        </span>
                        {dossierUtilisateur.userRole
                          ? ` · Rôle : ${LIBELLES_ROLES[dossierUtilisateur.userRole]}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        leftIcon={<Download className="w-3.5 h-3.5" />}
                        onClick={() =>
                          exporterCsv(
                            dossierUtilisateur.evenements,
                            `enp-historique-${dossierUtilisateur.userMatricule.toLowerCase()}`,
                          )
                        }
                      >
                        Export CSV utilisateur
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        leftIcon={<Lock className="w-3.5 h-3.5" />}
                        onClick={() =>
                          exporterJsonScelle(
                            dossierUtilisateur.evenements,
                            `enp-historique-${dossierUtilisateur.userMatricule.toLowerCase()}`,
                          )
                        }
                      >
                        JSON scellé
                      </Button>
                    </div>
                  </div>

                  {/* Synthèse IP, Machines, Localisations */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="border border-enp-border p-3 space-y-2 bg-enp-bg/40">
                      <p className="text-xs font-semibold text-enp-blue-deep flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span>Adresses IP ({dossierUtilisateur.adressesIp.length})</span>
                      </p>
                      <ul className="space-y-1.5 text-xs">
                        {dossierUtilisateur.adressesIp.map((item) => (
                          <li key={item.ip} className="border-t border-enp-border/70 pt-1.5 first:border-t-0 first:pt-0">
                            <p className="font-mono font-semibold text-enp-black">
                              {item.ip} ({item.occurrences}x)
                            </p>
                            <p className="text-[11px] text-enp-gray-medium truncate">
                              {item.localisation}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="border border-enp-border p-3 space-y-2 bg-enp-bg/40">
                      <p className="text-xs font-semibold text-enp-blue-deep flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 shrink-0" />
                        <span>Machines ({dossierUtilisateur.machines.length})</span>
                      </p>
                      <ul className="space-y-1.5 text-xs">
                        {dossierUtilisateur.machines.map((m) => (
                          <li key={m.empreinte} className="border-t border-enp-border/70 pt-1.5 first:border-t-0 first:pt-0">
                            <p className="font-semibold text-enp-black">
                              {m.osNom} · {m.navigateurNom}
                            </p>
                            <p className="text-[11px] font-mono text-enp-gray-medium truncate">
                              {m.empreinte} ({m.appareilType})
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="border border-enp-border p-3 space-y-2 bg-enp-bg/40">
                      <p className="text-xs font-semibold text-enp-blue-deep flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>Localisations ({dossierUtilisateur.localisations.length})</span>
                      </p>
                      <ul className="space-y-1.5 text-xs">
                        {dossierUtilisateur.localisations.map((loc) => {
                          const urlCarte = construireUrlCarteSecurisee(
                            loc.latitude,
                            loc.longitude,
                          );
                          return (
                            <li
                              key={`${loc.libelle}-${loc.latitude ?? ""}`}
                              className="border-t border-enp-border/70 pt-1.5 first:border-t-0 first:pt-0"
                            >
                              <p className="font-medium text-enp-black">
                                {loc.libelle}
                              </p>
                              {loc.latitude !== undefined && loc.longitude !== undefined && (
                                <p className="text-[11px] font-mono text-enp-gray-medium">
                                  {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                                  {loc.precisionMetres !== undefined
                                    ? ` (±${loc.precisionMetres}m)`
                                    : ""}
                                </p>
                              )}
                              {urlCarte && (
                                <a
                                  href={urlCarte}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-enp-blue-primary hover:underline mt-0.5"
                                >
                                  <span>Voir sur carte</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Chronologie exhaustive des actions */}
                <section className="bg-white border border-enp-border overflow-hidden">
                  <div className="px-4 py-3 border-b border-enp-border bg-enp-bg flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-enp-blue-deep">
                      Chronologie exhaustive ({dossierUtilisateur.totalActions} actions)
                    </h3>
                    <span className="text-[11px] font-mono text-enp-gray-medium">
                      Du {new Date(dossierUtilisateur.premiereActivite).toLocaleDateString("fr-FR")} au{" "}
                      {new Date(dossierUtilisateur.derniereActivite).toLocaleDateString("fr-FR")}
                    </span>
                  </div>

                  <div className="divide-y divide-enp-border">
                    {dossierUtilisateur.evenements.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-enp-blue-ice/20 transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs tabular-nums text-enp-gray-medium">
                              {new Date(ev.creeLe).toLocaleString("fr-FR")}
                            </span>
                            <span className="text-xs font-bold text-enp-black">
                              {ev.action}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 border ${classeGravite(
                                ev.gravite,
                              )}`}
                            >
                              {LIBELLES_GRAVITE_AUDIT[ev.gravite ?? "info"]}
                            </span>
                          </div>
                          {ev.detail && (
                            <p className="text-xs text-enp-gray-dark leading-relaxed">
                              {ev.detail}
                            </p>
                          )}
                          <p className="text-[11px] font-mono text-enp-gray-medium">
                            IP {ev.ipAddress ?? "-"} · {ev.osNom ?? "Inconnu"} / {ev.navigateurNom ?? "Inconnu"} ·{" "}
                            {formaterLocalisationAudit(ev)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setDetailSelectionne(ev)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-enp-blue-deep border border-enp-border hover:bg-enp-blue-ice shrink-0 self-start"
                        >
                          Détails
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODALE D'INSPECTION FORENSIQUE DÉTAILLÉE                     */}
      {/* ============================================================ */}
      {detailSelectionne && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#00172E]/70"
          role="dialog"
          aria-modal="true"
          aria-label="Inspection forensique de l'événement"
        >
          <div className="bg-white border border-enp-border w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-elevated">
            <div className="px-4 sm:px-5 py-3.5 bg-[#0d3b66] text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-slate-300">
                  Événement scellé #{detailSelectionne.id} ·{" "}
                  {new Date(detailSelectionne.creeLe).toLocaleString("fr-FR")}
                </p>
                <h2 className="text-sm sm:text-base font-bold truncate">
                  {detailSelectionne.action}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailSelectionne(null)}
                className="p-2 text-white/90 hover:text-white hover:bg-white/10"
                aria-label="Fermer l'inspection"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Qui & Quoi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-enp-border p-3.5 bg-enp-bg/40">
                <div>
                  <p className="text-[11px] uppercase font-semibold text-enp-gray-medium">
                    Acteur identifié
                  </p>
                  <p className="text-sm font-bold text-enp-black mt-0.5">
                    {detailSelectionne.userNomComplet ?? detailSelectionne.userMatricule ?? "Système"}
                  </p>
                  <p className="font-mono text-enp-gray-dark">
                    {detailSelectionne.userMatricule ?? "-"}
                    {detailSelectionne.userRole
                      ? ` · ${LIBELLES_ROLES[detailSelectionne.userRole]}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase font-semibold text-enp-gray-medium">
                    Requête HTTP &amp; Statut
                  </p>
                  <p className="font-mono font-semibold text-enp-blue-deep mt-0.5 break-all">
                    {detailSelectionne.methodeHttp ?? "CLIENT"}{" "}
                    {detailSelectionne.cheminHttp ?? detailSelectionne.objet ?? "-"}
                  </p>
                  <p className="text-enp-gray-dark">
                    Statut : {detailSelectionne.statutHttp ?? "-"}
                    {detailSelectionne.dureeMs !== undefined
                      ? ` · Durée : ${detailSelectionne.dureeMs} ms`
                      : ""}
                    {detailSelectionne.sessionId
                      ? ` · Session : ${detailSelectionne.sessionId}`
                      : ""}
                  </p>
                </div>
              </div>

              {detailSelectionne.detail && (
                <div className="border border-enp-border p-3.5">
                  <p className="text-[11px] uppercase font-semibold text-enp-gray-medium">
                    Description détaillée
                  </p>
                  <p className="text-enp-black mt-1 leading-relaxed">
                    {detailSelectionne.detail}
                  </p>
                </div>
              )}

              {/* Réseau & Machine */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border border-enp-border p-3.5 space-y-1.5">
                  <p className="text-[11px] uppercase font-semibold text-enp-blue-deep">
                    Réseau &amp; Machine
                  </p>
                  <p>
                    <span className="text-enp-gray-medium">Adresse IP : </span>
                    <span className="font-mono font-semibold text-enp-black">
                      {detailSelectionne.ipAddress ?? "-"}
                    </span>
                  </p>
                  {detailSelectionne.ipForwardedChain && (
                    <p className="break-all">
                      <span className="text-enp-gray-medium">Chaîne proxy : </span>
                      <span className="font-mono text-enp-gray-dark">
                        {detailSelectionne.ipForwardedChain}
                      </span>
                    </p>
                  )}
                  <p>
                    <span className="text-enp-gray-medium">Système / Navigateur : </span>
                    <span className="text-enp-black font-medium">
                      {detailSelectionne.osNom ?? "Inconnu"} ·{" "}
                      {detailSelectionne.navigateurNom ?? "Inconnu"} (
                      {detailSelectionne.appareilType ?? "-"})
                    </span>
                  </p>
                  <p>
                    <span className="text-enp-gray-medium">Empreinte machine : </span>
                    <span className="font-mono text-enp-black">
                      {detailSelectionne.deviceFingerprint ?? "-"}
                    </span>
                  </p>
                  <p>
                    <span className="text-enp-gray-medium">Écran / Fuseau / Langue : </span>
                    <span className="font-mono text-enp-gray-dark">
                      {detailSelectionne.ecranResolution ?? "-"} ·{" "}
                      {detailSelectionne.fuseauHoraire ?? "-"} ·{" "}
                      {detailSelectionne.langue ?? "-"}
                    </span>
                  </p>
                </div>

                {/* Localisation précise */}
                <div className="border border-enp-border p-3.5 space-y-1.5">
                  <p className="text-[11px] uppercase font-semibold text-enp-blue-deep">
                    Localisation précise
                  </p>
                  <p>
                    <span className="text-enp-gray-medium">Lieu : </span>
                    <span className="font-semibold text-enp-black">
                      {formaterLocalisationAudit(detailSelectionne)}
                    </span>
                  </p>
                  <p>
                    <span className="text-enp-gray-medium">Source : </span>
                    <span className="text-enp-black">
                      {libelleSourceGeo(detailSelectionne.geoSource)}
                    </span>
                  </p>
                  {detailSelectionne.geoLatitude !== undefined &&
                    detailSelectionne.geoLongitude !== undefined && (
                      <p>
                        <span className="text-enp-gray-medium">Coordonnées GPS : </span>
                        <span className="font-mono font-semibold text-enp-black">
                          {detailSelectionne.geoLatitude.toFixed(6)},{" "}
                          {detailSelectionne.geoLongitude.toFixed(6)}
                        </span>
                        {detailSelectionne.geoPrecisionMetres !== undefined && (
                          <span className="text-enp-gray-medium">
                            {" "}
                            (±{detailSelectionne.geoPrecisionMetres} m)
                          </span>
                        )}
                      </p>
                    )}
                  {detailSelectionne.geoFai && (
                    <p>
                      <span className="text-enp-gray-medium">Opérateur / FAI : </span>
                      <span className="text-enp-black">{detailSelectionne.geoFai}</span>
                    </p>
                  )}
                  {(() => {
                    const url = construireUrlCarteSecurisee(
                      detailSelectionne.geoLatitude,
                      detailSelectionne.geoLongitude,
                    );
                    if (!url) return null;
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-1 text-enp-blue-primary font-semibold hover:underline"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Ouvrir la position exacte sur OpenStreetMap</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    );
                  })()}
                </div>
              </div>

              {/* Scellement cryptographique */}
              <div className="border border-enp-border p-3.5 bg-slate-50 space-y-1.5">
                <p className="text-[11px] uppercase font-semibold text-enp-blue-deep flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Preuve cryptographique WORM (SHA-256)</span>
                </p>
                <p className="font-mono text-[11px] break-all">
                  <span className="text-enp-gray-medium">Empreinte : </span>
                  <span className="text-enp-black">{detailSelectionne.entryHash ?? "-"}</span>
                </p>
                <p className="font-mono text-[11px] break-all">
                  <span className="text-enp-gray-medium">Lien précédent : </span>
                  <span className="text-enp-gray-dark">{detailSelectionne.previousHash ?? "-"}</span>
                </p>
                {detailSelectionne.userAgent && (
                  <p className="font-mono text-[10px] text-enp-gray-medium break-all pt-1 border-t border-enp-border">
                    UA : {detailSelectionne.userAgent}
                  </p>
                )}
              </div>

              {detailSelectionne.metadata && (
                <div className="border border-enp-border p-3.5">
                  <p className="text-[11px] uppercase font-semibold text-enp-gray-medium mb-1">
                    Métadonnées techniques (champs sensibles masqués)
                  </p>
                  <pre className="text-[11px] font-mono bg-enp-bg p-2.5 overflow-x-auto text-enp-black">
                    {JSON.stringify(detailSelectionne.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="px-4 sm:px-5 py-3 border-t border-enp-border bg-enp-bg flex items-center justify-between gap-2">
              {detailSelectionne.userId !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUtilisateurSelectionneId(detailSelectionne.userId!);
                    setDetailSelectionne(null);
                    setOnglet("utilisateur");
                  }}
                >
                  Ouvrir tout l&apos;historique de cet acteur
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setDetailSelectionne(null)}
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
