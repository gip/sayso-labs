import { createHash } from "node:crypto";
import {
  claimSkillDocument,
  networkSkillDocument,
  protocolSkillDocument,
  type SkillPacket,
  type SaySoSkillDocument,
} from "@sayso-labs/protocol";
import type { RegisteredSkillStatus } from "./types.js";

export type ReferenceSkillSeed = {
  name: string;
  skillId: string;
  version: string;
  displayName: string;
  sha256: string;
  document: SaySoSkillDocument;
  isReference: true;
};

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));

export const skillDocumentSha256 = (skill: SaySoSkillDocument) =>
  createHash("sha256").update(canonicalJson(skill), "utf8").digest("hex");

export const skillDocumentName = (skill: Pick<SaySoSkillDocument, "skillId" | "version">) =>
  `${skill.skillId}@${skill.version}`;

export const referenceSkillDocuments = (): SaySoSkillDocument[] => [
  protocolSkillDocument(),
  networkSkillDocument(),
  claimSkillDocument(true),
];

export const referenceSkillSeeds = (): ReferenceSkillSeed[] =>
  referenceSkillDocuments().map((skill) => ({
    name: skillDocumentName(skill),
    skillId: skill.skillId,
    version: skill.version,
    displayName: skill.name,
    sha256: skillDocumentSha256(skill),
    document: skill,
    isReference: true,
  }));

export const referenceSkillStatuses = (skills: SaySoSkillDocument[]): RegisteredSkillStatus[] => {
  const references = new Map(
    referenceSkillSeeds().map((skill) => [skill.name, skill.sha256]),
  );
  return skills.map((skill) => {
    const sha256 = skillDocumentSha256(skill);
    const referenceSha256 = references.get(`${skill.skillId}@${skill.version}`);
    return {
      name: skillDocumentName(skill),
      skillId: skill.skillId,
      version: skill.version,
      displayName: skill.name,
      sha256,
      status: referenceSha256 ? (referenceSha256 === sha256 ? "reference" : "modified") : "custom",
      ...(referenceSha256 ? { referenceSha256 } : {}),
    };
  });
};

export const skillPacketForStorage = (skillPacket?: SkillPacket): SkillPacket | undefined =>
  skillPacket ? { ...skillPacket, skills: [] } : undefined;

export const skillPacketWithDocuments = (skillPacket: SkillPacket, skills: SaySoSkillDocument[]): SkillPacket => ({
  ...skillPacket,
  skills,
});
