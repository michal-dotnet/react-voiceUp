import { useEffect, useState } from "react";
import { getIssueImageFile } from "../services/issuesApi";
import useAuth from "../hooks/useAuth";

type ImageResult = { key: string; src?: string; error?: boolean };

const IssueImage = ({ url }: { url: string }) => {
  const { token } = useAuth();
  const [result, setResult] = useState<ImageResult>();

  // Each result is tied to the url + token it was loaded for, so a new url
  // shows "loading" without having to reset state inside the effect.
  const key = `${url}|${token ?? ""}`;

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;

    getIssueImageFile(url, token ?? undefined)
      .then((blob) => {
        const createdUrl = URL.createObjectURL(blob);

        if (active) {
          objectUrl = createdUrl;
          setResult({ key, src: createdUrl });
        } else {
          URL.revokeObjectURL(createdUrl);
        }
      })
      .catch(() => {
        if (active) {
          setResult({ key, error: true });
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token, key]);

  const current = result?.key === key ? result : undefined;

  if (current?.error) return <p>שגיאה בטעינת התמונה</p>;
  if (!current?.src) return <p>טוען תמונה...</p>;

  return <img src={current.src} alt="תמונת המפגע" width={250} />;
};

export default IssueImage;
