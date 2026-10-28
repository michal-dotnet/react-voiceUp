import { useParams, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import useMyIssues from "../hooks/useMyIssues";
import useUpdateIssue from "../hooks/useUpdateIssue";
import type { CreateIssueRequest } from "../types/issue";
import { useQueryClient } from "@tanstack/react-query";

const EditIssuePage = () => {
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isPending, isError } = useMyIssues();
  const { mutate, isPending: isSaving } = useUpdateIssue();

  const issue = data?.data.find((item) => item.id === id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateIssueRequest>();

  useEffect(() => {
    if (issue) {
      reset({
        title: issue.title,
        description: issue.description,
        area: issue.area,
        location: issue.location,
        categoryId: issue.category.id,
      });
    }
  }, [issue, reset]);

  if (isPending) return <p>טוען דיווח...</p>;
  if (isError) return <p>שגיאה בטעינת הדיווח</p>;
  if (!issue) return <p>הדיווח לא נמצא</p>;

  if (issue.moderationStatus !== "PENDING_REVIEW") {
    return <p>לא ניתן לערוך דיווח שכבר נבדק</p>;
  }

  const onSubmit = (values: CreateIssueRequest) => {
    if (!id) return;

    mutate(
      { issueId: id, data: values },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: ["myIssues"],
            refetchType: "all",
          });

          navigate("/my-issues");
        },
      }
    );
  };

  return (
    <main>
      <h1>עריכת דיווח</h1>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="title">כותרת</label>
          <input
            id="title"
            {...register("title", {
              required: "יש להזין כותרת",
              minLength: { value: 5, message: "לפחות 5 תווים" },
            })}
          />
          {errors.title && <p>{errors.title.message}</p>}
        </div>

        <div>
          <label htmlFor="description">תיאור</label>
          <textarea
            id="description"
            {...register("description", {
              required: "יש להזין תיאור",
              minLength: { value: 10, message: "לפחות 10 תווים" },
            })}
          />
          {errors.description && <p>{errors.description.message}</p>}
        </div>

        <div>
          <label htmlFor="area">אזור</label>
          <input
            id="area"
            {...register("area", {
              required: "יש להזין אזור",
              minLength: { value: 2, message: "לפחות 2 תווים" },
            })}
          />
          {errors.area && <p>{errors.area.message}</p>}
        </div>

        <div>
          <label htmlFor="location">מיקום</label>
          <input
            id="location"
            {...register("location", {
              required: "יש להזין מיקום",
            })}
          />
          {errors.location && <p>{errors.location.message}</p>}
        </div>

        <button type="submit" disabled={isSaving}>
          {isSaving ? "שומר שינויים..." : "שמירת שינויים"}
        </button>

        <button type="button" onClick={() => navigate("/my-issues")}>
          ביטול
        </button>
      </form>
    </main>
  );
};

export default EditIssuePage;