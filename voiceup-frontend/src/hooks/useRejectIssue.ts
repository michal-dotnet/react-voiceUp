import { useMutation, useQueryClient } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { rejectIssue } from "../services/managerApi";

export function useRejectIssue() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({issueId,reason,}: {issueId: string;reason: string;}) =>
         rejectIssue(issueId, reason, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminIssues"] });
      queryClient.invalidateQueries({ queryKey: ["myIssues"] });
    },
  });
}