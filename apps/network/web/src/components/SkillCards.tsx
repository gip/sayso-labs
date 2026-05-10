import type { SaySoSkillDocument } from "@sayso-labs/protocol/browser";
import type { RegisteredSkillStatus } from "../types.js";
import { extractFrontmatterDescription } from "./util.js";

export function SkillCards({
  skills,
  renderCard,
}: {
  skills: SaySoSkillDocument[];
  renderCard: (skill: SaySoSkillDocument) => React.ReactNode;
}) {
  if (skills.length === 0) return <p className="description">No skill documents were provided.</p>;
  return <div className="skill-card-grid">{skills.map((skill) => renderCard(skill))}</div>;
}

const skillStatusLabel: Record<RegisteredSkillStatus["status"], string> = {
  reference: "Reference",
  modified: "Modified",
  custom: "Custom",
};

export function SkillCardContent({ skill, status }: { skill: SaySoSkillDocument; status?: RegisteredSkillStatus }) {
  const description = extractFrontmatterDescription(skill.content);
  const capabilityCount = skill.skill.capabilities.length;
  return (
    <>
      <span className="skill-card-topline">
        <span className="badge">{skill.kind}</span>
        {status ? (
          <span className={`skill-status skill-status--${status.status}`}>{skillStatusLabel[status.status]}</span>
        ) : null}
      </span>
      <strong>{skill.name}</strong>
      <span className="skill-card-id">
        {skill.skillId}@{skill.version}
      </span>
      {description ? <span className="skill-card-description">{description}</span> : null}
      <span className="skill-card-footer">
        {capabilityCount.toLocaleString()} structured {capabilityCount === 1 ? "capability" : "capabilities"}
      </span>
    </>
  );
}
