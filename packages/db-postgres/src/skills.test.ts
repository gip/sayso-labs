import { describe, expect, it } from "vitest";
import { protocolSkillDocument, type SaySoSkillDocument } from "@sayso-labs/protocol";
import {
  canonicalJson,
  referenceSkillSeeds,
  referenceSkillStatuses,
  skillDocumentName,
  skillDocumentSha256,
  skillPacketForStorage,
} from "./skills.js";

describe("skill catalog helpers", () => {
  it("canonicalizes objects by key order before hashing", () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 1 }));
  });

  it("hashes the whole skill document", () => {
    const skill = protocolSkillDocument();
    const modifiedContent: SaySoSkillDocument = { ...skill, content: `${skill.content}\nModified.` };
    const modifiedContract: SaySoSkillDocument = {
      ...skill,
      skill: {
        ...skill.skill,
        capabilities: [{ ...skill.skill.capabilities[0], title: "Changed title" }, ...skill.skill.capabilities.slice(1)],
      },
    };

    expect(skillDocumentSha256(modifiedContent)).not.toBe(skillDocumentSha256(skill));
    expect(skillDocumentSha256(modifiedContract)).not.toBe(skillDocumentSha256(skill));
  });

  it("classifies reference, modified, and custom skills", () => {
    const reference = protocolSkillDocument();
    const modified: SaySoSkillDocument = { ...reference, content: `${reference.content}\nModified.` };
    const custom: SaySoSkillDocument = { ...reference, skillId: "sayso.custom", name: "Custom Skill" };

    expect(referenceSkillStatuses([reference, modified, custom]).map((status) => status.status)).toEqual([
      "reference",
      "modified",
      "custom",
    ]);
  });

  it("builds seed rows for built-in reference skills", () => {
    expect(referenceSkillSeeds()).toContainEqual(expect.objectContaining({
      name: "sayso.protocol@0.1.0",
      skillId: "sayso.protocol",
      version: "0.1.0",
      isReference: true,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it("names skill documents by skill id and version", () => {
    expect(skillDocumentName(protocolSkillDocument())).toBe("sayso.protocol@0.1.0");
  });

  it("stores registration skill packets without duplicated skill documents", () => {
    const skill = protocolSkillDocument();
    const packet = skillPacketForStorage({
      agent: {
        agentId: "agent",
        syncInboxId: "inbox",
        displayName: "Agent",
        kind: "agent",
        protocolVersion: "0.1.0",
      },
      skill: {
        capabilities: [],
        contentTypes: [],
        channels: [],
        paymentPolicies: [],
      },
      skills: [skill],
      resolution: {
        mode: "all",
        includedSkillIds: [skill.skillId],
        dependencyOrder: [skill.skillId],
      },
      content: "",
      mediaType: "application/json",
    });

    expect(packet?.skills).toEqual([]);
  });
});
