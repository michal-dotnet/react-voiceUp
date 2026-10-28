import { useEffect, useState } from "react";
import { getIssueImageFile } from "../services/issuesApi";
import useAuth from "../hooks/useAuth";

const IssueImage = ({ url }: { url: string }) => {
  const { token } = useAuth();
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;

    setSrc(undefined);
    setError(false);

    getIssueImageFile(url, token ?? undefined)
      .then((blob) => {
        const createdUrl = URL.createObjectURL(blob);

        if (active) {
          objectUrl = createdUrl;
          setSrc(createdUrl);
        } else {
          URL.revokeObjectURL(createdUrl);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  if (error) return <p>שגיאה בטעינת התמונה</p>;
  if (!src) return <p>טוען תמונה...</p>;

  return <img src={src} alt="תמונת המפגע" width={250} />;
};

export default IssueImage;