import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createIssue, uploadIssueImage } from "../services/issuesApi";
import { useNavigate } from "react-router";
import useAuth from "./useAuth";
import type { CreateIssueRequest } from "../types/issue";


type CreateIssueVariables = {
  data: CreateIssueRequest;
  images: File[];
};
 const useCreateIssue = () => {
  const auth = useAuth();
  const queryClient = useQueryClient(); 
  const navigate = useNavigate();

  return useMutation({

mutationFn: async ({ data, images }: CreateIssueVariables) => {
  if (!auth.token) {
    throw new Error("Authentication required");
  }

  const response = await createIssue(data, auth.token);

  const results = await Promise.allSettled(
    images.map((file) =>
      uploadIssueImage(response.data.id, file, auth.token!)
    )
  );

  const failedCount = results.filter(
    (result) => result.status === "rejected"
  ).length;

  return {
    ...response,
    failedCount,
  };
},
    onSuccess: () => {
    queryClient.invalidateQueries({
   queryKey: ["myIssues", auth.user?.id],
});
  navigate("/my-issues");
}
  });
};
export default useCreateIssue