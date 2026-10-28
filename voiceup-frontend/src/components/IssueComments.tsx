import { useIssueComments } from "../hooks/useIssueComments";
import { useAddComment } from "../hooks/useAddComment";
import useAuth from "../hooks/useAuth";
import { useState } from "react";
import { Link } from "react-router";

type Props = {
    issueId: string;
};

export default function IssueComments({ issueId }: Props) {
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, isError, } = useIssueComments(issueId);
    const [commentText, setCommentText] = useState("");
    const { token } = useAuth();
    const addCommentMutation = useAddComment(issueId);


    const comments = data?.pages.flatMap(
        (page) => page.data
    ) ?? [];


    const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        const body = commentText.trim();
        if (!token || !body || addCommentMutation.isPending) return;
        addCommentMutation.mutate(body, {
            onSuccess: () => {
                setCommentText("");
            },
        });
    };
        if (isPending) return <p>טוען תגובות...</p>;
    if (isError) return <p>שגיאה בטעינת התגובות</p>;
    return (
        <section>
            <h3>תגובות</h3>

            {comments.length === 0 && <p>אין תגובות עדיין</p>}

            {comments.map((comment) => (
                <div key={comment.id}>
                    <strong>{comment.author.name}</strong>
                    <p>{comment.body}</p>
                </div>
            ))}
            {token ? (
                <form onSubmit={handleSubmit}>
                    <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="כתוב תגובה..."
                        aria-label="תוכן התגובה"
                        required
                    />

                    <button
                        type="submit"
                        disabled={!commentText.trim() || addCommentMutation.isPending}
                    >
                        {addCommentMutation.isPending ? "שולח..." : "שליחת תגובה"}
                    </button>

                    {addCommentMutation.isError && (
                        <p role="alert">שליחת התגובה נכשלה. נסי שוב.</p>
                    )}
                </form>
            ) : (
                <Link to="/Register">יש להירשם כדי לכתוב תגובה.</Link>
            )}

            {hasNextPage && (
                <button
                    type="button"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                >
                    {isFetchingNextPage ? "טוען..." : "טען עוד תגובות"}
                </button>
            )}
        </section>
    );
}