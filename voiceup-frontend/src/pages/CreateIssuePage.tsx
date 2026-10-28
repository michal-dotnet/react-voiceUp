import { useForm } from "react-hook-form";
import useCreateIssue from "../hooks/useCreateIssue";
import useCategories from "../hooks/useCategories";
import type { CreateIssueRequest } from "../types/issue";
import { useState } from "react";

const CreateIssuePage = () => {
    const { register, handleSubmit, formState: { errors } } = useForm<CreateIssueRequest>();

    const { mutate, isPending } = useCreateIssue();
    const [images, setImages] = useState<File[]>([]);
    const { data: categoriesResponse, isPending: categoriesPending, isError: categoriesError, } = useCategories();
const onSubmit = (data: CreateIssueRequest) => {
  mutate({ data, images });
};

    return (
        <main>
            <h1>יצירת דיווח חדש</h1>

            <form onSubmit={handleSubmit(onSubmit)}>


                <div>
                    <label htmlFor="title">כותרת</label>
                    <input
                        id="title"
                        {...register("title", { required: "יש להזין כותרת", minLength: { value: 5, message: "הכותרת חייבת להכיל לפחות 5 תווים", }, })}
                    />
                    {errors.title && <p>{errors.title.message}</p>}
                </div>

                <div>
                    <label htmlFor="description">תיאור המפגע</label>
                    <textarea
                        id="description"
                        {...register("description", {
                            required: "יש להזין תיאור", minLength: { value: 10, message: "התיאור חייב להכיל לפחות 10 תווים", },
                        })} />
                    {errors.description && <p>{errors.description.message}</p>}
                </div>

                <div>
                    <label htmlFor="area">אזור</label>
                    <input
                        id="area"
                        {...register("area", { required: "יש להזין אזור" })}
                    />
                    {errors.area && <p>{errors.area.message}</p>}
                </div>

                <div>
                    <label htmlFor="location">מיקום</label>
                    <input
                        id="location"
                        {...register("location", { required: "יש להזין מיקום" })}
                    />
                    {errors.location && <p>{errors.location.message}</p>}
                </div>

                <div>
                    <label htmlFor="images">תמונות המפגע (עד 5)</label>

                    <input
                        id="images"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);

                            const allowedTypes = [
                                "image/jpeg",
                                "image/png",
                                "image/webp",
                            ];

                            const valid = files.length <= 5 && files.every(
                                (file) =>
                                    allowedTypes.includes(file.type) &&
                                    file.size <= 5 * 1024 * 1024
                            );

                            if (!valid) {
                                alert("ניתן לבחור עד 5 תמונות JPG, PNG או WebP, עד 5MB לכל תמונה");
                                setImages([]);
                                event.target.value = "";
                                return;
                            }

                            setImages(files);
                        }}
                    />

                    {images.map((file, index) => (
                        <p className="vu-file-name" key={`${file.name}-${index}`}>🖼️ {file.name}</p>
                    ))}
                </div>

                <div>
                    <label htmlFor="categoryId">קטגוריה</label>
                    <select
                        id="categoryId"
                        defaultValue=""
                        disabled={categoriesPending || categoriesError}
                        {...register("categoryId", {
                            required: "יש לבחור קטגוריה",
                        })}
                    >
                        <option value="" disabled>
                            בחרי קטגוריה
                        </option>

                        {categoriesResponse?.data
                            .filter((category) => category.isActive)
                            .map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.name}
                                </option>
                            ))}
                    </select>


                    {categoriesPending && <p>טוען קטגוריות...</p>}
                    {categoriesError && <p>שגיאה בטעינת הקטגוריות</p>}
                    {errors.categoryId && <p>{errors.categoryId.message}</p>}
                </div>

                <button type="submit" disabled={isPending}>
                    {isPending ? "שולח דיווח..." : "שליחת דיווח"}
                </button>
            </form>
        </main>
    );
};

export default CreateIssuePage;