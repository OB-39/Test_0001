import { createContext, type ReactNode } from "react";

export interface DemandeConfirmation {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "primary";
}

export interface ConfirmationContextValue {
  confirmer: (demande: DemandeConfirmation) => Promise<boolean>;
}

export const ConfirmationContext =
  createContext<ConfirmationContextValue | null>(null);
