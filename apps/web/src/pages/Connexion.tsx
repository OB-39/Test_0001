import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  CheckCircle2,
  Lock,
  User,
  HelpCircle,
  KeyRound,
  ArrowRight,
  GraduationCap,
} from 'lucide-react';
import { api, ApiError } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { MockBanner } from '@/components/MockBanner';
import { Button, Input, Alert, Checkbox } from '@/components/ui';
import type { ChallengeMfa } from '@/api/types';

interface EtatConnexion {
  identifiant: string;
  motDePasse: string;
}

export function Connexion() {
  const { connecter } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState<EtatConnexion>({ identifiant: '', motDePasse: '' });
  const [afficherMdp, setAfficherMdp] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Étape MFA conditionnelle renvoyée par le backend (roles admin, scolarite, chef dept, etc.)
  const [challengeMfa, setChallengeMfa] = useState<ChallengeMfa | null>(null);
  const [methodeMfa, setMethodeMfa] = useState<'email' | 'totp'>('email');
  const [codeMfa, setCodeMfa] = useState('');
  const [memoriserAppareil, setMemoriserAppareil] = useState(false);
  const messageInfo = (location.state as { message?: string } | null)?.message;

  const isMock = import.meta.env.VITE_USE_MOCK === 'true';

  const requestedFrom = (
    location.state as { from?: { pathname: string } } | null
  )?.from?.pathname;
  const from =
    requestedFrom?.startsWith('/') &&
    !requestedFrom.startsWith('//') &&
    !requestedFrom.includes('\\')
      ? requestedFrom
      : '/';

  function update(champ: keyof EtatConnexion, valeur: string) {
    setForm((f) => ({ ...f, [champ]: valeur }));
    setErreur(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);

    try {
      if (challengeMfa) {
        const rep = await api.verifierMfa({
          challengeId: challengeMfa.challengeId,
          method: methodeMfa,
          code: codeMfa.trim(),
          rememberDevice: memoriserAppareil,
        });
        connecter(rep);
        navigate(from, { replace: true });
      } else {
        const rep = await api.connexion({
          identifiant: form.identifiant.trim(),
          motDePasse: form.motDePasse,
        });

        if ('mfaRequired' in rep) {
          setChallengeMfa(rep);
          setMethodeMfa(rep.methods[0] ?? 'email');
          return;
        }

        connecter(rep);
        navigate(from, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErreur(err.messages.join(' '));
      } else if (err instanceof TypeError) {
        setErreur('Erreur de communication : impossible de joindre le serveur API.');
      } else {
        setErreur('Identifiant ou mot de passe incorrect.');
      }
    } finally {
      setEnCours(false);
    }
  }

  // Raccourcis de connexion pour tester rapidement différents profils en mode maquette
  function preRemplir(identifiant: string, mdp: string) {
    setForm({ identifiant, motDePasse: mdp });
    setErreur(null);
    setChallengeMfa(null);
  }

  return (
    <div className="min-h-screen flex flex-col bg-enp-bg w-full max-w-full overflow-x-hidden">
      <MockBanner />

      <div className="flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-10 w-full max-w-full">
        <div className="w-full max-w-5xl bg-white border border-enp-border shadow-elevated grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* ====================================================== */}
          {/* PANNEAU INSTITUTIONNEL GAUCHE (Desktop)                 */}
          {/* ====================================================== */}
          <div className="lg:col-span-5 bg-enp-blue-deep text-white p-4 sm:p-6 lg:p-10 flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-r border-[#00172E]">
            {/* Arrière-plan décoratif géométrique sobre */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#FFFFFF" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            <div className="relative z-10 space-y-4 lg:space-y-6">
              <div className="flex items-center justify-center lg:justify-start py-1 lg:py-0 lg:pb-3 lg:border-b lg:border-white/10">
                <img
                  src="/logo-enp-white.png"
                  alt="Logo officiel École Nationale Polytechnique"
                  className="h-14 sm:h-20 lg:h-16 w-auto max-w-[240px] sm:max-w-[300px] object-contain"
                />
              </div>

              <div className="hidden lg:block space-y-2">
                <h2 className="text-xl font-bold font-sans text-white tracking-tight leading-snug">
                  École Nationale Polytechnique
                </h2>
                <div className="w-10 h-0.5 bg-enp-gold" />
              </div>

              <div className="hidden lg:block space-y-4 pt-1">
                <p className="text-sm text-slate-300 leading-relaxed font-sans">
                  Portail officiel d'évaluation des enseignements, cahier de texte, présences et notes.
                </p>

                <div className="space-y-2 pt-3 border-t border-white/10 text-xs font-sans text-slate-200">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-enp-gold shrink-0" />
                    <span>Évaluations anonymes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-enp-green-valid shrink-0" />
                    <span>Cahier de texte certifié</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-sky-300 shrink-0" />
                    <span>Émargement QR et relevés</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex relative z-10 pt-6 mt-6 border-t border-white/10 items-center gap-3">
              <img
                src="/armoiries-togo.svg"
                alt="Armoiries de la République Togolaise"
                className="w-10 h-12 object-contain shrink-0"
              />
              <div className="text-[11px] text-slate-300">
                <p className="font-semibold text-white tracking-wide uppercase">RÉPUBLIQUE TOGOLAISE</p>
                <p className="text-slate-300 italic font-sans">Travail, Liberté, Patrie</p>
              </div>
            </div>
          </div>

          {/* ====================================================== */}
          {/* FORMULAIRE DE CONNEXION DROITE                          */}
          {/* ====================================================== */}
          <div className="lg:col-span-7 p-4 sm:p-8 lg:p-10 flex flex-col justify-between bg-white">
            <div>
              <div className="mb-5">
                <h1 className="text-xl sm:text-2xl font-bold text-enp-black tracking-tight">
                  {challengeMfa ? 'Vérification en deux étapes' : 'Connexion'}
                </h1>
                <p className="text-xs sm:text-sm text-enp-gray-medium mt-1">
                  {challengeMfa
                    ? 'Saisissez le code de confirmation temporaire.'
                    : 'Matricule ou e-mail officiel ENP.'}
                </p>
              </div>

              {erreur && (
                <div className="mb-5">
                  <Alert variant="danger" title="Échec de l'authentification">
                    {erreur}
                  </Alert>
                </div>
              )}
              {messageInfo && (
                <div className="mb-5">
                  <Alert variant="success" title="Mot de passe modifié">
                    {messageInfo}
                  </Alert>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {challengeMfa ? (
                  // ÉTAPE MFA
                  <div className="space-y-4">
                    {challengeMfa.methods.length > 1 && (
                      <div>
                        <label
                          htmlFor="methode-mfa"
                          className="block text-xs font-semibold uppercase tracking-wider text-enp-gray-dark mb-1.5"
                        >
                          Méthode de vérification
                        </label>
                        <select
                          id="methode-mfa"
                          value={methodeMfa}
                          onChange={(e) => setMethodeMfa(e.target.value as 'email' | 'totp')}
                          className="w-full bg-white text-enp-black text-sm border border-enp-border p-2.5 min-h-[40px] focus:outline-none focus:border-enp-blue-primary"
                        >
                          <option value="email">Code de sécurité par e-mail</option>
                          <option value="totp">Application Authenticator (TOTP)</option>
                        </select>
                      </div>
                    )}

                    <Input
                      label="Code de sécurité à 6 chiffres"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      maxLength={6}
                      value={codeMfa}
                      onChange={(e) => setCodeMfa(e.target.value)}
                      placeholder="Ex: 849201"
                      startIcon={<KeyRound className="w-4 h-4" />}
                      helperText="Saisissez le code à usage unique généré pour cette session."
                    />

                    <Checkbox
                      checked={memoriserAppareil}
                      onChange={(event) => setMemoriserAppareil(event.target.checked)}
                      label="Faire confiance à cet appareil pendant 30 jours"
                      description="Le second facteur ne sera pas redemandé sur ce navigateur pendant cette période. Ne cochez pas cette option sur un appareil partagé."
                    />

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setChallengeMfa(null);
                          setCodeMfa('');
                        }}
                      >
                        Retour
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        isLoading={enCours}
                        className="flex-1"
                        rightIcon={<ArrowRight className="w-4 h-4" />}
                      >
                        Valider l'accès
                      </Button>
                    </div>
                  </div>
                ) : (
                  // FORMULAIRE STANDARD IDENTIFIANT / MOT DE PASSE
                  <div className="space-y-4">
                    <Input
                      label="Identifiant institutionnel"
                      type="text"
                      required
                      autoComplete="username"
                      value={form.identifiant}
                      onChange={(e) => update('identifiant', e.target.value)}
                      placeholder="Matricule (ex: 2026-001) ou e-mail ENP"
                      startIcon={<User className="w-4 h-4" />}
                      disabled={enCours}
                    />

                    <div>
                      <Input
                        label="Mot de passe"
                        type={afficherMdp ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={form.motDePasse}
                        onChange={(e) => update('motDePasse', e.target.value)}
                        placeholder="••••••••••••"
                        startIcon={<Lock className="w-4 h-4" />}
                        disabled={enCours}
                        endIcon={
                          <button
                            type="button"
                            onClick={() => setAfficherMdp((v) => !v)}
                            className="p-1 text-enp-gray-medium hover:text-enp-black transition-colors"
                            aria-label={afficherMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          >
                            {afficherMdp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        }
                      />
                      <div className="flex justify-end mt-1.5">
                        <Link
                          to="/mot-de-passe-oublie"
                          className="text-xs text-enp-blue-primary hover:text-enp-blue-deep font-medium underline underline-offset-2"
                        >
                          Mot de passe oublié ?
                        </Link>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      isLoading={enCours}
                      className="w-full"
                      leftIcon={<LogIn className="w-4 h-4" />}
                    >
                      Se connecter
                    </Button>
                  </div>
                )}
              </form>

              {/* Liens d'assistance & premier accès */}
              <div className="mt-6 pt-5 border-t border-enp-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-enp-gray-medium">Première connexion ? </span>
                  <Link
                    to="/activation"
                    className="font-bold text-enp-blue-primary hover:text-enp-blue-deep underline underline-offset-2"
                  >
                    Activer mon compte
                  </Link>
                </div>
                <Link
                  to="/securite"
                  className="text-enp-gray-medium hover:text-enp-black flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  Assistance technique
                </Link>
              </div>
            </div>

            {/* Sélecteur de test rapide en mode maquette (pour faciliter les revues institutionnelles) */}
            {isMock && (
              <div className="mt-8 pt-4 border-t border-dashed border-enp-border bg-enp-blue-ice/60 p-3">
                <p className="text-[11px] font-bold text-enp-blue-deep uppercase tracking-wider mb-2">
                  Démonstration : Sélection d’un profil type :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => preRemplir('student1@enp.tg', 'Enp2026!Etudiant')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Étudiant
                  </button>
                  <button
                    type="button"
                    onClick={() => preRemplir('delegue1@enp.tg', 'Enp2026!Delegue')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Délégué
                  </button>
                  <button
                    type="button"
                    onClick={() => preRemplir('prof.dupont@enp.tg', 'Enp2026!Prof')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Enseignant
                  </button>
                  <button
                    type="button"
                    onClick={() => preRemplir('chef.gc@enp.tg', 'Enp2026!Chef')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Chef de Dept
                  </button>
                  <button
                    type="button"
                    onClick={() => preRemplir('scolarite@enp.tg', 'Enp2026!Scolarite')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Scolarité
                  </button>
                  <button
                    type="button"
                    onClick={() => preRemplir('directeur.campus@enp.tg', 'Enp2026!Campus')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Dir. Campus
                  </button>
                  <button
                    type="button"
                    onClick={() => preRemplir('direction@enp.tg', 'Enp2026!Direction')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Dir. Générale
                  </button>
                  <button
                    type="button"
                    onClick={() => preRemplir('admin@enp.tg', 'Enp2026!Admin')}
                    className="text-[11px] px-2 py-1 bg-white border border-enp-border text-enp-black hover:border-enp-blue-primary hover:bg-enp-blue-light font-medium"
                  >
                    Admin
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
