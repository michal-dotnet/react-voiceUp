import { useState } from "react";
import type { Issue } from "../types/issue";
import { useChangeIssueStatus } from "../hooks/useChangeIssueStatus";
import {getResolutionLabel,nextResolutionStatus,statusRequiresSource,} from "../utils/resolutionStatus";
type StatusControlProps = {
  issue: Issue;
};

const StatusControl = ({ issue }: StatusControlProps) => {
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const { mutate: changeStatus, isPending, error, reset } = useChangeIssueStatus();

  const next = nextResolutionStatus[issue.resolutionStatus];

  if (!next) {
    return <p>הטיפול בדיווח הסתיים.</p>;
  }

  const needsSource = statusRequiresSource(next);
  const noteOk = note.trim().length >= 5;
  const sourceOk = !needsSource || source.trim().length > 0;

  const handleSubmit = ( e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!noteOk || !sourceOk) return;
    changeStatus(
      {
        issueId: issue.id,
        input: {
          toStatus: next,
          note: note.trim(),
          ...(needsSource && { source: source.trim() }),
        },
      },
      {
        onSuccess: () => {
          setNote("");
          setSource("");
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <p>
        העברה לשלב הבא: <strong>{getResolutionLabel(next)}</strong>
      </p>

      <label htmlFor={`note-${issue.id}`}>הערה (לפחות 5 תווים)</label>
      <textarea
        id={`note-${issue.id}`}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          if (error) reset();
        }}
        rows={2}
        maxLength={2000}
      />

      {needsSource && (
        <>
          <label htmlFor={`source-${issue.id}`}>
            מקור המידע (למשל: שיחת טלפון, ביקור בשטח)
          </label>
          <input
            id={`source-${issue.id}`}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              if (error) reset();
            }}
            maxLength={500}
          />
        </>
      )}

      <button type="submit" disabled={isPending || !noteOk || !sourceOk}>
        {isPending ? "מעדכן..." : `העבר ל"${getResolutionLabel(next)}"`}
      </button>

      {error && <p role="alert">שגיאה: {error.message}</p>}
    </form>
  );
};

export default StatusControl;
