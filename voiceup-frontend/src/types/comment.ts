export type Comment = {
  id: string;
  issueId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
  };
};

export type AddCommentRequest = {
  body: string;
};

export type AddCommentResponse = {
  data: Comment;
};
export type CommentsResponse = {
  data: Comment[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};