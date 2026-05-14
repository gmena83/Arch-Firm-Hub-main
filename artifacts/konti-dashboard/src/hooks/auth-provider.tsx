import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AuthContext, type AuthUser, type AuthState } from "./auth-context";
import { useAuth } from "./use-auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      const stored = localStorage.getItem("konti_auth");
      if (stored) {
        const parsed = JSON.parse(stored) as AuthState;
        return parsed;
      }
    } catch {}
    return { token: null, user: null, viewRole: "team" };
  });

  const login = (token: string, user: AuthUser) => {
    const newAuth: AuthState = {
      token,
      user,
      viewRole: user.role === "client" ? "client" : "team",
    };
    setAuth(newAuth);
    localStorage.setItem("konti_auth", JSON.stringify(newAuth));
  };

  const logout = () => {
    setAuth({ token: null, user: null, viewRole: "team" });
    localStorage.removeItem("konti_auth");
    setLocation("/login");
  };

  const setViewRole = (role: "team" | "client") => {
    setAuth((prev) => {
      const next = { ...prev, viewRole: role };
      localStorage.setItem("konti_auth", JSON.stringify(next));
      return next;
    });
  };

  const updateUser = (patch: Partial<AuthUser>) => {
    setAuth((prev) => {
      if (!prev.user) return prev;
      const next: AuthState = { ...prev, user: { ...prev.user, ...patch } };
      localStorage.setItem("konti_auth", JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        ...auth,
        login,
        logout,
        setViewRole,
        updateUser,
        isAuthenticated: !!auth.token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) setLocation("/login");
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

export function RequireRole({
  roles,
  children,
}: {
  roles: AuthUser["role"][];
  children: React.ReactNode;
}) {
  const { isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    } else if (user && !roles.includes(user.role)) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, user, roles, setLocation]);

  if (!isAuthenticated) return null;
  if (user && !roles.includes(user.role)) return null;
  return <>{children}</>;
}
