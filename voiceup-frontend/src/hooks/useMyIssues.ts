import { useQuery } from "@tanstack/react-query";
import useAuth from "./useAuth";
import { getMyIssues } from "../services/issuesApi";

const useMyIssues = () => {
  const { token, user } = useAuth();

  return useQuery({
    queryKey: ["myIssues", user?.id],
    queryFn: () => {
      if (!token) {
        throw new Error("Authentication required");
      }

      return getMyIssues(token);
    },
    enabled: token !== null && user !== null,
  });
};

export default useMyIssues;