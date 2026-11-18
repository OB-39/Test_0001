import { useContext } from "react";
import { ConfirmationContext } from "./confirmation-context";

export function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error(
      "useConfirmation doit être utilisé dans ConfirmationProvider",
    );
  }
  return context;
}
