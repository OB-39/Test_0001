import { useEffect, useState, useMemo } from 'react';
import { ClipboardList, Printer } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiError } from '@/api';
import type { NoteEtudiant } from '@/api/types';
import {
  PageHeader,
  Button,
  Alert,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@/components/ui';

export function EtudiantNotes() {
  const [notes, setNotes] = useState<NoteEtudiant[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    api
      .dossierMesNotes()
      .then((data) => {
        if (actif) setNotes(data);
      })
      .catch((err: unknown) => {
        if (actif)
          setErreur(
            err instanceof ApiError
              ? err.messages.join(' ')
              : 'Impossible de charger vos notes personnelles.',
          );
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (notes.length === 0) return null;
    const notesDispos = notes.filter((n) => n.note !== null);

    const notesSur20 = notesDispos.map((n) => ((n.note as number) / n.bareme) * 20);
    const moyenne =
      notesSur20.length > 0
        ? notesSur20.reduce((acc, curr) => acc + curr, 0) / notesSur20.length
        : null;

    return {
      total: notes.length,
      notesSaisies: notesDispos.length,
      moyenneSur20: moyenne === null ? '-' : (Math.round(moyenne * 100) / 100).toFixed(2),
    };
  }, [notes]);

  const progressions = useMemo(() => {
    const parCours = new Map<
      number,
      {
        code: string;
        intitule: string;
        evaluations: {
          date: string;
          libelle: string;
          noteSur20: number;
        }[];
      }
    >();
    for (const note of notes) {
      if (note.note === null) continue;
      const cours = parCours.get(note.coursId) ?? {
        code: note.code,
        intitule: note.intitule,
        evaluations: [],
      };
      cours.evaluations.push({
        date: note.createdAt,
        libelle: note.libelle,
        noteSur20: (note.note / note.bareme) * 20,
      });
      parCours.set(note.coursId, cours);
    }
    return [...parCours.entries()]
      .filter(([, cours]) => cours.evaluations.length > 1)
      .map(([coursId, cours]) => ({
        coursId,
        ...cours,
        evaluations: cours.evaluations
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((evaluation) => ({
            ...evaluation,
            dateLabel: `${new Date(evaluation.date).toLocaleDateString('fr-FR')} · ${evaluation.libelle}`,
          })),
      }));
  }, [notes]);

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl mx-auto pb-6">
      <PageHeader
        title="Mes notes"
        subtitle="Notes de devoir saisies par vos enseignants (usage personnel)."
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Mes notes' },
        ]}
        actions={
          notes.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="font-semibold min-h-[38px] whitespace-nowrap"
              leftIcon={<Printer className="w-3.5 h-3.5" />}
              onClick={() => window.print()}
            >
              Imprimer
            </Button>
          ) : undefined
        }
      />

      {erreur && (
        <Alert variant="danger" title="Erreur" onClose={() => setErreur(null)}>
          {erreur}
        </Alert>
      )}

      {chargement ? (
        <div className="p-10 text-center bg-white border border-enp-border text-sm text-enp-gray-medium">
          Chargement de vos notes...
        </div>
      ) : notes.length === 0 ? (
        <div className="bg-white border border-enp-border p-8 text-center space-y-1.5">
          <ClipboardList className="w-9 h-9 text-enp-gray-medium mx-auto opacity-40" />
          <h3 className="text-sm font-bold text-enp-blue-deep">
            Aucune note publiée
          </h3>
          <p className="text-xs text-enp-gray-medium max-w-xs mx-auto">
            Vos notes apparaîtront ici dès leur saisie par vos enseignants.
          </p>
        </div>
      ) : (
        <>
          {/* Resume unifie */}
          {stats && (
            <section className="bg-white border border-enp-border grid grid-cols-2 divide-x divide-enp-border">
              <div className="p-3.5 sm:p-4">
                <span className="text-xs font-medium text-enp-gray-medium block">
                  Moyenne générale
                </span>
                <span className="text-xl sm:text-2xl font-bold tabular-nums text-enp-blue-primary">
                  {stats.moyenneSur20}
                  <span className="text-xs font-normal text-enp-gray-medium ml-1">/ 20</span>
                </span>
              </div>
              <div className="p-3.5 sm:p-4">
                <span className="text-xs font-medium text-enp-gray-medium block">
                  Notes saisies
                </span>
                <span className="text-xl sm:text-2xl font-bold tabular-nums text-enp-blue-deep">
                  {stats.notesSaisies}
                  <span className="text-xs font-normal text-enp-gray-medium ml-1">
                    / {stats.total}
                  </span>
                </span>
              </div>
            </section>
          )}

          {/* Liste / Tableau des notes */}
          <section className="bg-white border border-enp-border overflow-hidden">
            <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-enp-border flex items-center justify-between bg-enp-bg">
              <h2 className="font-bold text-enp-blue-deep text-xs sm:text-sm">
                Relevé des devoirs ({notes.length})
              </h2>
              <span className="text-xs text-enp-gray-medium font-mono">
                Harmattan
              </span>
            </div>

            {/* Vue mobile native sobre */}
            <div className="block sm:hidden divide-y divide-enp-border">
              {notes.map((ligne) => {
                const sansNote = ligne.note === null;
                const noteValide = ligne.note !== null && ligne.note >= ligne.bareme / 2;

                return (
                  <div
                    key={`${ligne.evaluationId}-${ligne.coursId}`}
                    className="p-3.5 flex items-center justify-between gap-3 bg-white"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-mono text-[11px] text-enp-gray-medium">
                        {ligne.code} · {ligne.libelle}
                      </p>
                      <p className="font-semibold text-sm text-enp-black truncate">
                        {ligne.intitule}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      {sansNote ? (
                        <span className="text-xs text-enp-gray-medium">En attente</span>
                      ) : (
                        <span
                          className={`font-mono font-bold text-base tabular-nums ${
                            noteValide ? 'text-enp-blue-deep' : 'text-enp-red-error'
                          }`}
                        >
                          {ligne.note}
                          <span className="text-xs font-normal text-enp-gray-medium">
                            /{ligne.bareme}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vue tablette et desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unité d'Enseignement</TableHead>
                    <TableHead>Évaluation</TableHead>
                    <TableHead className="text-right">Note</TableHead>
                    <TableHead className="text-right">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.map((ligne) => {
                    const sansNote = ligne.note === null;
                    const noteValide = ligne.note !== null && ligne.note >= ligne.bareme / 2;

                    return (
                      <TableRow key={`${ligne.evaluationId}-${ligne.coursId}`}>
                        <TableCell>
                          <span className="font-mono text-xs font-semibold text-enp-blue-primary mr-2">
                            {ligne.code}
                          </span>
                          <span className="font-medium text-enp-black text-sm">
                            {ligne.intitule}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-enp-gray-dark">
                          {ligne.libelle}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-sm tabular-nums">
                          {sansNote ? (
                            <span className="text-xs text-enp-gray-medium font-sans font-normal">
                              En attente
                            </span>
                          ) : (
                            <span className={noteValide ? 'text-enp-blue-deep' : 'text-enp-red-error'}>
                              {ligne.note}{' '}
                              <span className="text-xs font-normal text-enp-gray-medium">
                                / {ligne.bareme}
                              </span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {sansNote ? (
                            <Badge variant="outline">En attente</Badge>
                          ) : (
                            <Badge variant={noteValide ? 'success' : 'danger'}>
                              {noteValide ? 'Validé' : 'Insuffisant'}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Courbe d'evolution uniquement si plusieurs notes par UE */}
          {progressions.length > 0 && (
            <section className="space-y-4 border border-enp-border bg-white p-4">
              <h3 className="text-sm font-bold text-enp-blue-deep">Évolution par UE</h3>
              {progressions.map((progression) => (
                <article
                  key={progression.coursId}
                  className="space-y-2 border-t border-enp-border pt-3"
                >
                  <h4 className="text-xs font-semibold text-enp-black">
                    {progression.code} · {progression.intitule}
                  </h4>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={progression.evaluations}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dateLabel" minTickGap={20} />
                        <YAxis domain={[0, 20]} />
                        <Tooltip
                          formatter={(value) => [
                            `${Number(value).toFixed(2)} / 20`,
                            'Note',
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="noteSur20"
                          name="Note / 20"
                          stroke="#1d4ed8"
                          strokeWidth={2}
                          dot
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
