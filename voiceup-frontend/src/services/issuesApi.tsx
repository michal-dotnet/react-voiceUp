import type { CreateIssueRequest, Issue, IssuesResponse } from "../types/issue";

const API_URL = import.meta.env.VITE_API_URL;

const getIssues = async (status: string,page: number): Promise<IssuesResponse> => {
  const params = new URLSearchParams({page: String(page),pageSize: "20",});

  if (status !== "ALL") {
    params.set("status", status);
  }

  const response = await fetch(`${API_URL}/issues?${params}`);

  if (!response.ok) {
    throw new Error("Failed to fetch issues");
  }

  return response.json();
};

 const getMyIssues = async (token: string): Promise<IssuesResponse> => {
  const response = await fetch(`${API_URL}/issues/mine`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch my issues");
  }

  return response.json();
};
const createIssue = async (data:CreateIssueRequest,token: string) => {
  const response = await fetch(`${API_URL}/issues`, {
    method:"POST",
    headers: {
     "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
            body: JSON.stringify(data), 
  });

  if (!response.ok) {
    throw new Error("Failed to fetch my issues");
  }

  return response.json();
};


 const uploadIssueImage = async (issueId: string,file: File,token: string) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(
    `${API_URL}/issues/${issueId}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error("Failed to upload issue image");
  }

  return response.json();
};

type Attachment = {
  id: string;
  url: string;
};

type AttachmentsResponse = {
  data: Attachment[];
};

const getIssueImages = async (
  issueId: string,
  token?: string
): Promise<AttachmentsResponse> => {
  const response = await fetch(
    `${API_URL}/issues/${issueId}/attachments`,
    {
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch issue images");
  }

  return response.json();
};

const getIssueImageFile = async (
  url: string,
  token?: string
): Promise<Blob> => {
  const apiOrigin = new URL(API_URL).origin;
  const imageUrl = new URL(url, apiOrigin);

  const response = await fetch(imageUrl, {
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {},
  });

  if (!response.ok) {
    throw new Error("Failed to load image");
  }

  return response.blob();
};
 const updateIssue = async (
  issueId: string,
  data: Partial<CreateIssueRequest>,
  token: string
): Promise<Issue> => {
  const response = await fetch(`${API_URL}/issues/${issueId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to update issue");
  }

  return response.json();
};

const confirmIssue = async (issueId: string, token: string | null) => {
  const response = await fetch(
    `${API_URL}/issues/${issueId}/confirmations`,
    {
      method: "POST",
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    }
  );

  if (!response.ok) {
    throw new Error("Failed to confirm issue");
  }

  return response.json();
};
export  {getIssues,getMyIssues,createIssue,uploadIssueImage,getIssueImages,getIssueImageFile,updateIssue ,confirmIssue}



