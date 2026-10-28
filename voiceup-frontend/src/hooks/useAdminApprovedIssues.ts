import { useQuery } from "@tanstack/react-query";
import useAuth from "./useAuth";
import type { AdminIssuesResponse } from "../types/issue";
import { getAdminApprovedIssues } from "../services/managerApi";

export function useAdminApprovedIssues() {
  const { token } = useAuth();

  return useQuery<AdminIssuesResponse>({
    queryKey: ["adminIssues", "APPROVED"],
    queryFn: () => getAdminApprovedIssues(token!),
    enabled: !!token,
  });
}
