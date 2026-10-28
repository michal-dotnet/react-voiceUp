import IssueCard from "../components/IssueCard";
import { useApproveIssue } from "../hooks/useApproveIssue";
import { useAdminIssues } from "../hooks/useManagerissue";
import { useRejectIssue } from "../hooks/useRejectIssue";
import { useAdminApprovedIssues } from "../hooks/useAdminApprovedIssues";
import StatusControl from "../components/StatusControl";

export default function AdminIssuesPage() {
    const { data, isLoading, isError } = useAdminIssues();
    const { mutate: approve, isPending, variables, } = useApproveIssue();
    const { mutate: reject } = useRejectIssue();
    const approved = useAdminApprovedIssues();

    const handleReject = (issueId: string) => {
        const reason = window.prompt("הכנס סיבת דחייה:");

        if (!reason?.trim()) return;

        reject({ issueId, reason: reason.trim() });
    };
    if (isLoading) {
        return <p>טוען דיווחים...</p>;
    }

    if (isError) {
        return <p>שגיאה בטעינת הדיווחים</p>;
    }

    const issues = data?.data ?? [];

    return (
        <main>
            <h1>ניהול דיווחים ממתינים</h1>

            <p>מספר דיווחים ממתינים: {data?.meta.total ?? 0}</p>

            {issues.length === 0 ? (
                <p>אין דיווחים שממתינים לאישור 🎉</p>
            ) : (
                <div className="vu-grid">
                    {issues.map((issue) => (
                        <div key={issue.id} className="vu-grid-item">
                            <IssueCard issue={issue} />
                            <button
                                type="button"
                                onClick={() => approve(issue.id)}
                                disabled={isPending}
                            >
                                {isPending && variables === issue.id ? "מאשר..." : "✅ אישור"}

                            </button>
                            <button
                                type="button"
                                onClick={() => handleReject(issue.id)}
                            >
                                ❌ דחייה
                            </button>
                        </div>

                    ))}

                </div>
            )}

            <h2>ניהול טיפול בדיווחים מאושרים</h2>

            {approved.isLoading && <p>טוען דיווחים מאושרים...</p>}
            {approved.isError && <p>שגיאה בטעינת הדיווחים המאושרים</p>}
            {approved.data && approved.data.data.length === 0 && (
                <p>אין דיווחים מאושרים.</p>
            )}
            {approved.data && approved.data.data.length > 0 && (
                <div className="vu-grid">
                    {approved.data.data.map((issue) => (
                        <div key={issue.id} className="vu-grid-item">
                            <IssueCard issue={issue} />
                            <StatusControl issue={issue} />
                        </div>
                    ))}
                </div>
            )}
        </main>
    );
}
