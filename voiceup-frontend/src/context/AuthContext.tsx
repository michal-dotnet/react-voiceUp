import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "../types/auth";
import { getCurrentUser } from "../services/authApi";
import { AuthContext } from "./authContextDefinition";

 const isTokenValid = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));

    return (
      typeof payload.exp === "number" &&
      payload.exp * 1000 > Date.now()
    );
  } catch {
    return false;
  }
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();

  const [token, setToken] = useState<string | null>(() => {
    const savedToken = localStorage.getItem("accessToken");

    if (!savedToken) return null;

    if (!isTokenValid(savedToken)) {
      localStorage.removeItem("accessToken");
      return null;
    }

    return savedToken;
  });

  const { data: user, isPending, isFetching } = useQuery({
    queryKey: ["currentUser", token],
    queryFn: async () => {
      try {
        const response = await getCurrentUser(token!);
        return response.data;
      } catch (err) {
        // The server rejected the saved token: sign out locally.
        if (err instanceof Error && "status" in err && err.status === 401) {
          localStorage.removeItem("accessToken");
          setToken(null);
        }
        throw err;
      }
    },
    enabled: token !== null,
    retry: false,
  });
  const login = (newToken: string, user: User) => {
    localStorage.setItem("accessToken", newToken);
    queryClient.setQueryData(["currentUser", newToken], user);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    setToken(null);
    queryClient.removeQueries({ queryKey: ["currentUser"] });
    queryClient.removeQueries({ queryKey: ["myIssues"] });
  };

  const isLoading = token !== null && isPending && isFetching;

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated: token !== null,
        isLoading,
        user: user ?? null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};