
import { Link } from "react-router";
import type { Issue } from "../types/issue";
import IssueImages from "./IssueImages";
import { useConfirmIssue } from "../hooks/useConfirmIssue";
import { useState } from "react";
import IssueComments from "./IssueComments";
import { getResolutionLabel } from "../utils/resolutionStatus";
import TiltCard from "./design/TiltCard";

const getModerationLabel = (status: string) => {
  switch (status) {
    case "PENDING_REVIEW":
      return "ממתין לאישור מנהל";
    case "APPROVED":
      return "מאושר";
    case "REJECTED":
      return "נדחה";
    default:
      return status;
  }
};

type IssueCardProps = {
  issue: Issue;
  canEdit?: boolean;
};

const IssueCard = ({ issue, canEdit = false }: IssueCardProps) => {
  const [disabled, setDisabled] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const { mutate: confirm, isPending } = useConfirmIssue();

  return (
    <TiltCard>
      <h2>{issue.title}</h2>
      <p className="vu-desc">{issue.description}</p>
      <p className="vu-meta vu-meta-category">קטגוריה: {issue.category.name}</p>
      <p className="vu-meta vu-meta-area">אזור: {issue.area}</p>
      <p className="vu-meta vu-meta-location">מיקום: {issue.location}</p>

      {issue.moderationStatus === "APPROVED" && (
        <p className={`vu-status vu-status-${issue.resolutionStatus}`}>סטטוס טיפול: {getResolutionLabel(issue.resolutionStatus)}</p>
      )}

      <IssueImages issueId={issue.id} />

      {issue.moderationStatus === "APPROVED" && (
        <button
          type="button"
          className="vu-thumb"
          disabled={disabled || isPending}
          onClick={() => {
            setDisabled(true);
            confirm(issue.id);
          }}
        >
          👍 אישור {issue.confirmationCount + issue.guestConfirmationCount}
        </button>
      )}    
      
{issue.moderationStatus === "APPROVED" && (
  <>
    <button
      type="button"
      aria-expanded={showComments}
      onClick={() => setShowComments((prev) => !prev)}
    >
      {showComments ? "הסתר תגובות" : "הצג תגובות"}
    </button>

    {showComments && <IssueComments issueId={issue.id} />}
  </>
)}
      {canEdit && issue.moderationStatus === "PENDING_REVIEW" && (
        <Link className="vu-btn" to={`/issues/${issue.id}/edit`}>
          עריכת דיווח
        </Link>
      )}

      {issue.moderationStatus === "REJECTED" &&
        issue.rejectionReason && (
          <section className="vu-rejected">
            <strong>❌ הדיווח נדחה</strong>
            <p>הסיבה: {issue.rejectionReason}</p>
          </section>
        )}

      {canEdit && (
        <p>סטטוס: {getModerationLabel(issue.moderationStatus)}</p>
      )}
    </TiltCard>
  );
};

export default IssueCard;
