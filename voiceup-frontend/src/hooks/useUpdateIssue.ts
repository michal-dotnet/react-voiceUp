import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateIssue } from "../services/issuesApi";
import useAuth from "./useAuth";
import type { CreateIssueRequest } from "../types/issue";

type UpdateIssueVariables = {
  issueId: string;
  data: Partial<CreateIssueRequest>;
};

const useUpdateIssue = () => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueId, data }: UpdateIssueVariables) => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return updateIssue(issueId, data, token);
    },

   onSuccess: () => {
  queryClient.invalidateQueries({
    queryKey: ["myIssues", user?.id],
  });

  queryClient.invalidateQueries({
    queryKey: ["issues"],
  });
},
  });
};

export default useUpdateIssue;