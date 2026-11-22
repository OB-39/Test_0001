import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mail,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/api";
import type { CompteAdministration, Role } from "@/api/types";
import { LIBELLES_ROLES } from "@/components/menuConfig";
import { useConfirmation } from "@/components/useConfirmation";
import { PageHeader, Button, Alert, Badge } from "@/components/ui";

type FiltreActivation = "tous" | "a_activer" | "actives";

export function ScolariteComptes() {
  const { confirmer } = useConfirmation();
  const [comptes, setComptes] = useState<CompteAdministration[]>([]);
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<FiltreActivation>("tous");
  const [filtreRole, setFiltreRole] = useState<string>("tous");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [envoiActivation, setEnvoiActivation] = useState<
    number | "groupe" | null
  >(null);
  const [suppression, setSuppression] = useState<number | null>(null);
  const [verificationSmtp, setVerificationSmtp] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setComptes(await api.scolariteComptes());
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.messages.join(" "));
      else setErreur("Erreur réseau lors du chargement des comptes.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function envoyerActivation(compte: CompteAdministration) {
    if (!compte.dansPerimetre) return;
    const identifiant = compte.matricule ?? compte.email;
    if (!identifiant) {
      setErreur("Ce compte ne possède ni matricule ni adresse e-mail.");
      setConfirmation(null);
      return;
    }

    setEnvoiActivation(compte.id);
    setErreur(null);
    setConfirmation(null);
    try {
      const resultat = await api.scolariteGenererCodes({
        identifiants: [identifiant],
      });
      if (resultat.courrielsEnfiles > 0) {
        setConfirmation(
          `Le courriel d’activation de ${compte.prenom} ${compte.nom} a été envoyé.`,
        );
      } else if (resultat.comptesSansEmail.length > 0) {
        setErreur(
          `Aucune adresse e-mail n’est enregistrée pour ${compte.prenom} ${compte.nom}.`,
        );
      } else {
        setErreur(
          "Aucun code n’a été généré. Le compte est peut-être déjà activé ou hors de votre périmètre.",
        );
      }
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Erreur réseau lors de l’envoi du code d’activation.",
      );
    } finally {
      setEnvoiActivation(null);
    }
  }

  const comptesFiltres = useMemo(() => {
    const q = recherche.trim().toLocaleLowerCase();
    return comptes.filter((compte) => {
      if (filtreStatut === "a_activer" && compte.motDePasseConfigure)
        return false;
      if (filtreStatut === "actives" && !compte.motDePasseConfigure)
        return false;
      if (filtreRole !== "tous" && !compte.roles.includes(filtreRole as Role))
        return false;
      if (!q) return true;
      return [
        compte.matricule,
        compte.email,
        compte.nom,
        compte.prenom,
        ...compte.roles,
      ].some((valeur) => valeur?.toLocaleLowerCase().includes(q));
    });
  }, [comptes, recherche, filtreStatut, filtreRole]);

  const comptesAActiverFiltres = useMemo(
    () =>
      comptesFiltres.filter(
        (c) =>
          c.dansPerimetre &&
          !c.motDePasseConfigure &&
          Boolean(c.email) &&
          Boolean(c.matricule ?? c.email),
      ),
    [comptesFiltres],
  );

  async function envoyerActivationGroupee() {
    const identifiants = comptesAActiverFiltres
      .map((c) => c.matricule ?? c.email)
      .filter((id): id is string => Boolean(id));
    if (identifiants.length === 0) return;

    setEnvoiActivation("groupe");
    setErreur(null);
    setConfirmation(null);
    try {
      const resultat = await api.scolariteGenererCodes({ identifiants });
      setConfirmation(
        `${resultat.courrielsEnfiles} courriel(s) d'activation mis en file d'envoi.`,
      );
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Erreur lors de l'envoi groupé des codes d'activation.",
      );
    } finally {
      setEnvoiActivation(null);
    }
  }

  async function verifierSmtp() {
    setVerificationSmtp(true);
    setErreur(null);
    setConfirmation(null);
    try {
      await api.scolariteVerifierSmtp();
      setConfirmation(
        "Connexion SMTP vérifiée. Aucun e-mail de test n’a été envoyé.",
      );
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Vérification SMTP impossible.",
      );
    } finally {
      setVerificationSmtp(false);
    }
  }

  async function supprimerCompte(compte: CompteAdministration) {
    if (!compte.peutSupprimer) return;
    const identifiant =
      compte.matricule ?? compte.email ?? `compte ${compte.id}`;
    const confirme = await confirmer({
      title: "Supprimer ce compte ?",
      message: `Le compte de ${compte.prenom} ${compte.nom} (${identifiant}) sera désactivé et anonymisé. Les données académiques seront conservées et l’action inscrite au journal d’audit.`,
      confirmLabel: "Supprimer le compte",
      variant: "danger",
    });
    if (!confirme) return;
    setSuppression(compte.id);
    setErreur(null);
    setConfirmation(null);
    try {
      await api.scolariteSupprimerCompte(compte.id);
      setComptes((existants) =>
        existants.filter((element) => element.id !== compte.id),
      );
      setConfirmation(
        `Le compte ${identifiant} a été supprimé. L’action est inscrite au journal d’audit.`,
      );
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Erreur réseau lors de la suppression du compte.",
      );
    } finally {
      setSuppression(null);
    }
  }

  const stats = useMemo(() => {
    const total = comptes.length;
    const actives = comptes.filter((c) => c.motDePasseConfigure).length;
    const aActiver = total - actives;
    return { total, actives, aActiver };
  }, [comptes]);

  function libelleRoles(roles: Role[]): string {
    if (roles.length === 0) return "Aucun rôle";
    return roles.map((r) => LIBELLES_ROLES[r] ?? r).join(" · ");
  }

  return (
    <div className="space-y-4 sm:space-y-5 max-w-6xl mx-auto animate-fade-in pb-6">
      <PageHeader
        title="Comptes utilisateurs"
        description="Activation et suivi des comptes du campus."
        breadcrumbs={[
          { label: "Accueil", href: "/" },
          { label: "Comptes" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {comptesAActiverFiltres.length > 1 && (
              <Button
                variant="primary"
                size="sm"
                isLoading={envoiActivation === "groupe"}
                leftIcon={<Send className="w-3.5 h-3.5" />}
                onClick={() => void envoyerActivationGroupee()}
              >
                Envoyer ({comptesAActiverFiltres.length})
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={verificationSmtp}
              onClick={() => void verifierSmtp()}
            >
              {verificationSmtp ? "Vérification…" : "Tester SMTP"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={chargement}
              leftIcon={
                <RefreshCw
                  className={`w-3.5 h-3.5 ${chargement ? "animate-spin" : ""}`}
                />
              }
              onClick={() => void charger()}
            >
              Actualiser
            </Button>
          </div>
        }
      />

      {confirmation && (
        <Alert
          variant="success"
          title="Confirmation"
          onClose={() => setConfirmation(null)}
        >
          {confirmation}
        </Alert>
      )}

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {/* SYNTHÈSE UNIFIÉE */}
      {!chargement && comptes.length > 0 && (
        <div className="bg-white border border-enp-border grid grid-cols-3 divide-x divide-enp-border">
          <div className="p-3 sm:p-4">
            <p className="text-xs text-enp-gray-medium">Total</p>
            <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-black mt-0.5">
              {stats.total}
            </p>
          </div>
          <div className="p-3 sm:p-4">
            <p className="text-xs text-enp-gray-medium">Activés</p>
            <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-green-valid mt-0.5">
              {stats.actives}
            </p>
          </div>
          <div className="p-3 sm:p-4">
            <p className="text-xs text-enp-gray-medium">À activer</p>
            <p
              className={`text-xl sm:text-2xl font-bold font-mono tabular-nums mt-0.5 ${
                stats.aActiver > 0 ? "text-amber-700" : "text-enp-black"
              }`}
            >
              {stats.aActiver}
            </p>
          </div>
        </div>
      )}

      {/* BARRE DE FILTRES & RECHERCHE */}
      <div className="bg-white border border-enp-border p-3 sm:p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 md:pb-0 -mx-1 px-1">
            {(
              [
                { id: "tous", label: `Tous (${stats.total})` },
                { id: "a_activer", label: `À activer (${stats.aActiver})` },
                { id: "actives", label: `Activés (${stats.actives})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltreStatut(tab.id)}
                className={`px-3 py-2 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 min-h-[38px] tabular-nums ${
                  filtreStatut === tab.id
                    ? "bg-enp-blue-deep text-white border-enp-blue-deep"
                    : "bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <select
              aria-label="Filtrer par rôle"
              value={filtreRole}
              onChange={(e) => setFiltreRole(e.target.value)}
              className="border border-enp-border bg-white px-3 py-2 text-xs font-medium text-enp-black focus:border-enp-blue-primary outline-none min-h-[40px]"
            >
              <option value="tous">Tous les rôles</option>
              {Object.entries(LIBELLES_ROLES).map(([cle, libelle]) => (
                <option key={cle} value={cle}>
                  {libelle}
                </option>
              ))}
            </select>

            <label className="relative block w-full sm:w-60">
              <span className="sr-only">Rechercher un compte</span>
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-enp-gray-medium"
                aria-hidden="true"
              />
              <input
                value={recherche}
                onChange={(event) => setRecherche(event.target.value)}
                placeholder="Matricule, nom, e-mail…"
                className="w-full border border-enp-border bg-white py-2 pl-9 pr-3 text-xs sm:text-sm text-enp-black outline-none focus:border-enp-blue-primary min-h-[40px]"
              />
            </label>
          </div>
        </div>
      </div>

      {chargement ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Chargement des comptes…
        </div>
      ) : comptesFiltres.length === 0 ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Aucun compte ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <div className="bg-white border border-enp-border overflow-hidden">
          {/* VUE MOBILE NATIVE */}
          <div className="block md:hidden divide-y divide-enp-border">
            {comptesFiltres.map((compte) => (
              <div key={compte.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-enp-black truncate">
                      {compte.prenom} {compte.nom}
                    </p>
                    <p className="text-xs text-enp-gray-medium flex flex-wrap items-center gap-x-1.5 mt-0.5">
                      <span className="font-mono font-semibold text-enp-blue-deep">
                        {compte.matricule ?? "-"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{libelleRoles(compte.roles)}</span>
                    </p>
                    {compte.email && (
                      <p className="text-xs text-enp-gray-medium truncate mt-0.5">
                        {compte.email}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={compte.motDePasseConfigure ? "success" : "warning"}
                    className="shrink-0"
                  >
                    {compte.motDePasseConfigure ? "Activé" : "À activer"}
                  </Badge>
                </div>

                {!compte.dansPerimetre && (
                  <p className="text-xs text-enp-gray-medium">
                    Hors campus (lecture seule)
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  {!compte.motDePasseConfigure && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 min-h-[40px]"
                      onClick={() => void envoyerActivation(compte)}
                      disabled={
                        envoiActivation !== null ||
                        !compte.email ||
                        !compte.dansPerimetre
                      }
                      isLoading={envoiActivation === compte.id}
                      leftIcon={<Mail className="w-3.5 h-3.5" />}
                    >
                      Envoyer le code
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`min-h-[40px] text-enp-red-error hover:bg-red-50 ${compte.motDePasseConfigure ? "ml-auto" : ""}`}
                    disabled={suppression !== null || !compte.peutSupprimer}
                    isLoading={suppression === compte.id}
                    leftIcon={<Trash2 className="w-3.5 h-3.5 text-enp-red-error" />}
                    aria-label={`Supprimer le compte ${compte.prenom} ${compte.nom}`}
                    onClick={() => void supprimerCompte(compte)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* VUE BUREAU */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-enp-bg border-b border-enp-border text-enp-gray-dark text-xs">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Identifiant
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Nom complet
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    E-mail
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Rôles
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-center">
                    Statut
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-enp-border">
                {comptesFiltres.map((compte) => (
                  <tr
                    key={compte.id}
                    className="hover:bg-enp-blue-ice/20 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-enp-blue-deep">
                      {compte.matricule ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-enp-black">
                      {compte.prenom} {compte.nom}
                    </td>
                    <td className="px-4 py-3 text-xs text-enp-gray-medium">
                      {compte.email ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-enp-gray-dark">
                      {libelleRoles(compte.roles)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      {compte.motDePasseConfigure ? (
                        <Badge variant="success">Activé</Badge>
                      ) : (
                        <Badge variant="warning">À activer</Badge>
                      )}
                      {!compte.dansPerimetre && (
                        <span className="mt-1 block text-xs text-enp-gray-medium">
                          Hors campus (lecture seule)
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!compte.motDePasseConfigure ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void envoyerActivation(compte)}
                            disabled={
                              envoiActivation !== null ||
                              !compte.email ||
                              !compte.dansPerimetre
                            }
                            isLoading={envoiActivation === compte.id}
                            leftIcon={<Mail className="w-3.5 h-3.5" />}
                            title={
                              !compte.dansPerimetre
                                ? "Action limitée au campus de votre compte"
                                : !compte.email
                                  ? "Aucune adresse e-mail enregistrée"
                                  : undefined
                            }
                          >
                            Envoyer le code
                          </Button>
                        ) : (
                          <span className="text-xs text-enp-gray-medium">
                            Opérationnel
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-enp-red-error hover:bg-red-50"
                          disabled={
                            suppression !== null || !compte.peutSupprimer
                          }
                          isLoading={suppression === compte.id}
                          leftIcon={<Trash2 className="w-3.5 h-3.5 text-enp-red-error" />}
                          aria-label={`Supprimer le compte ${compte.prenom} ${compte.nom}`}
                          onClick={() => void supprimerCompte(compte)}
                          title={
                            !compte.peutSupprimer
                              ? "Suppression non autorisée pour ce compte"
                              : undefined
                          }
                        >
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
