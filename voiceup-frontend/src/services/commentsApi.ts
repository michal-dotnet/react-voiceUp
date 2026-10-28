import type {AddCommentRequest, AddCommentResponse, CommentsResponse,} from "../types/comment";

const API_URL = import.meta.env.VITE_API_URL;

const addComment = async (issueId: string,data: AddCommentRequest,token: string): Promise<AddCommentResponse> => {
  const response = await fetch(
    `${API_URL}/issues/${issueId}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to add comment");
  }

  return response.json();
};

const getIssueComments = async ( issueId: string, page = 1, pageSize = 20): Promise<CommentsResponse> => {
  const response = await fetch(
    `${API_URL}/issues/${issueId}/comments?page=${page}&pageSize=${pageSize}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch comments");
  }

  return response.json();
};
export { addComment,getIssueComments};