import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ConfirmationContext,
  type DemandeConfirmation,
} from "./confirmation-context";

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [demande, setDemande] = useState<DemandeConfirmation | null>(null);
  const resolveRef = useRef<((resultat: boolean) => void) | null>(null);

  const terminer = useCallback((resultat: boolean) => {
    resolveRef.current?.(resultat);
    resolveRef.current = null;
    setDemande(null);
  }, []);

  const confirmer = useCallback((nouvelleDemande: DemandeConfirmation) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setDemande(nouvelleDemande);
    });
  }, []);

  return (
    <ConfirmationContext.Provider value={{ confirmer }}>
      {children}
      <ConfirmDialog
        isOpen={demande !== null}
        onClose={() => terminer(false)}
        onConfirm={() => terminer(true)}
        title={demande?.title ?? ""}
        message={demande?.message}
        confirmLabel={demande?.confirmLabel}
        variant={demande?.variant ?? "warning"}
      />
    </ConfirmationContext.Provider>
  );
}
