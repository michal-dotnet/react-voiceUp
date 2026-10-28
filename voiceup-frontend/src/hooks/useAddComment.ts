import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addComment } from "../services/commentsApi";
import useAuth from "./useAuth";

export function useAddComment(issueId: string) {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (body: string) => {
      if (!token) {
        throw new Error("You must be logged in to comment");
      }

      return addComment(issueId, { body }, token);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["comments", issueId],
      });
    },
  });
}

