import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  QrCode,
  ClipboardCheck,
  BookOpen,
  GraduationCap,
  Users,
  Smartphone,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { ENPLogo } from '@/components/ENPLogo';

const REPERES = [
  { valeur: '6 s', libelle: 'Renouvellement du QR code d’émargement' },
  { valeur: '19', libelle: 'Critères d’évaluation pédagogique' },
  { valeur: '5', libelle: 'Seuil minimal de répondants pour restitution' },
  { valeur: '8', libelle: 'Espaces métiers institutionnels' },
];

const MODULES = [
  {
    numero: '01',
    titre: 'Émargement sécurisé par QR Code dynamique',
    description:
      'L’enseignant projette un QR code haute définition renouvelé toutes les 6 secondes et signé par HMAC-SHA256. Les étudiants scannent directement depuis leur smartphone avec validation immédiate et compteur de présents en direct.',
    detail: 'Fenêtre anti-partage de 8 secondes et liaison d’appareil anti-fraude.',
    icone: QrCode,
  },
  {
    numero: '02',
    titre: 'Évaluation anonyme des enseignements',
    description:
      'Campagnes semestrielles structurées autour de 19 critères pédagogiques réglementaires. Les réponses sont isolées de l’identité des étudiants et restituées uniquement lorsque le seuil statutaire de 5 répondants est atteint.',
    detail: 'Modération déontologique des commentaires libres avant publication.',
    icone: ClipboardCheck,
  },
  {
    numero: '03',
    titre: 'Cahier de texte numérique et visas',
    description:
      'Les délégués de promotion consignent les séances, les notions abordées et les travaux donnés. Chaque enseignant contrôle et appose son visa numérique pour un suivi fiable de l’avancement des programmes.',
    detail: 'Historique horodaté consultable par la scolarité et les chefs de département.',
    icone: BookOpen,
  },
  {
    numero: '04',
    titre: 'Gestion des notes et relevés académiques',
    description:
      'Saisie des devoirs, travaux pratiques et examens par unité d’enseignement, calcul automatique des moyennes et génération de documents officiels pour les jurys et la scolarité.',
    detail: 'Exports normalisés aux formats PDF, XLSX et DOCX.',
    icone: GraduationCap,
  },
  {
    numero: '05',
    titre: 'Gouvernance multi-rôles et pilotage',
    description:
      'Chaque membre de l’établissement accède exclusivement à son périmètre : suivi individuel, pilotage par département, gestion de scolarité ou consolidation globale pour la direction.',
    detail: 'Bascule sécurisée pour les comptes cumulant plusieurs fonctions.',
    icone: Users,
  },
  {
    numero: '06',
    titre: 'Application mobile installable (PWA)',
    description:
      'Conçue pour un usage fluide sur smartphone en amphithéâtre : navigation rapide, scanner de présence intégré et installation directe sur l’écran d’accueil sans magasin d’applications.',
    detail: 'Compatible Android et iOS via navigateur sécurisé HTTPS.',
    icone: Smartphone,
  },
];

const ACTEURS = [
  {
    role: 'Étudiant',
    perimetre: 'Émargement par QR code, consultation des notes, justificatifs d’absence, évaluation anonyme des UE et bilans semestriels.',
  },
  {
    role: 'Délégué de promotion',
    perimetre: 'Ensemble des fonctions étudiantes complétées par la saisie et la mise à jour du cahier de texte de la promotion.',
  },
  {
    role: 'Enseignant',
    perimetre: 'Projection plein écran du QR code de présence, saisie des notes, visa des séances du cahier de texte et consultation des restitutions.',
  },
  {
    role: 'Chef de département',
    perimetre: 'Suivi des taux de participation, synthèse pédagogique par unité d’enseignement et supervision de l’avancement des cours.',
  },
  {
    role: 'Scolarité',
    perimetre: 'Gestion des comptes et imports CSV, ouverture des campagnes, modération déontologique des avis et diffusion des restitutions.',
  },
  {
    role: 'Direction & Administration',
    perimetre: 'Statistiques consolidées multi-campus, contrôles institutionnels, archivage annuel et suivi du journal d’audit.',
  },
];

const ENGAGEMENTS_SECURITE = [
  {
    titre: 'Isolation stricte des bulletins anonymes',
    texte:
      'Les bulletins d’évaluation sont enregistrés séparément de l’identité des étudiants. Aucune corrélation entre un matricule et une réponse individuelle n’est techniquement possible.',
  },
  {
    titre: 'Seuil statutaire et modération déontologique',
    texte:
      'Les fiches de résultats comptant moins de 5 répondants restent masquées afin de préserver l’anonymat des petits groupes. Les commentaires libres sont relus selon la charte déontologique.',
  },
  {
    titre: 'Authentification renforcée (MFA)',
    texte:
      'Les comptes sensibles (administration, scolarité, direction, chefs de département) bénéficient d’une double authentification par code e-mail ou application TOTP.',
  },
  {
    titre: 'Journal de sécurité haute traçabilité (Administrateur)',
    texte:
      'Chaque accès et opération critique sur le portail est scellé dans un journal d’audit inviolable réservé exclusivement à l’administrateur système, tandis que le contenu des bulletins d’évaluation reste strictement séparé et anonyme.',
  },
];

export function APropos() {
  const { utilisateur } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  function handleRetour() {
    if (!utilisateur) {
      navigate('/connexion');
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-enp-black font-sans antialiased">
      {/* En-tête dans le flux normal (non figé) */}
      <header className="bg-[#0d3b66] text-white border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link
            to={utilisateur ? '/' : '/connexion'}
            className="flex items-center gap-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 py-1"
            title="Retour à l'accueil"
          >
            <ENPLogo variant="light" size="sm" showSubtitle={false} showArmoiries={false} />
          </Link>

          <button
            type="button"
            onClick={handleRetour}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-white bg-white/10 hover:bg-white/15 border border-white/20 transition-colors min-h-[40px]"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{utilisateur ? 'Retour au portail' : 'Connexion'}</span>
          </button>
        </div>
      </header>

      <main>
        {/* 1. HERO INSTITUTIONNEL */}
        <section className="bg-[#0d3b66] text-white border-b border-[#082642]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
            <div className="flex items-center gap-3.5">
              <img
                src="/armoiries-togo.svg"
                alt="Armoiries de la République Togolaise"
                className="h-12 sm:h-14 w-auto object-contain shrink-0"
              />
              <div className="border-l border-white/20 pl-3.5">
                <p className="text-xs sm:text-sm font-semibold text-white">
                  République Togolaise
                </p>
                <p className="text-xs text-slate-300">
                  Travail, Liberté, Patrie
                </p>
              </div>
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight leading-tight text-white">
                Portail Académique de l’École Nationale Polytechnique de Lomé
              </h1>
              <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
                Plateforme numérique unifiée dédiée au suivi pédagogique, à l’émargement sécurisé en amphithéâtre, à la tenue du cahier de texte certifié, à la gestion des relevés de notes et à l’évaluation anonyme des enseignements.
              </p>
            </div>

            {/* Sommaire d'ancres pour parcourir la page */}
            <nav
              aria-label="Sections de la page À propos"
              className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 border-t border-white/15 text-xs sm:text-sm"
            >
              <a href="#mission" className="text-slate-200 hover:text-white underline-offset-4 hover:underline py-1">
                Mission
              </a>
              <a href="#modules" className="text-slate-200 hover:text-white underline-offset-4 hover:underline py-1">
                Modules
              </a>
              <a href="#acteurs" className="text-slate-200 hover:text-white underline-offset-4 hover:underline py-1">
                Acteurs
              </a>
              <a href="#securite" className="text-slate-200 hover:text-white underline-offset-4 hover:underline py-1">
                Sécurité &amp; anonymat
              </a>
              <a href="#conception" className="text-slate-200 hover:text-white underline-offset-4 hover:underline py-1">
                Conception
              </a>
            </nav>
          </div>
        </section>

        {/* 2. MISSION & REPÈRES CLÉS */}
        <section id="mission" className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-enp-blue-primary">
              Mission institutionnelle
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-enp-blue-deep tracking-tight">
              Fiabiliser le quotidien académique des promotions et des équipes pédagogiques
            </h2>
            <p className="text-sm sm:text-base text-enp-gray-dark leading-relaxed">
              Le Portail Académique de l’ENP remplace les feuilles de présence papier, les ressaisies manuelles et les circuits dispersés par un outil sobre, rapide sur mobile et conforme aux exigences déontologiques de l’enseignement supérieur.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 border border-enp-border bg-white">
            {REPERES.map((item, idx) => (
              <div
                key={item.libelle}
                className={`p-4 sm:p-5 space-y-1 ${
                  idx % 2 === 1 ? 'border-l border-enp-border' : ''
                } ${idx >= 2 ? 'border-t lg:border-t-0 border-enp-border' : ''} ${
                  idx === 2 ? 'lg:border-l lg:border-enp-border' : ''
                }`}
              >
                <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-enp-blue-deep">
                  {item.valeur}
                </p>
                <p className="text-xs text-enp-gray-dark leading-snug">
                  {item.libelle}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 3. MODULES ET FONCTIONNALITÉS */}
        <section id="modules" className="bg-white border-y border-enp-border">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-enp-blue-primary">
                Fonctionnalités
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-enp-blue-deep tracking-tight">
                Six modules intégrés au service de l’établissement
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
              {MODULES.map((mod) => {
                const Icone = mod.icone;
                return (
                  <article
                    key={mod.numero}
                    className="pt-5 border-t border-enp-border space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-enp-blue-ice border border-enp-border flex items-center justify-center text-enp-blue-deep shrink-0">
                          <Icone className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-enp-black leading-snug">
                          {mod.titre}
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-enp-gray-medium shrink-0">
                        {mod.numero}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-enp-gray-dark leading-relaxed">
                      {mod.description}
                    </p>
                    <p className="text-xs text-enp-blue-deep font-medium">
                      {mod.detail}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* 4. GOUVERNANCE & ACTEURS */}
        <section id="acteurs" className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-enp-blue-primary">
              Organisation
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-enp-blue-deep tracking-tight">
              Des espaces adaptés à chaque acteur de l’ENP
            </h2>
          </div>

          <div className="bg-white border border-enp-border divide-y divide-enp-border">
            {ACTEURS.map((acteur) => (
              <div
                key={acteur.role}
                className="p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-6"
              >
                <h3 className="text-sm font-semibold text-enp-blue-deep sm:w-52 shrink-0">
                  {acteur.role}
                </h3>
                <p className="text-xs sm:text-sm text-enp-gray-dark leading-relaxed">
                  {acteur.perimetre}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 5. SÉCURITÉ, ANONYMAT & DÉONTOLOGIE */}
        <section id="securite" className="bg-white border-y border-enp-border">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-enp-blue-primary flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Garanties techniques et déontologiques</span>
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-enp-blue-deep tracking-tight">
                  Sécurité, anonymat et protection des données
                </h2>
              </div>

              {utilisateur && (
                <Link
                  to="/securite"
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-enp-blue-deep border border-enp-border hover:bg-enp-blue-ice transition-colors self-start sm:self-auto"
                >
                  <span>Paramètres Sécurité &amp; MFA</span>
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {ENGAGEMENTS_SECURITE.map((item) => (
                <div
                  key={item.titre}
                  className="border border-enp-border bg-[#f8fafd] p-5 space-y-2"
                >
                  <h3 className="text-sm font-semibold text-enp-black flex items-center gap-2">
                    <Lock className="w-4 h-4 text-enp-blue-primary shrink-0" aria-hidden="true" />
                    <span>{item.titre}</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-enp-gray-dark leading-relaxed">
                    {item.texte}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. CONCEPTION INSTITUTIONNELLE & MENTIONS */}
        <section id="conception" className="bg-[#0d3b66] text-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/15">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
                  Conception institutionnelle
                </p>
                <p className="text-sm sm:text-base font-semibold text-white">
                  Pr Adekunle Akim SALAMI, KOUDASSE Joy Amos &amp; OHOUNSOUN Bienvenu
                </p>
              </div>
              <p className="text-xs font-mono tabular-nums text-slate-300 shrink-0">
                © {new Date().getFullYear()} ENP Lomé
              </p>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
              Portail réservé aux membres autorisés de l’École Nationale Polytechnique de Lomé. Les données recueillies dans le cadre des évaluations pédagogiques ont une visée exclusive d’amélioration continue des enseignements.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleRetour}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold bg-white text-enp-blue-deep hover:bg-slate-100 transition-colors min-h-[42px]"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{utilisateur ? 'Retour au portail' : 'Accéder à la connexion'}</span>
              </button>

              <button
                type="button"
                onClick={scrollToTop}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white border border-white/20 hover:bg-white/10 transition-colors min-h-[40px]"
              >
                <ArrowUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Haut de page</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
