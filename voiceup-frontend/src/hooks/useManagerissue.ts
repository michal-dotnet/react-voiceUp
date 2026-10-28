import { useQuery } from "@tanstack/react-query";
import useAuth from "./useAuth";
import type { AdminIssuesResponse } from "../types/issue";
import { getAdminIssues } from "../services/managerApi";

export function useAdminIssues() {
  const { token } = useAuth();

  return useQuery<AdminIssuesResponse>({
    queryKey: ["adminIssues"],
    queryFn: () => getAdminIssues(token!),
    enabled: !!token,
  });
}

