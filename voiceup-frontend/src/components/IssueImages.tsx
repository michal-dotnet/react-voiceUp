import { useEffect, useState } from "react";
import useIssueImages from "../hooks/useIssueImages";
import IssueImage from "./IssueImage";

/** The images of an issue as a slideshow: one image at a time, changing every 3 seconds. */
const IssueImages = ({ issueId }: { issueId: string }) => {
  const { data, isPending, isError } = useIssueImages(issueId);
  const [current, setCurrent] = useState(0);
  const count = data?.data.length ?? 0;

  useEffect(() => {
    if (count < 2) return;

    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % count);
    }, 3000);

    return () => clearInterval(timer);
  }, [count]);

  if (isPending) return <p>טוען תמונות...</p>;
  if (isError) return <p>שגיאה בטעינת התמונות</p>;
  if (!data.data.length) return null;

  const active = current % count;

  return (
    <div className="vu-slides">
      {data.data.map((image, index) => (
        <div key={image.id} className={index === active ? "vu-slide active" : "vu-slide"}>
          <IssueImage url={image.url} />
        </div>
      ))}

      {count > 1 && (
        <>
          <span className="vu-slide-count">
            {active + 1}/{count}
          </span>
          <div className="vu-dots">
            {data.data.map((image, index) => (
              <button
                key={image.id}
                type="button"
                className={index === active ? "active" : ""}
                aria-label={`תמונה ${index + 1}`}
                onClick={() => setCurrent(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default IssueImages;
