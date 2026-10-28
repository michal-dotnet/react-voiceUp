
 const resolutionStatusLabels: Record<string, string> = {
  OPEN: "פתוח",
  UNDER_REVIEW: "בבדיקה",
  REFERRED: "הועבר לגורם מטפל",
  IN_PROGRESS: "בטיפול",
  RESOLVED: "טופל בהצלחה!",
};

 const getResolutionLabel = (status: string) =>
  resolutionStatusLabels[status] ?? status;

 const nextResolutionStatus: Record<string, string | undefined> = {
  OPEN: "UNDER_REVIEW",
  UNDER_REVIEW: "IN_PROGRESS",
  REFERRED: "IN_PROGRESS",
  IN_PROGRESS: "RESOLVED",
};

 const statusRequiresSource = (status: string) =>
  status === "IN_PROGRESS" || status === "RESOLVED";

 export {resolutionStatusLabels,getResolutionLabel,nextResolutionStatus,statusRequiresSource}