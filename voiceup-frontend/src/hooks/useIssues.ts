import { useQuery } from "@tanstack/react-query";
import { getIssues } from "../services/issuesApi";

const useIssues = (status: string, page: number) => {
  return useQuery({
    queryKey: ["issues", status, page],
    queryFn: () => getIssues(status, page),
  });
};
export default useIssues;

