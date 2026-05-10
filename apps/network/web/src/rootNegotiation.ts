export const shouldServeRootMarkdown = (acceptHeader: string | string[] | undefined) => {
  const accept = Array.isArray(acceptHeader) ? acceptHeader.join(",") : acceptHeader ?? "";
  return !accept.toLowerCase().split(",").some((value) => value.split(";")[0]?.trim() === "text/html");
};
