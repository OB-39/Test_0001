import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { RequireRole } from "@/auth/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { ConfirmationProvider } from "@/components/ConfirmationProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Decoupage du bundle par module / role (chargement paresseux)
const Connexion = lazy(() =>
  import("@/pages/Connexion").then((m) => ({ default: m.Connexion })),
);
const Activation = lazy(() =>
  import("@/pages/Activation").then((m) => ({ default: m.Activation })),
);
const MotDePasseOublie = lazy(() =>
  import("@/pages/MotDePasseOublie").then((m) => ({ default: m.MotDePasseOublie })),
);
const Accueil = lazy(() =>
  import("@/pages/Accueil").then((m) => ({ default: m.Accueil })),
);
const Administration = lazy(() =>
  import("@/pages/Administration").then((m) => ({ default: m.Administration })),
);
const DirectionStatistiques = lazy(() =>
  import("@/pages/DirectionStatistiques").then((m) => ({
    default: m.DirectionStatistiques,
  })),
);
const AccesRefuse = lazy(() =>
  import("@/pages/AccesRefuse").then((m) => ({ default: m.AccesRefuse })),
);
const PageIntrouvable = lazy(() =>
  import("@/pages/PageIntrouvable").then((m) => ({ default: m.PageIntrouvable })),
);
const ListeEvaluations = lazy(() =>
  import("@/pages/ListeEvaluations").then((m) => ({
    default: m.ListeEvaluations,
  })),
);
const EvaluationUE = lazy(() =>
  import("@/pages/EvaluationUE").then((m) => ({ default: m.EvaluationUE })),
);
const MesResultats = lazy(() =>
  import("@/pages/MesResultats").then((m) => ({ default: m.MesResultats })),
);
const FicheResultatUE = lazy(() =>
  import("@/pages/FicheResultatUE").then((m) => ({
    default: m.FicheResultatUE,
  })),
);
const CahierTexte = lazy(() =>
  import("@/pages/CahierTexte").then((m) => ({ default: m.CahierTexte })),
);
const FormSeance = lazy(() =>
  import("@/pages/FormSeance").then((m) => ({ default: m.FormSeance })),
);
const DetailSeance = lazy(() =>
  import("@/pages/DetailSeance").then((m) => ({ default: m.DetailSeance })),
);
const Visas = lazy(() =>
  import("@/pages/Visas").then((m) => ({ default: m.Visas })),
);
const Participation = lazy(() =>
  import("@/pages/Participation").then((m) => ({ default: m.Participation })),
);
const SynthesePage = lazy(() =>
  import("@/pages/SynthesePage").then((m) => ({ default: m.SynthesePage })),
);
const ScolariteTableauDeBord = lazy(() =>
  import("@/pages/ScolariteTableauDeBord").then((m) => ({
    default: m.TableauDeBordScolaritePage,
  })),
);
const ScolariteCampagnes = lazy(() =>
  import("@/pages/ScolariteCampagnes").then((m) => ({
    default: m.ScolariteCampagnes,
  })),
);
const ScolariteComptes = lazy(() =>
  import("@/pages/ScolariteComptes").then((m) => ({
    default: m.ScolariteComptes,
  })),
);
const ScolariteImports = lazy(() =>
  import("@/pages/ScolariteImports").then((m) => ({
    default: m.ScolariteImports,
  })),
);
const ScolariteModeration = lazy(() =>
  import("@/pages/ScolariteModeration").then((m) => ({
    default: m.ScolariteModeration,
  })),
);
const ScolariteProgrammes = lazy(() =>
  import("@/pages/ScolariteProgrammes").then((m) => ({
    default: m.ScolariteProgrammes,
  })),
);
const ScolariteRestitution = lazy(() =>
  import("@/pages/ScolariteRestitution").then((m) => ({
    default: m.ScolariteRestitution,
  })),
);
const RestitutionEtudiant = lazy(() =>
  import("@/pages/RestitutionEtudiant").then((m) => ({
    default: m.RestitutionEtudiant,
  })),
);
const EnseignantNotes = lazy(() =>
  import("@/pages/EnseignantNotes").then((m) => ({
    default: m.EnseignantNotes,
  })),
);
const EnseignantPresences = lazy(() =>
  import("@/pages/EnseignantPresences").then((m) => ({
    default: m.EnseignantPresences,
  })),
);
const ProjectionPresence = lazy(() =>
  import("@/pages/ProjectionPresence").then((m) => ({
    default: m.ProjectionPresence,
  })),
);
const EtudiantNotes = lazy(() =>
  import("@/pages/EtudiantNotes").then((m) => ({ default: m.EtudiantNotes })),
);
const EtudiantPresences = lazy(() =>
  import("@/pages/EtudiantPresences").then((m) => ({
    default: m.EtudiantPresences,
  })),
);
const SecuriteCompte = lazy(() =>
  import("@/pages/SecuriteCompte").then((m) => ({ default: m.SecuriteCompte })),
);
const ArchivesAnnuelles = lazy(() =>
  import("@/pages/ArchivesAnnuelles").then((m) => ({
    default: m.ArchivesAnnuelles,
  })),
);
const Notifications = lazy(() =>
  import("@/pages/Notifications").then((m) => ({ default: m.Notifications })),
);
const JournalAudit = lazy(() =>
  import("@/pages/JournalAudit").then((m) => ({ default: m.JournalAudit })),
);
const APropos = lazy(() =>
  import("@/pages/APropos").then((m) => ({ default: m.APropos })),
);

function ChargementModuleEnp() {
  return (
    <div
      className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 border-2 border-[#0B2545]/20 border-t-[#0B2545] animate-spin" />
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Chargement du module ENP...
      </p>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ConfirmationProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Suspense fallback={<ChargementModuleEnp />}>
              <Routes>
                {/* Routes publiques et pages institutionnelles */}
                <Route path="/connexion" element={<Connexion />} />
                <Route path="/activation" element={<Activation />} />
                <Route
                  path="/mot-de-passe-oublie"
                  element={<MotDePasseOublie />}
                />
                <Route path="/a-propos" element={<APropos />} />

                {/* Mode videoprojecteur plein ecran (sans barre laterale) */}
                <Route
                  path="/enseignant/presences/projection/:seanceId"
                  element={
                    <RequireAuth>
                      <RequireRole role="enseignant">
                        <ProjectionPresence />
                      </RequireRole>
                    </RequireAuth>
                  }
                />

                {/* Routes protegees : authentification requise */}
                <Route
                  element={
                    <RequireAuth>
                      <AppLayout />
                    </RequireAuth>
                  }
                >
                  <Route path="/" element={<Accueil />} />
                  <Route path="/securite" element={<SecuriteCompte />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route
                    path="/journal-audit"
                    element={
                      <RequireRole roles={["admin", "scolarite"]}>
                        <JournalAudit />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/archives-annuelles"
                    element={
                      <RequireRole role="admin">
                        <ArchivesAnnuelles />
                      </RequireRole>
                    }
                  />

                  {/* Etudiant & Delegue */}
                  <Route
                    path="/mes-notes"
                    element={
                      <RequireRole roles={["etudiant", "delegue"]}>
                        <EtudiantNotes />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/mes-presences"
                    element={
                      <RequireRole roles={["etudiant", "delegue"]}>
                        <EtudiantPresences />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/evaluations"
                    element={
                      <RequireRole roles={["etudiant", "delegue"]}>
                        <ListeEvaluations />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/evaluations/:ueId"
                    element={
                      <RequireRole roles={["etudiant", "delegue"]}>
                        <EvaluationUE />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/mes-evaluations"
                    element={<Navigate to="/evaluations" replace />}
                  />

                  {/* Etudiant & Delegue : Restitution */}
                  <Route
                    path="/restitution"
                    element={
                      <RequireRole roles={["etudiant", "delegue"]}>
                        <RestitutionEtudiant />
                      </RequireRole>
                    }
                  />

                  {/* Lecture selon le perimetre du role ; saisie reservee au delegue */}
                  <Route
                    path="/cahier-texte"
                    element={
                      <RequireRole
                        roles={[
                          "delegue",
                          "enseignant",
                          "etudiant",
                          "chef_departement",
                          "scolarite",
                          "directeur_campus",
                          "directeur_general",
                        ]}
                      >
                        <CahierTexte />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/cahier-texte/nouvelle"
                    element={
                      <RequireRole role="delegue">
                        <FormSeance />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/cahier-texte/:id"
                    element={
                      <RequireRole
                        roles={[
                          "delegue",
                          "enseignant",
                          "etudiant",
                          "chef_departement",
                          "scolarite",
                        ]}
                      >
                        <DetailSeance />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/cahier-texte/:id/modifier"
                    element={
                      <RequireRole role="delegue">
                        <FormSeance />
                      </RequireRole>
                    }
                  />

                  {/* Enseignant */}
                  <Route
                    path="/enseignant/notes"
                    element={
                      <RequireRole role="enseignant">
                        <EnseignantNotes />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/enseignant/presences"
                    element={
                      <RequireRole role="enseignant">
                        <EnseignantPresences />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/resultats"
                    element={
                      <RequireRole
                        roles={[
                          "enseignant",
                          "chef_departement",
                          "scolarite",
                          "directeur_campus",
                          "directeur_general",
                        ]}
                      >
                        <MesResultats />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/resultats/:ueId"
                    element={
                      <RequireRole
                        roles={[
                          "enseignant",
                          "chef_departement",
                          "scolarite",
                          "directeur_campus",
                          "directeur_general",
                        ]}
                      >
                        <FicheResultatUE />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/mes-resultats"
                    element={<Navigate to="/resultats" replace />}
                  />
                  <Route
                    path="/visas"
                    element={
                      <RequireRole role="enseignant">
                        <Visas />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/seances-a-viser"
                    element={<Navigate to="/visas" replace />}
                  />

                  {/* Chef de departement */}
                  <Route
                    path="/participation"
                    element={
                      <RequireRole role="chef_departement">
                        <Participation />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/synthese"
                    element={
                      <RequireRole role="chef_departement">
                        <SynthesePage />
                      </RequireRole>
                    }
                  />

                  {/* Scolarite */}
                  <Route
                    path="/scolarite"
                    element={
                      <RequireRole role="scolarite">
                        <ScolariteTableauDeBord />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/scolarite/campagnes"
                    element={
                      <RequireRole role="scolarite">
                        <ScolariteCampagnes />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/scolarite/comptes"
                    element={
                      <RequireRole roles={["scolarite", "admin"]}>
                        <ScolariteComptes />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/scolarite/imports"
                    element={
                      <RequireRole roles={["scolarite", "admin"]}>
                        <ScolariteImports />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/scolarite/programmes"
                    element={
                      <RequireRole role="scolarite">
                        <ScolariteProgrammes />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/scolarite/moderation"
                    element={
                      <RequireRole role="scolarite">
                        <ScolariteModeration />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/direction/commentaires"
                    element={
                      <RequireRole
                        roles={["directeur_campus", "directeur_general"]}
                      >
                        <ScolariteModeration />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/scolarite/restitution"
                    element={
                      <RequireRole role="scolarite">
                        <ScolariteRestitution />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/campagnes"
                    element={<Navigate to="/scolarite/campagnes" replace />}
                  />

                  {/* Direction & Admin */}
                  <Route
                    path="/direction/statistiques"
                    element={
                      <RequireRole
                        roles={["directeur_campus", "directeur_general"]}
                      >
                        <DirectionStatistiques />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/direction/controles"
                    element={
                      <RequireRole
                        roles={["directeur_campus", "directeur_general"]}
                      >
                        <DirectionStatistiques />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/administration"
                    element={
                      <RequireRole role="admin">
                        <Administration />
                      </RequireRole>
                    }
                  />
                </Route>

                {/* Pages d'erreur */}
                <Route path="/acces-refuse" element={<AccesRefuse />} />
                <Route path="/404" element={<PageIntrouvable />} />
                <Route path="*" element={<Navigate to="/404" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfirmationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
