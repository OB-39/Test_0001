import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/api";
import type {
  DepartementOption,
  ProgrammeScolarite,
  UniteEnseignementScolarite,
} from "@/api/types";
import { useConfirmation } from "@/components/useConfirmation";
import { Alert, Button, Modal, PageHeader } from "@/components/ui";

type ProgrammeFormulaire = {
  id?: number;
  nom: string;
  departmentId: number;
};

type UeFormulaire = {
  id?: number;
  code: string;
  intitule: string;
  credits: number;
  composantesIds: number[];
  compositeParentId: number | null;
};

function messageErreur(erreur: unknown): string {
  return erreur instanceof ApiError
    ? erreur.messages.join(" ")
    : "Une erreur réseau est survenue.";
}

function soumettreFormulaire(id: string) {
  const formulaire = document.getElementById(id);
  if (formulaire instanceof HTMLFormElement) formulaire.requestSubmit();
}

export function ScolariteProgrammes() {
  const { confirmer } = useConfirmation();
  const [departements, setDepartements] = useState<DepartementOption[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeScolarite[]>([]);
  const [ues, setUes] = useState<UniteEnseignementScolarite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [programmeFormulaire, setProgrammeFormulaire] =
    useState<ProgrammeFormulaire | null>(null);
  const [ueFormulaire, setUeFormulaire] = useState<UeFormulaire | null>(null);

  const groupesUes = useMemo(() => {
    const groupes = programmes
      .map((programme) => {
        const uesProgramme = ues.filter((ue) =>
          ue.programmes.some((offre) => offre.id === programme.id),
        );
        const idsUesProgramme = new Set(uesProgramme.map((ue) => ue.id));
        const racines = ues.filter(
          (ue) =>
            ue.compositeParentId === null &&
            (idsUesProgramme.has(ue.id) ||
              ue.composantes.some((composante) =>
                idsUesProgramme.has(composante.id),
              )),
        );
        return { programme, ues: racines };
      })
      .filter((groupe) => groupe.ues.length > 0);
    const idsClasses = new Set(
      groupes.flatMap((groupe) =>
        groupe.ues.flatMap((ue) => [
          ue.id,
          ...ue.composantes.map((composante) => composante.id),
        ]),
      ),
    );
    const uesNonClassees = ues.filter(
      (ue) => ue.compositeParentId === null && !idsClasses.has(ue.id),
    );
    return { groupes, uesNonClassees };
  }, [programmes, ues]);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const [listeDepartements, listeProgrammes, listeUes] = await Promise.all([
        api.scolariteDepartements(),
        api.scolariteProgrammes(),
        api.scolariteUnitesEnseignement(),
      ]);
      setDepartements(listeDepartements);
      setProgrammes(listeProgrammes);
      setUes(listeUes);
    } catch (cause) {
      setErreur(messageErreur(cause));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  function ouvrirCreationProgramme() {
    setProgrammeFormulaire({
      nom: "",
      departmentId: departements[0]?.id ?? 0,
    });
  }

  function ouvrirEditionProgramme(programme: ProgrammeScolarite) {
    setProgrammeFormulaire({
      id: programme.id,
      nom: programme.nom,
      departmentId: programme.departmentId,
    });
  }

  async function enregistrerProgramme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programmeFormulaire) return;
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      if (programmeFormulaire.id !== undefined) {
        const confirme = await confirmer({
          title: "Confirmer la modification du programme",
          message: (
            <p>
              La modification de ce programme changera son libellé ou son
              département dans le référentiel utilisé pour organiser les cours.
              Vérifiez les informations avant de continuer.
            </p>
          ),
          variant: "warning",
        });
        if (!confirme) return;
        const modifie = await api.scolariteModifierProgramme(
          programmeFormulaire.id,
          {
            nom: programmeFormulaire.nom.trim(),
            departmentId: programmeFormulaire.departmentId,
          },
        );
        setProgrammes((actuels) =>
          actuels.map((programme) =>
            programme.id === modifie.id ? modifie : programme,
          ),
        );
        setSucces("Le programme a été modifié.");
      } else {
        const cree = await api.scolariteCreerProgramme(
          programmeFormulaire.departmentId,
          programmeFormulaire.nom.trim(),
        );
        setProgrammes((actuels) => [...actuels, cree]);
        setSucces("Le programme a été ajouté.");
      }
      setProgrammeFormulaire(null);
    } catch (cause) {
      setErreur(messageErreur(cause));
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerProgramme(programme: ProgrammeScolarite) {
    const confirme = await confirmer({
      title: "Supprimer ce programme ?",
      message: (
        <p>
          Le programme « {programme.nom} » sera retiré du référentiel de{" "}
          {programme.departement}. Il ne pourra plus être utilisé pour de
          nouveaux cours. La suppression sera refusée s’il est déjà référencé
          par des cours ou des mandats.
        </p>
      ),
      confirmLabel: "Supprimer le programme",
      variant: "danger",
    });
    if (!confirme) return;
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      await api.scolariteSupprimerProgramme(programme.id);
      setProgrammes((actuels) =>
        actuels.filter((ligne) => ligne.id !== programme.id),
      );
      setSucces("Le programme a été supprimé.");
    } catch (cause) {
      setErreur(messageErreur(cause));
    } finally {
      setEnCours(false);
    }
  }

  function ouvrirCreationUe() {
    setUeFormulaire({
      code: "",
      intitule: "",
      credits: 1,
      composantesIds: [],
      compositeParentId: null,
    });
  }

  function ouvrirEditionUe(ue: UniteEnseignementScolarite) {
    setUeFormulaire({
      id: ue.id,
      code: ue.code,
      intitule: ue.intitule,
      credits: ue.credits,
      composantesIds: ue.composantes.map((composante) => composante.id),
      compositeParentId: ue.compositeParentId,
    });
  }

  async function enregistrerUe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ueFormulaire) return;
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      if (ueFormulaire.id !== undefined) {
        const confirme = await confirmer({
          title: "Confirmer la modification de l’UE",
          message: (
            <p>
              Cette UE appartient au catalogue global. Sa modification changera
              son code, son intitulé ou ses crédits dans les cours qui la
              référencent sur votre campus. Les cours d’autres campus sont
              protégés par le serveur.
            </p>
          ),
          variant: "warning",
        });
        if (!confirme) return;
        const modifiee = await api.scolariteModifierUniteEnseignement(
          ueFormulaire.id,
          {
            code: ueFormulaire.code.trim(),
            intitule: ueFormulaire.intitule.trim(),
            credits: ueFormulaire.credits,
            ...(ueFormulaire.compositeParentId === null
              ? { composantesIds: ueFormulaire.composantesIds }
              : {}),
          },
        );
        setUes((actuelles) =>
          actuelles.map((ue) => (ue.id === modifiee.id ? modifiee : ue)),
        );
        setSucces("L’UE a été modifiée.");
      } else {
        const creee = await api.scolariteCreerUniteEnseignement({
          code: ueFormulaire.code.trim(),
          intitule: ueFormulaire.intitule.trim(),
          credits: ueFormulaire.credits,
          composantesIds: ueFormulaire.composantesIds,
        });
        setUes((actuelles) => [...actuelles, creee]);
        setSucces("L’UE a été ajoutée au catalogue.");
      }
      setUeFormulaire(null);
      await charger();
    } catch (cause) {
      setErreur(messageErreur(cause));
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerUe(ue: UniteEnseignementScolarite) {
    const confirme = await confirmer({
      title: "Supprimer cette UE ?",
      message: (
        <p>
          L’UE « {ue.code} — {ue.intitule} » sera retirée du catalogue. La
          suppression est irréversible et sera refusée si un cours la référence.
          {ue.composantes.length > 0 &&
            " Les liens de regroupement avec ses composantes seront également retirés."}
        </p>
      ),
      confirmLabel: "Supprimer l’UE",
      variant: "danger",
    });
    if (!confirme) return;
    setEnCours(true);
    setErreur(null);
    setSucces(null);
    try {
      await api.scolariteSupprimerUniteEnseignement(ue.id);
      setUes((actuelles) => actuelles.filter((ligne) => ligne.id !== ue.id));
      setSucces("L’UE a été supprimée du catalogue.");
    } catch (cause) {
      setErreur(messageErreur(cause));
    } finally {
      setEnCours(false);
    }
  }

  function tableauUes(liste: UniteEnseignementScolarite[]) {
    const lignes = liste.flatMap((ue) => [
      { ue, estComposante: false },
      ...ue.composantes.flatMap((composante) => {
        const uniteComplete = ues.find(
          (candidate) => candidate.id === composante.id,
        );
        return uniteComplete ? [{ ue: uniteComplete, estComposante: true }] : [];
      }),
    ]);

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-enp-border text-xs uppercase text-enp-gray-medium">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Intitulé</th>
              <th className="px-3 py-2">Crédits</th>
              <th className="px-3 py-2">Périmètre</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-enp-border">
            {lignes.map(({ ue, estComposante }) => (
              <tr
                key={`${ue.id}-${estComposante ? "composante" : "ue"}`}
                className={estComposante ? "bg-slate-50" : undefined}
              >
                <td
                  className={`px-3 py-3 font-mono font-medium ${
                    estComposante ? "pl-8" : ""
                  }`}
                >
                  {estComposante ? "↳ " : ""}
                  {ue.code}
                  {ue.composantes.length > 0 && (
                    <span className="ml-2 font-sans text-xs text-enp-blue-primary">
                      UE composite — regroupement, non comptée séparément
                    </span>
                  )}
                  {estComposante && (
                    <span className="ml-2 font-sans text-xs text-enp-gray-medium">
                      composante
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">{ue.intitule}</td>
                <td className="px-3 py-3">
                  {ue.composantes.length > 0 ? "—" : ue.credits}
                </td>
                <td className="px-3 py-3">
                  {ue.modifiable
                    ? "Modifiable"
                    : "Utilisée sur un autre campus"}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={enCours || !ue.modifiable}
                      onClick={() => ouvrirEditionUe(ue)}
                      leftIcon={<Pencil className="h-3.5 w-3.5" />}
                    >
                      Modifier
                    </Button>
                    <Button
                      variant="danger"
                      size="xs"
                      disabled={enCours}
                      onClick={() => void supprimerUe(ue)}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" />}
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
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      <PageHeader
        title="Gestion des programmes et des UE"
        description="Gérez les programmes de votre campus et le catalogue des unités d’enseignement."
        breadcrumbs={[
          { label: "Accueil", href: "/" },
          { label: "Gestion Scolarité" },
          { label: "Programmes et UE" },
        ]}
      />

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}
      {succes && (
        <Alert
          variant="success"
          title="Opération effectuée"
          onClose={() => setSucces(null)}
        >
          {succes}
        </Alert>
      )}

      {chargement ? (
        <div className="border border-enp-border bg-white p-8 text-center text-sm text-enp-gray-medium">
          Chargement des référentiels…
        </div>
      ) : (
        <>
          <section className="space-y-3 border border-enp-border bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-enp-black">
                  <BookOpen className="h-5 w-5 text-enp-blue-primary" />
                  Programmes
                </h2>
                <p className="mt-1 text-sm text-enp-gray-medium">
                  Les programmes affichés sont limités aux départements de votre
                  campus.
                </p>
              </div>
              <Button
                size="sm"
                onClick={ouvrirCreationProgramme}
                disabled={departements.length === 0 || enCours}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Ajouter un programme
              </Button>
            </div>
            {programmes.length === 0 ? (
              <p className="border border-dashed border-enp-border p-6 text-center text-sm text-enp-gray-medium">
                Aucun programme n’est encore enregistré.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-enp-border text-xs uppercase text-enp-gray-medium">
                    <tr>
                      <th className="px-3 py-2">Programme</th>
                      <th className="px-3 py-2">Département</th>
                      <th className="px-3 py-2">Campus</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-enp-border">
                    {programmes.map((programme) => (
                      <tr key={programme.id}>
                        <td className="px-3 py-3 font-medium">
                          {programme.nom}
                        </td>
                        <td className="px-3 py-3">{programme.departement}</td>
                        <td className="px-3 py-3">{programme.campus}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={enCours}
                              onClick={() => ouvrirEditionProgramme(programme)}
                              leftIcon={<Pencil className="h-3.5 w-3.5" />}
                            >
                              Modifier
                            </Button>
                            <Button
                              variant="danger"
                              size="xs"
                              disabled={enCours}
                              onClick={() => void supprimerProgramme(programme)}
                              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
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
            )}
          </section>

          <section className="space-y-3 border border-enp-border bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-enp-black">
                  <BookOpen className="h-5 w-5 text-enp-blue-primary" />
                  Unités d’enseignement
                </h2>
                <p className="mt-1 text-sm text-enp-gray-medium">
                  Le catalogue des UE est partagé. Les modifications d’UE
                  utilisées sur un autre campus sont bloquées.
                </p>
              </div>
              <Button
                size="sm"
                onClick={ouvrirCreationUe}
                disabled={enCours}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Ajouter une UE
              </Button>
            </div>
            {ues.length === 0 ? (
              <p className="border border-dashed border-enp-border p-6 text-center text-sm text-enp-gray-medium">
                Aucune UE n’est encore enregistrée.
              </p>
            ) : (
              <div className="space-y-4">
                {groupesUes.groupes.map(({ programme, ues: uesProgramme }) => (
                  <section
                    key={programme.id}
                    className="space-y-2 border border-enp-border p-3"
                  >
                    <h3 className="font-semibold text-enp-blue-deep">
                      {programme.nom} — {programme.departement}
                    </h3>
                    {tableauUes(uesProgramme)}
                  </section>
                ))}
                {groupesUes.uesNonClassees.length > 0 && (
                  <section className="space-y-2 border border-dashed border-enp-border p-3">
                    <h3 className="font-semibold text-enp-gray-medium">
                      UE non affectées à un programme
                    </h3>
                    {tableauUes(groupesUes.uesNonClassees)}
                  </section>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <Modal
        isOpen={programmeFormulaire !== null}
        onClose={() => setProgrammeFormulaire(null)}
        title={
          programmeFormulaire?.id
            ? "Modifier le programme"
            : "Ajouter un programme"
        }
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProgrammeFormulaire(null)}
              disabled={enCours}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              isLoading={enCours}
              onClick={() => soumettreFormulaire("form-programme-scolarite")}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        {programmeFormulaire && (
          <form
            id="form-programme-scolarite"
            className="space-y-4"
            onSubmit={(event) => void enregistrerProgramme(event)}
          >
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Département</span>
              <select
                required
                value={programmeFormulaire.departmentId}
                onChange={(event) =>
                  setProgrammeFormulaire({
                    ...programmeFormulaire,
                    departmentId: Number(event.target.value),
                  })
                }
                className="w-full border border-enp-border bg-white px-3 py-2"
              >
                {departements.map((departement) => (
                  <option key={departement.id} value={departement.id}>
                    {departement.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Nom du programme</span>
              <input
                required
                maxLength={120}
                value={programmeFormulaire.nom}
                onChange={(event) =>
                  setProgrammeFormulaire({
                    ...programmeFormulaire,
                    nom: event.target.value,
                  })
                }
                className="w-full border border-enp-border px-3 py-2"
              />
            </label>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={ueFormulaire !== null}
        onClose={() => setUeFormulaire(null)}
        title={ueFormulaire?.id ? "Modifier l’UE" : "Ajouter une UE"}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUeFormulaire(null)}
              disabled={enCours}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              isLoading={enCours}
              onClick={() => soumettreFormulaire("form-ue-scolarite")}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        {ueFormulaire && (
          <form
            id="form-ue-scolarite"
            className="space-y-4"
            onSubmit={(event) => void enregistrerUe(event)}
          >
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Code de l’UE</span>
              <input
                required
                maxLength={40}
                value={ueFormulaire.code}
                onChange={(event) =>
                  setUeFormulaire({ ...ueFormulaire, code: event.target.value })
                }
                className="w-full border border-enp-border px-3 py-2"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Intitulé</span>
              <input
                required
                maxLength={200}
                value={ueFormulaire.intitule}
                onChange={(event) =>
                  setUeFormulaire({
                    ...ueFormulaire,
                    intitule: event.target.value,
                  })
                }
                className="w-full border border-enp-border px-3 py-2"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Crédits</span>
              <input
                required
                type="number"
                min={1}
                max={100}
                step={1}
                value={ueFormulaire.credits}
                onChange={(event) =>
                  setUeFormulaire({
                    ...ueFormulaire,
                    credits: Number(event.target.value),
                  })
                }
                className="w-full border border-enp-border px-3 py-2"
              />
            </label>
            {ueFormulaire.compositeParentId === null ? (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">UE composantes (facultatif)</span>
                <select
                  multiple
                  value={ueFormulaire.composantesIds.map(String)}
                  onChange={(event) =>
                    setUeFormulaire({
                      ...ueFormulaire,
                      composantesIds: Array.from(
                        event.currentTarget.selectedOptions,
                        (option) => Number(option.value),
                      ),
                    })
                  }
                  className="min-h-28 w-full border border-enp-border bg-white px-3 py-2"
                >
                  {ues
                    .filter(
                      (ue) =>
                        ue.id !== ueFormulaire.id &&
                        ue.composantes.length === 0 &&
                        (ue.compositeParentId === null ||
                          ue.compositeParentId === ueFormulaire.id),
                    )
                    .map((ue) => (
                      <option key={ue.id} value={ue.id}>
                        {ue.code} — {ue.intitule}
                      </option>
                    ))}
                </select>
                <span className="block text-xs text-enp-gray-medium">
                  Une UE composite est un regroupement : seules ses composantes
                  sont comptées comme UE enseignées.
                </span>
              </label>
            ) : (
              <p className="text-xs text-enp-gray-medium">
                Cette UE est une composante d’un regroupement composite. Pour
                modifier ses composantes, éditez l’UE composite parente.
              </p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
