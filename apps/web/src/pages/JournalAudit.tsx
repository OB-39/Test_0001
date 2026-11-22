import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, ApiError } from "@/api";
import type { LigneAudit } from "@/api/types";
import { PageHeader, Alert, Button } from "@/components/ui";

export function JournalAudit() {
  const [lignes, setLignes] = useState<LigneAudit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setLignes(await api.journalAudit());
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.messages.join(" ")
          : "Consultation du journal impossible.",
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  function libelleUtilisateur(ligne: LigneAudit): string {
    return (
      ligne.userMatricule ??
      (ligne.userId === undefined ? "Système" : "Matricule indisponible")
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 max-w-6xl mx-auto animate-fade-in pb-6">
      <PageHeader
        title="Journal d’audit"
        description="200 derniers événements. Les bulletins, votes et adresses IP ne sont pas consignés."
        breadcrumbs={[
          { label: "Accueil", href: "/" },
          { label: "Journal d’audit" },
        ]}
        actions={
          <Button
            type="button"
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
        }
      />

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {chargement ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Chargement du journal…
        </div>
      ) : lignes.length === 0 ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Aucun événement d’audit.
        </div>
      ) : (
        <div className="bg-white border border-enp-border overflow-hidden">
          {/* VUE MOBILE NATIVE */}
          <div className="block md:hidden divide-y divide-enp-border">
            {lignes.map((ligne) => (
              <div key={ligne.id} className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-enp-black">
                    {ligne.action}
                  </p>
                  <span className="font-mono text-[11px] tabular-nums text-enp-gray-medium shrink-0">
                    {new Date(ligne.creeLe).toLocaleString("fr-FR")}
                  </span>
                </div>
                <p className="text-xs text-enp-gray-medium flex flex-wrap items-center gap-x-1.5">
                  <span className="font-mono font-medium text-enp-blue-deep">
                    {libelleUtilisateur(ligne)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{ligne.objet ?? ligne.courseId ?? "-"}</span>
                </p>
                {ligne.detail && (
                  <p className="text-xs text-enp-gray-dark leading-relaxed">
                    {ligne.detail}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* VUE BUREAU */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-enp-bg border-b border-enp-border text-enp-gray-dark text-xs">
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Utilisateur</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Objet</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-enp-border">
                {lignes.map((ligne) => (
                  <tr key={ligne.id} className="hover:bg-enp-blue-ice/20 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-enp-gray-medium">
                      {new Date(ligne.creeLe).toLocaleString("fr-FR")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-enp-blue-deep">
                      {libelleUtilisateur(ligne)}
                    </td>
                    <td className="px-4 py-3 font-medium text-enp-black">
                      {ligne.action}
                    </td>
                    <td className="px-4 py-3 text-xs text-enp-gray-dark">
                      {ligne.objet ?? ligne.courseId ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-enp-gray-medium">
                      {ligne.detail ?? "-"}
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
