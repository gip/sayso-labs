export const extractFrontmatterDescription = (content: string) => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return "";
  const line = match[1]
    .split(/\r?\n/)
    .find((candidate) => candidate.trimStart().startsWith("description:"));
  if (!line) return "";
  return line
    .replace(/^\s*description:\s*/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
};

export const contentTypeName = (contentType: { authorityId: string; typeId: string; versionMajor: number }) =>
  `${contentType.authorityId}/${contentType.typeId}/${contentType.versionMajor}`;
