import { useContext } from "react";
import { AuthContext } from "./auth-context";
import { setAuthTokenGetter } from "@workspace/api-client-react";

setAuthTokenGetter(() => {
  try {
    const stored = localStorage.getItem("konti_auth");
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { token?: string | null };
    return parsed.token ?? null;
  } catch {
    return null;
  }
});

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export type { AuthUser, AuthState, AuthContextType } from "./auth-context";
