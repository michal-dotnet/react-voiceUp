const API_URL = import.meta.env.VITE_API_URL;

const getAdminIssues = async (token: string) => {
  const response = await fetch(`${API_URL}/admin/issues`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch admin issues");
  }

  return response.json();
};
const approveIssue = async (id: string, token: string) => {
  const response = await fetch(`${API_URL}/admin/issues/${id}/approve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error("Failed to approve issue");
  }
};

const rejectIssue = async (
  issueId: string,
  reason: string,
  token: string
) => {
  const response = await fetch(
    `${API_URL}/admin/issues/${issueId}/reject`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  );

  if (!response.ok) {
    throw new Error("Failed to reject issue");
  }

  return response.json();
};
const getAdminApprovedIssues = async (token: string) => {
  const response = await fetch(
    `${API_URL}/admin/issues?moderationStatus=APPROVED&pageSize=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch approved issues");
  }

  return response.json();
};

type ChangeStatusInput = {
  toStatus: string;
  note: string;
  source?: string;
};

const changeIssueStatus = async (issueId: string, input: ChangeStatusInput, token: string) => {
  const response = await fetch(`${API_URL}/admin/issues/${issueId}/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Failed to change issue status");
  }

  return response.json();
};
export { getAdminIssues, approveIssue, rejectIssue, getAdminApprovedIssues, changeIssueStatus }
export type { ChangeStatusInput }
