

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { confirmIssue } from "../services/issuesApi";
import useAuth from "./useAuth";

export function useConfirmIssue() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (issueId: string) => confirmIssue(issueId, token),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["myIssues"] });
    },
  });
}