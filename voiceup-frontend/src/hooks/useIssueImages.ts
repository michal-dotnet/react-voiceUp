import { useQuery } from "@tanstack/react-query";
import { getIssueImages } from "../services/issuesApi";
import useAuth from "./useAuth";

const useIssueImages = (issueId: string) => {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["issueImages", issueId, token],
    queryFn: () => getIssueImages(issueId, token ?? undefined),
  });
};

export default useIssueImages;