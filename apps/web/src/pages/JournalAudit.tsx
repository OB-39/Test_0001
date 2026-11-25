import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  UserCheck,
} from "lucide-react";
import { api, ApiError } from "@/api";
import type {
  GraviteAudit,
  LigneAudit,
  RapportIntegriteAudit,
  Role,
} from "@/api/types";
import { LIBELLES_ROLES } from "@/components/menuConfig";
import { Alert, Button, PageHeader } from "@/components/ui";
import {
  filtrerLignesAudit,
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

const TOUTES_GRAVITES: GraviteAudit[] = ["info", "sensible", "alerte", "critique"];

const LIMITE_AFFICHAGE_FRONT = 80;
const COMMANDE_CLI_EXEMPLE = "node scripts/audit-cli.js --last 50";

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

export function JournalAudit() {
  const [lignes, setLignes] = useState<LigneAudit[]>([]);
  const [integrite, setIntegrite] = useState<RapportIntegriteAudit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [verifEnCours, setVerifEnCours] = useState(false);
  const [commandeCopiee, setCommandeCopiee] = useState(false);

  const [onglet, setOnglet] = useState<OngletJournal>("global");
  const [recherche, setRecherche] = useState("");
  const [filtreRole, setFiltreRole] = useState<Role | "">("");
  const [filtreGravite, setFiltreGravite] = useState<GraviteAudit | "">("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [utilisateurSelectionneId, setUtilisateurSelectionneId] = useState<number | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [data, rapport] = await Promise.all([
        api.journalAudit({ limite: LIMITE_AFFICHAGE_FRONT }),
        api.verifierIntegriteAudit(),
      ]);
      setLignes(data);
      setIntegrite(rapport);
      if (data.length > 0) {
        setUtilisateurSelectionneId((prev) => {
          if (prev !== null && data.some((d) => d.userId === prev)) return prev;
          return data.find((d) => d.userId !== undefined)?.userId ?? null;
        });
      }
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Consultation du journal d'activité impossible.",
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
          : "Vérification de l'intégrité impossible.",
      );
    } finally {
      setVerifEnCours(false);
    }
  }

  async function copierCommandeCli() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(COMMANDE_CLI_EXEMPLE);
        setCommandeCopiee(true);
        window.setTimeout(() => setCommandeCopiee(false), 2000);
      }
    } catch {
      // Presse-papiers non disponible dans ce contexte
    }
  }

  const lignesFiltrees = useMemo(
    () =>
      filtrerLignesAudit(lignes, {
        recherche,
        role: filtreRole,
        gravite: filtreGravite,
        dateDebut,
        dateFin,
      }),
    [lignes, recherche, filtreRole, filtreGravite, dateDebut, dateFin],
  );

  const utilisateursTraces = useMemo(() => {
    const map = new Map<
      number,
      {
        userId: number;
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

  const actionsUtilisateur = useMemo(() => {
    if (utilisateurSelectionneId === null) return [];
    return lignes.filter((l) => l.userId === utilisateurSelectionneId);
  }, [lignes, utilisateurSelectionneId]);

  const utilisateurActif = useMemo(
    () => utilisateursTraces.find((u) => u.userId === utilisateurSelectionneId) ?? null,
    [utilisateursTraces, utilisateurSelectionneId],
  );

  const totalAlertes = useMemo(
    () =>
      lignes.filter((l) => l.gravite === "alerte" || l.gravite === "critique").length,
    [lignes],
  );

  function reinitialiserFiltres() {
    setRecherche("");
    setFiltreRole("");
    setFiltreGravite("");
    setDateDebut("");
    setDateFin("");
  }

  const aFiltresActifs = Boolean(
    recherche || filtreRole || filtreGravite || dateDebut || dateFin,
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in pb-8">
      <PageHeader
        title="Journal d'activité"
        description="Vue allégée des derniers événements. Le suivi détaillé complet (IP, appareil, géolocalisation, scellement) reste actif sur le serveur et accessible depuis le terminal."
        breadcrumbs={[
          { label: "Accueil", href: "/" },
          { label: "Journal d'activité" },
        ]}
        actions={
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
        }
      />

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {/* BANDEAU SYNTHETIQUE (3 REPERES + INTEGRITE) */}
      <section className="grid grid-cols-1 sm:grid-cols-3 bg-white border border-enp-border">
        <div className="p-3.5 sm:p-4">
          <p className="text-[11px] uppercase tracking-wider text-enp-gray-medium font-semibold">
            Événements récents
          </p>
          <p className="text-xl font-bold font-mono tabular-nums text-enp-blue-deep mt-0.5">
            {lignesFiltrees.length}
            <span className="text-xs font-normal text-enp-gray-medium ml-1">
              / {lignes.length}
            </span>
          </p>
        </div>

        <div className="p-3.5 sm:p-4 border-t sm:border-t-0 sm:border-l border-enp-border">
          <p className="text-[11px] uppercase tracking-wider text-enp-gray-medium font-semibold">
            Alertes sécurité
          </p>
          <p
            className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${
              totalAlertes > 0 ? "text-amber-700" : "text-enp-green-valid"
            }`}
          >
            {totalAlertes}
          </p>
        </div>

        <div className="p-3.5 sm:p-4 border-t sm:border-t-0 sm:border-l border-enp-border flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-enp-gray-medium font-semibold">
              Intégrité chaîne
            </p>
            <p
              className={`text-sm font-semibold mt-1 flex items-center gap-1.5 ${
                integrite?.intact === false ? "text-enp-red-inst" : "text-enp-green-valid"
              }`}
            >
              {integrite?.intact === false ? (
                <>
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{integrite.anomalies.length} anomalie(s)</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Chaîne intègre</span>
                </>
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={verifEnCours || chargement}
            onClick={() => void handleVerifierIntegrite()}
            className="shrink-0"
          >
            {verifEnCours ? "..." : "Vérifier"}
          </Button>
        </div>
      </section>

      {/* ONGLETS SIMPLES */}
      <div className="flex border-b border-enp-border bg-white" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === "global"}
          onClick={() => setOnglet("global")}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors ${
            onglet === "global"
              ? "border-enp-blue-primary text-enp-blue-deep bg-enp-blue-ice/40"
              : "border-transparent text-enp-gray-medium hover:text-enp-black"
          }`}
        >
          Activité récente ({lignesFiltrees.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onglet === "utilisateur"}
          onClick={() => setOnglet("utilisateur")}
          className={`px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            onglet === "utilisateur"
              ? "border-enp-blue-primary text-enp-blue-deep bg-enp-blue-ice/40"
              : "border-transparent text-enp-gray-medium hover:text-enp-black"
          }`}
        >
          <UserCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Par utilisateur ({utilisateursTraces.length})</span>
        </button>
      </div>

      {/* ONGLET 1 : ACTIVITE RECENTE ALLEGEE */}
      {onglet === "global" && (
        <div className="space-y-3.5">
          {/* FILTRES ESSENTIELS */}
          <section className="bg-white border border-enp-border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-center">
            <div className="relative sm:col-span-2">
              <Search
                className="w-4 h-4 text-enp-gray-medium absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher nom, action..."
                aria-label="Rechercher dans le journal d'activité"
                className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[36px]"
              />
            </div>

            <select
              value={filtreRole}
              onChange={(e) => setFiltreRole(e.target.value as Role | "")}
              aria-label="Filtrer par rôle"
              className="w-full px-2.5 py-1.5 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[36px]"
            >
              <option value="">Tous les rôles</option>
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
              className="w-full px-2.5 py-1.5 text-xs sm:text-sm border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[36px]"
            >
              <option value="">Toutes gravités</option>
              {TOUTES_GRAVITES.map((g) => (
                <option key={g} value={g}>
                  {LIBELLES_GRAVITE_AUDIT[g]}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              aria-label="Date de début"
              className="w-full px-2.5 py-1.5 text-xs border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[36px]"
            />

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                aria-label="Date de fin"
                className="w-full px-2.5 py-1.5 text-xs border border-enp-border bg-white focus:outline-none focus:border-enp-blue-primary min-h-[36px]"
              />
              {aFiltresActifs && (
                <button
                  type="button"
                  onClick={reinitialiserFiltres}
                  className="px-2 py-1.5 text-xs font-medium text-enp-gray-dark hover:text-enp-black border border-enp-border shrink-0 min-h-[36px]"
                >
                  Effacer
                </button>
              )}
            </div>
          </section>

          {chargement ? (
            <div className="bg-white border border-enp-border p-8 text-center text-sm text-enp-gray-medium">
              Chargement des événements récents...
            </div>
          ) : lignesFiltrees.length === 0 ? (
            <div className="bg-white border border-enp-border p-8 text-center text-sm text-enp-gray-medium">
              Aucun événement ne correspond aux filtres.
            </div>
          ) : (
            <div className="bg-white border border-enp-border overflow-hidden">
              {/* VUE MOBILE */}
              <div className="block md:hidden divide-y divide-enp-border">
                {lignesFiltrees.map((ligne) => (
                  <div key={ligne.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-enp-black break-words">
                        {ligne.action}
                      </p>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 border shrink-0 ${classeGravite(
                          ligne.gravite,
                        )}`}
                      >
                        {LIBELLES_GRAVITE_AUDIT[ligne.gravite ?? "info"]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-enp-gray-medium">
                      <span className="truncate font-medium text-enp-blue-deep">
                        {ligne.userNomComplet ?? ligne.userMatricule ?? "Système"}
                        {ligne.userRole ? ` · ${LIBELLES_ROLES[ligne.userRole]}` : ""}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums shrink-0">
                        {new Date(ligne.creeLe).toLocaleString("fr-FR")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* VUE BUREAU : 4 COLONNES ESSENTIELLES UNIQUEMENT */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-enp-bg border-b border-enp-border text-enp-gray-dark">
                      <th scope="col" className="px-4 py-2.5 font-semibold w-44">
                        Date &amp; heure
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold w-64">
                        Utilisateur
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">
                        Action
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-semibold text-right w-28">
                        Gravité
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-enp-border">
                    {lignesFiltrees.map((ligne) => (
                      <tr
                        key={ligne.id}
                        className="hover:bg-enp-blue-ice/20 transition-colors"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap font-mono tabular-nums text-enp-gray-medium">
                          {new Date(ligne.creeLe).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-enp-black truncate">
                              {ligne.userNomComplet ?? ligne.userMatricule ?? "Système"}
                            </span>
                            {ligne.userId !== undefined && (
                              <button
                                type="button"
                                onClick={() => {
                                  setUtilisateurSelectionneId(ligne.userId!);
                                  setOnglet("utilisateur");
                                }}
                                className="text-[11px] text-enp-blue-primary hover:underline shrink-0"
                              >
                                Historique
                              </button>
                            )}
                          </div>
                          {ligne.userRole && (
                            <p className="text-[11px] text-enp-gray-medium">
                              {LIBELLES_ROLES[ligne.userRole]}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-enp-black">{ligne.action}</p>
                          {(ligne.objet || ligne.detail) && (
                            <p className="text-[11px] text-enp-gray-medium truncate max-w-md">
                              {ligne.objet ?? ligne.detail}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 border ${classeGravite(
                              ligne.gravite,
                            )}`}
                          >
                            {LIBELLES_GRAVITE_AUDIT[ligne.gravite ?? "info"]}
                          </span>
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

      {/* ONGLET 2 : HISTORIQUE SIMPLIFIE PAR UTILISATEUR */}
      {onglet === "utilisateur" && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <aside className="md:col-span-4 bg-white border border-enp-border overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-enp-border bg-enp-bg">
              <h2 className="text-xs font-bold uppercase tracking-wider text-enp-blue-deep">
                Comptes récents ({utilisateursTraces.length})
              </h2>
            </div>
            <div className="divide-y divide-enp-border max-h-[460px] overflow-y-auto scrollbar-thin">
              {utilisateursTraces.map((u) => {
                const actif = u.userId === utilisateurSelectionneId;
                return (
                  <button
                    key={u.userId}
                    type="button"
                    onClick={() => setUtilisateurSelectionneId(u.userId)}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-center justify-between gap-2 ${
                      actif
                        ? "bg-enp-blue-ice border-l-2 border-l-enp-blue-primary"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-enp-black truncate">
                        {u.nomComplet}
                      </p>
                      {u.role && (
                        <p className="text-[11px] text-enp-gray-medium truncate">
                          {LIBELLES_ROLES[u.role]}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-mono font-bold text-enp-blue-deep shrink-0">
                      {u.total}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="md:col-span-8 bg-white border border-enp-border overflow-hidden min-w-0">
            {!utilisateurActif ? (
              <div className="p-8 text-center text-sm text-enp-gray-medium">
                Sélectionnez un utilisateur pour consulter ses dernières actions.
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-enp-border bg-enp-bg flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-enp-blue-deep truncate">
                      {utilisateurActif.nomComplet}
                    </h3>
                    {utilisateurActif.role && (
                      <p className="text-[11px] text-enp-gray-medium">
                        {LIBELLES_ROLES[utilisateurActif.role]} · {actionsUtilisateur.length} action(s) récente(s)
                      </p>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-enp-border max-h-[420px] overflow-y-auto scrollbar-thin">
                  {actionsUtilisateur.map((ev) => (
                    <div
                      key={ev.id}
                      className="px-4 py-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-enp-black">{ev.action}</p>
                        {(ev.objet || ev.detail) && (
                          <p className="text-[11px] text-enp-gray-medium truncate">
                            {ev.objet ?? ev.detail}
                          </p>
                        )}
                        <p className="text-[11px] font-mono tabular-nums text-enp-gray-medium mt-0.5">
                          {new Date(ev.creeLe).toLocaleString("fr-FR")}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 border shrink-0 ${classeGravite(
                          ev.gravite,
                        )}`}
                      >
                        {LIBELLES_GRAVITE_AUDIT[ev.gravite ?? "info"]}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* RAPPEL DISCRET D'ACCES TERMINAL COMPLET */}
      <section
        data-testid="audit-cli-callout"
        className="bg-enp-bg border border-enp-border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <Terminal className="w-4 h-4 text-enp-blue-deep shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-enp-blue-deep">
              Tracking complet actif en arrière-plan (IP, appareil, géolocalisation, HMAC)
            </p>
            <p className="text-[11px] text-enp-gray-medium">
              Pour tout consulter ou exporter une période depuis le terminal serveur :{" "}
              <code className="font-mono text-enp-black bg-white px-1.5 py-0.5 border border-enp-border">
                {COMMANDE_CLI_EXEMPLE}
              </code>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void copierCommandeCli()}
          className="px-2.5 py-1.5 text-xs font-semibold text-enp-blue-deep bg-white border border-enp-border hover:bg-enp-blue-ice transition-colors flex items-center gap-1.5 self-start sm:self-auto shrink-0"
        >
          {commandeCopiee ? (
            <>
              <Check className="w-3.5 h-3.5 text-enp-green-valid" />
              <span>Copié</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copier</span>
            </>
          )}
        </button>
      </section>
    </div>
  );
}
