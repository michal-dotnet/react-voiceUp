import { createContext } from "react";
import type { User } from "../types/auth";

interface AuthContextType {
  token: string | null; 
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);
