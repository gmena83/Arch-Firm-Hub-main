import { createContext } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  // P4.3 — `field_admin` joins the role enum to match the server middleware.
  // Jorge (the meeting-defined validator) gets this role; UI uses it to
  // gate the field-admin page and the master-materials/contractors edits.
  role: "admin" | "superadmin" | "architect" | "client" | "field_admin";
  avatar: string;
  phone?: string;
  postalAddress?: string;
  physicalAddress?: string;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  viewRole: "team" | "client";
}

export interface AuthContextType extends AuthState {
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setViewRole: (role: "team" | "client") => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);
