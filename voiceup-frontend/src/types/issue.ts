export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type IssuesResponse = {
  data: Issue[];
  meta: PaginationMeta;
};


export type Issue = {
  id: string;
  title: string;
  description: string;
  area: string;
  location: string;

  category: {
    id: string;
    name: string;
    slug: string;
  };

  author: {
    id: string;
    name: string;
  };

  moderationStatus: string;
  rejectionReason?: string | null;
  resolutionStatus: string;

  mergedIntoId: string | null;
  mergedIssueIds: string[];

  confirmationCount: number;
  confirmationLabel: string;
  guestConfirmationCount: number;
  guestConfirmationLabel: string;
  followerCount: number;

  publishedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;

  provenance: {
    resolutionStatus: string;
    confirmations: string;
    guestConfirmations: string;
  };

  viewer?: {
    isAuthor: boolean;
    hasConfirmed: boolean;
    isFollowing: boolean;
  };
};

export type CreateIssueRequest = {
  title: string;
  description: string;
  categoryId: string;
  area: string;
  location: string;
};

export type AdminIssuesResponse = {
  data: Issue[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};