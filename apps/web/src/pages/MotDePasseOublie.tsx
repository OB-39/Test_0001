import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole } from "lucide-react";
import { api, ApiError } from "@/api";
import { MockBanner } from "@/components/MockBanner";
import { Alert, Button, Input } from "@/components/ui";

type Etape = "identifiant" | "code" | "termine";

const LONGUEUR_MIN = 12;

function messagesErreur(erreur: unknown): string[] {
  if (erreur instanceof ApiError) return erreur.messages;
  if (erreur instanceof TypeError)
    return ["Erreur réseau : impossible de joindre le serveur."];
  return ["Une erreur inattendue est survenue. Réessayez plus tard."];
}

export function MotDePasseOublie() {
  const [etape, setEtape] = useState<Etape>("identifiant");
  const [identifiant, setIdentifiant] = useState("");
  const [code, setCode] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const isMock = import.meta.env.VITE_USE_MOCK === "true";

  function modifier(
    champ: "identifiant" | "code" | "motDePasse" | "confirmation",
    valeur: string,
  ) {
    setErreurs([]);
    if (champ === "identifiant") setIdentifiant(valeur);
    if (champ === "code") setCode(valeur);
    if (champ === "motDePasse") setMotDePasse(valeur);
    if (champ === "confirmation") setConfirmation(valeur);
  }

  async function demanderCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valeur = identifiant.trim();
    if (!valeur || valeur.length > 255) {
      setErreurs(["Saisissez un matricule ou une adresse e-mail valide."]);
      return;
    }

    setEnCours(true);
    setErreurs([]);
    try {
      await api.demanderReinitialisation(valeur);
      setIdentifiant(valeur);
      setEtape("code");
    } catch (erreur) {
      setErreurs(messagesErreur(erreur));
    } finally {
      setEnCours(false);
    }
  }

  async function confirmerReinitialisation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nouvellesErreurs: string[] = [];
    if (!/^\d{6}$/.test(code.trim()))
      nouvellesErreurs.push("Le code doit contenir 6 chiffres.");
    if (motDePasse.length < LONGUEUR_MIN || motDePasse.length > 200)
      nouvellesErreurs.push(
        `Le mot de passe doit contenir entre ${LONGUEUR_MIN} et 200 caractères.`,
      );
    if (confirmation !== motDePasse)
      nouvellesErreurs.push(
        "La confirmation ne correspond pas au mot de passe.",
      );
    if (nouvellesErreurs.length > 0) {
      setErreurs(nouvellesErreurs);
      return;
    }

    setEnCours(true);
    setErreurs([]);
    try {
      await api.confirmerReinitialisation({
        identifiant,
        code: code.trim(),
        motDePasse,
      });
      setEtape("termine");
    } catch (erreur) {
      setErreurs(messagesErreur(erreur));
    } finally {
      setEnCours(false);
    }
  }

  function modifierIdentifiant() {
    setEtape("identifiant");
    setCode("");
    setMotDePasse("");
    setConfirmation("");
    setErreurs([]);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <MockBanner />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-enp-blue-ice text-enp-blue-primary mb-3">
              {etape === "termine" ? (
                <CheckCircle2 size={28} aria-hidden="true" />
              ) : (
                <KeyRound size={28} aria-hidden="true" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-enp-ink tracking-tight">
              {etape === "termine"
                ? "Mot de passe réinitialisé"
                : "Mot de passe oublié"}
            </h1>
            <p className="text-sm text-enp-ink-soft mt-1.5">
              École Nationale Polytechnique
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-enp-border p-6 sm:p-8">
            {erreurs.length > 0 && (
              <Alert
                variant="danger"
                title="Impossible de continuer"
                className="mb-4"
              >
                <ul className="list-disc list-inside space-y-0.5">
                  {erreurs.map((erreur) => (
                    <li key={erreur}>{erreur}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {etape === "identifiant" && (
              <>
                <p className="text-sm text-enp-ink-soft mb-5">
                  Saisissez votre matricule ou l’adresse e-mail associée à votre
                  compte. Si un compte correspondant existe, un code temporaire
                  sera envoyé à son adresse enregistrée.
                </p>
                <form onSubmit={demanderCode} className="space-y-4" noValidate>
                  <Input
                    label="Matricule ou adresse e-mail"
                    type="text"
                    autoComplete="username"
                    maxLength={255}
                    required
                    value={identifiant}
                    onChange={(event) =>
                      modifier("identifiant", event.target.value)
                    }
                    disabled={enCours}
                    startIcon={<LockKeyhole className="w-4 h-4" />}
                  />
                  <Button type="submit" className="w-full" isLoading={enCours}>
                    Envoyer le code
                  </Button>
                </form>
              </>
            )}

            {etape === "code" && (
              <>
                <Alert
                  variant="info"
                  title="Vérifiez votre messagerie"
                  className="mb-4"
                >
                  Si un compte actif est associé à cet identifiant, un code de
                  réinitialisation a été envoyé à son adresse e-mail. Il expire
                  dans 30 minutes. Vérifiez aussi vos courriers indésirables.
                </Alert>
                {isMock && (
                  <Alert variant="warning" className="mb-4">
                    Mode démonstration : utilisez le code 123456.
                  </Alert>
                )}
                <form
                  onSubmit={confirmerReinitialisation}
                  className="space-y-4"
                  noValidate
                >
                  <Input
                    label="Code reçu"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(event) => modifier("code", event.target.value)}
                    disabled={enCours}
                    startIcon={<KeyRound className="w-4 h-4" />}
                  />
                  <Input
                    label="Nouveau mot de passe"
                    type={afficherMdp ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={LONGUEUR_MIN}
                    maxLength={200}
                    required
                    value={motDePasse}
                    onChange={(event) =>
                      modifier("motDePasse", event.target.value)
                    }
                    disabled={enCours}
                    helperText={`Entre ${LONGUEUR_MIN} et 200 caractères.`}
                    endIcon={
                      <button
                        type="button"
                        onClick={() => setAfficherMdp((visible) => !visible)}
                        aria-label={
                          afficherMdp
                            ? "Masquer le mot de passe"
                            : "Afficher le mot de passe"
                        }
                        aria-pressed={afficherMdp}
                        className="p-1 hover:text-enp-black"
                      >
                        {afficherMdp ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    }
                  />
                  <Input
                    label="Confirmer le nouveau mot de passe"
                    type={afficherMdp ? "text" : "password"}
                    autoComplete="new-password"
                    maxLength={200}
                    required
                    value={confirmation}
                    onChange={(event) =>
                      modifier("confirmation", event.target.value)
                    }
                    disabled={enCours}
                  />
                  <Button type="submit" className="w-full" isLoading={enCours}>
                    Réinitialiser le mot de passe
                  </Button>
                </form>
                <button
                  type="button"
                  className="mt-4 w-full text-center text-sm text-enp-blue-primary hover:underline"
                  onClick={modifierIdentifiant}
                  disabled={enCours}
                >
                  Modifier l’identifiant
                </button>
              </>
            )}

            {etape === "termine" && (
              <div className="text-center">
                <p className="text-sm text-enp-ink-soft mb-6">
                  Votre mot de passe a été modifié. Les sessions de
                  renouvellement et les appareils de confiance existants ont été
                  révoqués. Connectez-vous avec votre nouveau mot de passe.
                </p>
                <Link
                  to="/connexion"
                  className="inline-flex min-h-[40px] w-full items-center justify-center bg-enp-blue-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-enp-blue-dark"
                >
                  Retour à la connexion
                </Link>
              </div>
            )}

            {etape !== "termine" && (
              <div className="mt-5 text-center">
                <Link
                  to="/connexion"
                  className="text-sm text-enp-blue-primary hover:underline"
                >
                  Retour à la connexion
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
