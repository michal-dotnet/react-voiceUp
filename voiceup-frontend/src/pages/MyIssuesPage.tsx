import useMyIssues from "../hooks/useMyIssues";
import useAuth from "../hooks/useAuth";
import IssueCard from "../components/IssueCard";

const MyIssuesPage = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { data, isPending, isError } = useMyIssues();

  if (isLoading) {
    return <p>בודק התחברות...</p>;
  }

  if (!isAuthenticated) {
    return <p>יש להתחבר כדי לצפות בדיווחים שלך.</p>;
  }

  if (isPending) {
    return <p>טוען את הדיווחים שלך...</p>;
  }

  if (isError) {
    return <p>אירעה שגיאה בטעינת הדיווחים.</p>;
  }

  return (
    <main>
      <h1>הדיווחים שלי</h1>

      {data.data.length === 0 ? (
        <p>עדיין לא יצרת דיווחים.</p>
      ) : (
        <div className="vu-grid">
          {data.data.map((issue) => (
            <IssueCard key={issue.id} issue={issue} canEdit />
          ))}
        </div>
      )}
    </main>
  );
};

export default MyIssuesPage;