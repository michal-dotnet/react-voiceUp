import { useMutation, useQueryClient } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { changeIssueStatus, type ChangeStatusInput } from "../services/managerApi";

export function useChangeIssueStatus() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, input }: { issueId: string; input: ChangeStatusInput }) =>
      changeIssueStatus(issueId, input, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminIssues"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["myIssues"] });
    },
  });
}
