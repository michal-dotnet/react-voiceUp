import { useInfiniteQuery } from "@tanstack/react-query";
import { getIssueComments } from "../services/commentsApi";

export function useIssueComments(issueId: string) {
  return useInfiniteQuery({
    queryKey: ["comments", issueId],

    queryFn: ({ pageParam }) =>
      getIssueComments(issueId, pageParam),

    initialPageParam: 1,

    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;

      return page < totalPages ? page + 1 : undefined;
    },
  });
}