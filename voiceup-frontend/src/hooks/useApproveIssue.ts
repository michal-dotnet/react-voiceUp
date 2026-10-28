import { useMutation, useQueryClient } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { approveIssue } from "../services/managerApi";

export function useApproveIssue() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => approveIssue(id, token!),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminIssues"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });
}