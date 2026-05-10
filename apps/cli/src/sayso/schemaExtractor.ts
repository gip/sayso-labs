import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type JsonSchema = Record<string, unknown>;

export type SchemaContentType = {
  authorityId: string;
  typeId: string;
  versionMajor: number;
  versionMinor?: number;
};

export type ExtractedSkillSchema = {
  id: string;
  schema: JsonSchema;
  sourcePath: string;
  contentType?: SchemaContentType;
  claimType?: string;
};

export type SkillSchemaCatalog = {
  schemas: ExtractedSkillSchema[];
  schemasById: Map<string, ExtractedSkillSchema>;
  contentTypeSchemas: Map<string, ExtractedSkillSchema>;
  claimSchemas: Map<string, ExtractedSkillSchema>;
};

export const DEFAULT_SCHEMA_SKILL_PATHS = [
  "skills/sayso-protocol/SKILL.md",
  "skills/sayso-payment/SKILL.md",
  "skills/sayso-network/SKILL.md",
  "skills/sayso-upgrade/SKILL.md",
  "skills/sayso-claim/SKILL.md",
  "skills/sayso-configure/SKILL.md",
  "skills/sayso-source/SKILL.md",
  "skills/sayso-fork/SKILL.md",
  "skills/sayso-runtime/SKILL.md",
  "examples/skills/pong/SKILL.md",
  "examples/skills/reference-implementations/SKILL.md",
];

export const schemaContentTypeKey = (contentType: SchemaContentType) =>
  `${contentType.authorityId}/${contentType.typeId}/${contentType.versionMajor}`;

export const findSkillSchemaRoot = () => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  const root = candidates.find(
    (candidate) =>
      existsSync(path.join(candidate, "skills/sayso-protocol/SKILL.md")) &&
      existsSync(path.join(candidate, "skills/sayso-payment/SKILL.md")),
  );
  if (!root) throw new Error("Unable to locate SaySo Labs skill schema root.");
  return root;
};

export const extractSkillSchemasFromMarkdown = (markdown: string, sourcePath: string): ExtractedSkillSchema[] => {
  const schemataIndex = markdown.search(/^## Schemata\s*$/m);
  if (schemataIndex < 0) return [];
  const schemataSection = markdown.slice(schemataIndex);
  const schemas: ExtractedSkillSchema[] = [];
  const blockPattern = /```json\s*\n([\s\S]*?)\n```/g;
  for (const match of schemataSection.matchAll(blockPattern)) {
    let schema: JsonSchema;
    try {
      schema = JSON.parse(match[1] ?? "") as JsonSchema;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON.";
      throw new Error(`${sourcePath}: invalid schema JSON block: ${message}`);
    }
    if (typeof schema.$id !== "string" || schema.$id.length === 0) {
      throw new Error(`${sourcePath}: schema block is missing string $id.`);
    }
    const contentType = isSchemaContentType(schema["x-sayso-content-type"]) ? schema["x-sayso-content-type"] : undefined;
    const claimType = typeof schema["x-sayso-claim-type"] === "string" ? schema["x-sayso-claim-type"] : undefined;
    schemas.push({
      id: schema.$id,
      schema,
      sourcePath,
      ...(contentType ? { contentType } : {}),
      ...(claimType ? { claimType } : {}),
    });
  }
  return schemas;
};

export const loadSkillSchemaCatalog = (input?: {
  root?: string;
  skillPaths?: string[];
}): SkillSchemaCatalog => {
  const root = input?.root ?? findSkillSchemaRoot();
  const skillPaths = input?.skillPaths ?? DEFAULT_SCHEMA_SKILL_PATHS;
  const schemas: ExtractedSkillSchema[] = [];
  for (const skillPath of skillPaths) {
    const fullPath = path.join(root, skillPath);
    if (!existsSync(fullPath)) continue;
    schemas.push(...extractSkillSchemasFromMarkdown(readFileSync(fullPath, "utf8"), skillPath));
  }

  const schemasById = new Map<string, ExtractedSkillSchema>();
  const contentTypeSchemas = new Map<string, ExtractedSkillSchema>();
  const claimSchemas = new Map<string, ExtractedSkillSchema>();
  for (const schema of schemas) {
    const existing = schemasById.get(schema.id);
    if (existing) {
      throw new Error(`Duplicate schema id ${schema.id} in ${existing.sourcePath} and ${schema.sourcePath}.`);
    }
    schemasById.set(schema.id, schema);
    if (schema.contentType) {
      const key = schemaContentTypeKey(schema.contentType);
      const existingContentType = contentTypeSchemas.get(key);
      if (existingContentType) {
        throw new Error(
          `Duplicate content type schema ${key} in ${existingContentType.sourcePath} and ${schema.sourcePath}.`,
        );
      }
      contentTypeSchemas.set(key, schema);
    }
    if (schema.claimType) {
      const existingClaim = claimSchemas.get(schema.claimType);
      if (existingClaim) {
        throw new Error(`Duplicate claim schema ${schema.claimType} in ${existingClaim.sourcePath} and ${schema.sourcePath}.`);
      }
      claimSchemas.set(schema.claimType, schema);
    }
  }
  return { schemas, schemasById, contentTypeSchemas, claimSchemas };
};

const isSchemaContentType = (value: unknown): value is SchemaContentType => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.authorityId === "string" &&
    typeof record.typeId === "string" &&
    Number.isInteger(record.versionMajor) &&
    (record.versionMinor === undefined || Number.isInteger(record.versionMinor))
  );
};
