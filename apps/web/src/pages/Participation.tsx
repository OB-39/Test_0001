import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/api';
import type { Campagne, ParticipationUe } from '@/api/types';
import { PageHeader, Button, Alert } from '@/components/ui';

export function Participation() {
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [campagneId, setCampagneId] = useState<number | null>(null);
  const [participations, setParticipations] = useState<ParticipationUe[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerCampagnes = useCallback(async () => {
    try {
      const data = await api.pilotageCampagnes();
      setCampagnes(data);
      if (data.length > 0) {
        setCampagneId((prev) => prev ?? data[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.messages.join(' '));
      else setErreur('Erreur réseau.');
    }
  }, []);

  const chargerParticipation = useCallback(async () => {
    if (campagneId === null) return;
    setChargement(true);
    setErreur(null);
    try {
      const data = await api.pilotageParticipation(campagneId);
      setParticipations(data);
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.messages.join(' '));
      else setErreur('Erreur réseau.');
    } finally {
      setChargement(false);
    }
  }, [campagneId]);

  useEffect(() => {
    void chargerCampagnes();
  }, [chargerCampagnes]);

  useEffect(() => {
    if (campagneId !== null) void chargerParticipation();
  }, [campagneId, chargerParticipation]);

  const trie = useMemo(() => {
    return [...participations].sort((a, b) => {
      const ta = a.inscrits > 0 ? a.repondants / a.inscrits : 0;
      const tb = b.inscrits > 0 ? b.repondants / b.inscrits : 0;
      return ta - tb;
    });
  }, [participations]);

  const totalInscrits = participations.reduce((s, p) => s + p.inscrits, 0);
  const totalRepondants = participations.reduce((s, p) => s + p.repondants, 0);
  const tauxGlobal = totalInscrits > 0 ? Math.round((totalRepondants / totalInscrits) * 100) : 0;
  const uesQuorumAtteint = participations.filter((p) => p.repondants >= 5).length;

  return (
    <div className="space-y-4 sm:space-y-5 max-w-6xl mx-auto animate-fade-in pb-6">
      <PageHeader
        title="Suivi de la participation"
        description="Taux de réponse en direct par unité d'enseignement."
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Participation' },
        ]}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={chargement}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'animate-spin' : ''}`} />}
            onClick={() => void chargerParticipation()}
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

      {/* SÉLECTEUR DE CAMPAGNE */}
      {campagnes.length > 0 && (
        <div className="bg-white border border-enp-border p-3 flex items-center gap-1.5 overflow-x-auto">
          {campagnes.map((c) => {
            const active = c.id === campagneId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCampagneId(c.id)}
                className={`px-3 py-2 text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
                  active
                    ? 'bg-enp-blue-deep text-white border-enp-blue-deep'
                    : 'bg-white text-enp-black border-enp-border hover:bg-enp-blue-ice/40'
                }`}
              >
                {c.libelle}
              </button>
            );
          })}
        </div>
      )}

      {chargement ? (
        <div className="bg-white border border-enp-border p-10 text-center text-sm text-enp-gray-medium">
          Chargement des indicateurs…
        </div>
      ) : (
        <>
          {/* SYNTHÈSE UNIFIÉE */}
          <div className="bg-white border border-enp-border grid grid-cols-3 divide-x divide-enp-border">
            <div className="p-3 sm:p-4">
              <p className="text-xs text-enp-gray-medium">Taux global</p>
              <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-blue-primary mt-0.5">
                {tauxGlobal}%
              </p>
              <p className="hidden sm:block text-xs text-enp-gray-medium mt-0.5 tabular-nums">
                {totalRepondants} sur {totalInscrits} inscrits
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <p className="text-xs text-enp-gray-medium">Répondants</p>
              <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-black mt-0.5">
                {totalRepondants}
              </p>
              <p className="hidden sm:block text-xs text-enp-gray-medium mt-0.5 tabular-nums">
                {participations.length} UE suivies
              </p>
            </div>
            <div className="p-3 sm:p-4">
              <p className="text-xs text-enp-gray-medium">Quorum (≥ 5)</p>
              <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-enp-green-valid mt-0.5">
                {uesQuorumAtteint} / {participations.length}
              </p>
              <p className="hidden sm:block text-xs text-enp-gray-medium mt-0.5">
                UE exploitables
              </p>
            </div>
          </div>

          <div className="bg-white border border-enp-border overflow-hidden">
            {/* VUE MOBILE NATIVE */}
            <div className="block md:hidden divide-y divide-enp-border">
              {trie.map((p) => {
                const taux = p.inscrits > 0 ? Math.round((p.repondants / p.inscrits) * 100) : 0;
                return (
                  <div key={p.ueId} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-enp-blue-deep">
                          {p.code}
                        </p>
                        <p className="text-sm font-semibold text-enp-black leading-snug">
                          {p.intitule}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`font-mono text-sm font-bold tabular-nums ${
                            taux >= 50 ? 'text-enp-green-valid' : 'text-enp-blue-deep'
                          }`}
                        >
                          {taux}%
                        </p>
                        <p className="text-xs font-mono tabular-nums text-enp-gray-medium">
                          {p.repondants} / {p.inscrits}
                        </p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-enp-bg overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          taux >= 50 ? 'bg-enp-green-valid' : 'bg-enp-blue-primary'
                        }`}
                        style={{ width: `${taux}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* VUE BUREAU */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-enp-bg border-b border-enp-border text-enp-gray-dark text-xs">
                    <th scope="col" className="text-left px-4 py-3 font-semibold">Code</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold">Unité d'Enseignement</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold">Inscrits</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold">Répondants</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold w-56">Progression</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-enp-border">
                  {trie.map((p) => {
                    const taux = p.inscrits > 0 ? Math.round((p.repondants / p.inscrits) * 100) : 0;
                    return (
                      <tr key={p.ueId} className="hover:bg-enp-blue-ice/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-enp-blue-deep whitespace-nowrap">
                          {p.code}
                        </td>
                        <td className="px-4 py-3 font-semibold text-enp-black">{p.intitule}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-enp-gray-medium">
                          {p.inscrits}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-enp-black">
                          {p.repondants}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 bg-enp-bg overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  taux >= 50 ? 'bg-enp-green-valid' : 'bg-enp-blue-primary'
                                }`}
                                style={{ width: `${taux}%` }}
                              />
                            </div>
                            <span
                              className={`font-mono text-xs font-semibold tabular-nums w-10 text-right ${
                                taux >= 50 ? 'text-enp-green-valid' : 'text-enp-blue-deep'
                              }`}
                            >
                              {taux}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
