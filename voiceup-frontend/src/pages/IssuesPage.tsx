import { useState } from "react";
import IssueCard from "../components/IssueCard";
import useIssues from "../hooks/useIssues";

const IssuesPage = () => {
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = useIssues(selectedStatus, page);
  if (isPending) {
    return <p>טוען דיווחים...</p>;
  }

  if (isError) {
    return <p>שגיאה בטעינת הדיווחים</p>;
  }


  return (
    <div>
      <h1>רשימת דיווחים</h1>

      <label htmlFor="statusFilter">סינון לפי סטטוס:</label>
      <select
        id="statusFilter"
        value={selectedStatus}
        onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}      >
        <option value="ALL">כל הדיווחים</option>
        <option value="OPEN">פתוח</option>
        <option value="UNDER_REVIEW">בבדיקה</option>
        <option value="REFERRED">הועבר לגורם מטפל</option>
        <option value="IN_PROGRESS">בטיפול</option>
        <option value="RESOLVED">טופל בהצלחה</option>
      </select>
      {data.data.length === 0 ? (
        <p>אין דיווחים בסטטוס שנבחר</p>
      ) : (
        <div className="vu-grid">
          {data.data.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}
      <div className="vu-pagination">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((prev) => prev - 1)}
        >
          הקודם
        </button>

        <span> עמוד {page} מתוך {data.meta.totalPages} </span>

        <button
          type="button"
          disabled={page >= data.meta.totalPages}
          onClick={() => setPage((prev) => prev + 1)}
        >
          הבא
        </button>
      </div>
    </div>
  );
};
export default IssuesPage;