import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { NetworkAgentRecord, RegistrationWrite, SkillPacket, SaySoSkillDocument } from "@sayso-labs/protocol";
import {
  skillDocumentName,
  skillDocumentSha256,
  skillPacketForStorage,
  skillPacketWithDocuments,
} from "./skills.js";
import type {
  ClaimWrite,
  ListAgentsInput,
  ListAgentsResult,
  RegisteredSkillStatus,
  RegistryRepository,
  RegistryStats,
  WebListAgentsResult,
  WebNetworkAgentRecord,
} from "./types.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ v: 1, offset }), "utf8").toString("base64url");

const decodeCursor = (cursor?: string) => {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown };
    return typeof parsed.offset === "number" && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
};

type RegistrationRow = QueryResultRow & {
  registration_id: string;
  agent_id: string;
  sync_inbox_id: string;
  wallet_address: string | null;
  display_name: string;
  protocol_version: string;
  visibility: "public" | "private";
  listing_tier: "standard" | "premium";
  description: string;
  skill_disclosure: "summary-only" | "include-skill-packet";
  skill_packet: SkillPacket | null;
  claim_types: string[];
  connection_count: number | string | null;
  expires_at: Date | string | null;
  premium_expires_at: Date | string | null;
  updated_at: Date | string;
};

const dateToIso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

type Queryable = Pick<Pool | PoolClient, "query">;

type SkillDocumentRow = QueryResultRow & {
  registration_id: string;
  position: number | string;
  document: SaySoSkillDocument;
};

type SkillStatusRow = QueryResultRow & {
  registration_id: string;
  name: string;
  skill_id: string;
  version: string;
  display_name: string;
  sha256: string;
  is_reference: boolean;
  reference_sha256: string | null;
};

const registrationsWithConnectionCounts = `
  SELECT
    r.*,
    COALESCE(c.connection_count, 0)::int AS connection_count
  FROM registrations r
  LEFT JOIN (
    SELECT lower(agent_address) AS agent_address_key, COUNT(*)::int AS connection_count
    FROM connection_claims
    WHERE claim_type = 'sayso.claim.agent-connection'
      AND status = 'verified'
      AND agent_address IS NOT NULL
    GROUP BY lower(agent_address)
  ) c ON lower(r.wallet_address) = c.agent_address_key
`;

const isFutureIso = (value?: string) => value !== undefined && new Date(value).getTime() > Date.now();

const toRecord = (row: RegistrationRow, linkedSkills?: SaySoSkillDocument[]): NetworkAgentRecord => {
  const premiumExpiresAt = row.premium_expires_at ? dateToIso(row.premium_expires_at) : undefined;
  const activePremium = row.listing_tier === "premium" && isFutureIso(premiumExpiresAt);
  return {
    registrationId: row.registration_id,
    walletAddress: row.wallet_address ?? "",
    agent: {
      agentId: row.agent_id,
      syncInboxId: row.sync_inbox_id,
      displayName: row.display_name,
      protocolVersion: row.protocol_version,
    },
    visibility: row.visibility,
    listingTier: activePremium ? "premium" : "standard",
    description: row.description,
    skillDisclosure: row.skill_disclosure,
    claimTypes: row.claim_types ?? [],
    connectionCount: Number(row.connection_count ?? 0),
    ...(row.skill_disclosure === "include-skill-packet" && row.skill_packet
      ? { skillPacket: linkedSkills ? skillPacketWithDocuments(row.skill_packet, linkedSkills) : row.skill_packet }
      : {}),
    updatedAt: dateToIso(row.updated_at),
    ...(row.expires_at ? { expiresAt: dateToIso(row.expires_at) } : {}),
    ...(activePremium && premiumExpiresAt ? { premiumExpiresAt } : {}),
  };
};

const groupSkillDocumentsByRegistration = async (queryable: Queryable, registrationIds: string[]) => {
  const grouped = new Map<string, SaySoSkillDocument[]>();
  if (registrationIds.length === 0) return grouped;
  const rows = (await queryable.query<SkillDocumentRow>(
    `
      SELECT rs.registration_id, rs.position, sd.document
      FROM registration_skills rs
      JOIN skill_documents sd ON sd.id = rs.skill_document_id
      WHERE rs.registration_id = ANY($1::text[])
      ORDER BY rs.registration_id, rs.position
    `,
    [registrationIds],
  )).rows;
  for (const row of rows) {
    const skills = grouped.get(row.registration_id) ?? [];
    skills.push(row.document);
    grouped.set(row.registration_id, skills);
  }
  return grouped;
};

const toSkillStatus = (row: SkillStatusRow): RegisteredSkillStatus => ({
  name: row.name,
  skillId: row.skill_id,
  version: row.version,
  displayName: row.display_name,
  sha256: row.sha256,
  status: row.is_reference ? "reference" : row.reference_sha256 ? "modified" : "custom",
  ...(row.reference_sha256 ? { referenceSha256: row.reference_sha256 } : {}),
});

const groupSkillStatusesByRegistration = async (queryable: Queryable, registrationIds: string[]) => {
  const grouped = new Map<string, RegisteredSkillStatus[]>();
  if (registrationIds.length === 0) return grouped;
  const rows = (await queryable.query<SkillStatusRow>(
    `
      SELECT
        rs.registration_id,
        sd.name,
        sd.skill_id,
        sd.version,
        sd.display_name,
        sd.sha256,
        sd.is_reference,
        ref.sha256 AS reference_sha256
      FROM registration_skills rs
      JOIN skill_documents sd ON sd.id = rs.skill_document_id
      LEFT JOIN skill_documents ref ON ref.name = sd.name AND ref.is_reference
      WHERE rs.registration_id = ANY($1::text[])
      ORDER BY rs.registration_id, rs.position
    `,
    [registrationIds],
  )).rows;
  for (const row of rows) {
    const statuses = grouped.get(row.registration_id) ?? [];
    statuses.push(toSkillStatus(row));
    grouped.set(row.registration_id, statuses);
  }
  return grouped;
};

const recordsFromRows = async (queryable: Queryable, rows: RegistrationRow[]) => {
  const linkedSkills = await groupSkillDocumentsByRegistration(queryable, rows.map((row) => row.registration_id));
  return rows.map((row) => {
    const skills = linkedSkills.get(row.registration_id);
    return toRecord(row, skills && skills.length > 0 ? skills : undefined);
  });
};

const webRecordsFromRows = async (queryable: Queryable, rows: RegistrationRow[]) => {
  const records = await recordsFromRows(queryable, rows);
  const statuses = await groupSkillStatusesByRegistration(queryable, rows.map((row) => row.registration_id));
  return records.map((record): WebNetworkAgentRecord => ({
    ...record,
    ...(statuses.get(record.registrationId)?.length ? { skillStatuses: statuses.get(record.registrationId) } : {}),
  }));
};

export class PgRegistryRepository implements RegistryRepository {
  constructor(private readonly pool: Pool) {}

  async health() {
    await this.pool.query("SELECT 1");
  }

  async stats(): Promise<RegistryStats> {
    const result = await this.pool.query<{
      total: string;
      public: string;
      private: string;
      disclosed_skill_packet: string;
      premium: string;
    }>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE visibility = 'public')::text AS public,
        COUNT(*) FILTER (WHERE visibility = 'private')::text AS private,
        COUNT(*) FILTER (WHERE skill_disclosure = 'include-skill-packet')::text AS disclosed_skill_packet,
        COUNT(*) FILTER (WHERE listing_tier = 'premium' AND premium_expires_at > now())::text AS premium
      FROM registrations
      WHERE expires_at IS NULL OR expires_at > now()
    `);
    const row = result.rows[0] ?? { total: "0", public: "0", private: "0", disclosed_skill_packet: "0", premium: "0" };
    return {
      total: Number(row.total),
      public: Number(row.public),
      private: Number(row.private),
      disclosedSkillPacket: Number(row.disclosed_skill_packet),
      premium: Number(row.premium),
    };
  }

  async listPublicAgents(input: ListAgentsInput): Promise<ListAgentsResult> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = decodeCursor(input.cursor);
    const values: unknown[] = [];
    const where = ["visibility = 'public'", "(expires_at IS NULL OR expires_at > now())"];
    if (input.query) {
      values.push(`%${input.query}%`);
      where.push(`(agent_id ILIKE $${values.length} OR display_name ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }
    if (input.skillIds?.length) {
      values.push(input.skillIds);
      where.push(`skill_ids @> $${values.length}::text[]`);
    }
    if (input.capabilityIds?.length) {
      values.push(input.capabilityIds);
      where.push(`capability_ids @> $${values.length}::text[]`);
    }
    values.push(limit + 1, offset);
    const rows = (await this.pool.query<RegistrationRow>(
      `
        ${registrationsWithConnectionCounts}
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE WHEN listing_tier = 'premium' AND premium_expires_at > now() THEN 0 ELSE 1 END,
          updated_at DESC,
          registration_id ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    )).rows;
    const page = rows.slice(0, limit);
    return {
      results: await recordsFromRows(this.pool, page),
      ...(rows.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
    };
  }

  async listPublicAgentsForWeb(input: ListAgentsInput): Promise<WebListAgentsResult> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = decodeCursor(input.cursor);
    const values: unknown[] = [];
    const where = ["visibility = 'public'", "(expires_at IS NULL OR expires_at > now())"];
    if (input.query) {
      values.push(`%${input.query}%`);
      where.push(`(agent_id ILIKE $${values.length} OR display_name ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }
    if (input.skillIds?.length) {
      values.push(input.skillIds);
      where.push(`skill_ids @> $${values.length}::text[]`);
    }
    if (input.capabilityIds?.length) {
      values.push(input.capabilityIds);
      where.push(`capability_ids @> $${values.length}::text[]`);
    }
    values.push(limit + 1, offset);
    const rows = (await this.pool.query<RegistrationRow>(
      `
        ${registrationsWithConnectionCounts}
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE WHEN listing_tier = 'premium' AND premium_expires_at > now() THEN 0 ELSE 1 END,
          updated_at DESC,
          registration_id ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    )).rows;
    const page = rows.slice(0, limit);
    return {
      results: await webRecordsFromRows(this.pool, page),
      ...(rows.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
    };
  }

  async getPublicAgentById(agentId: string) {
    const result = await this.pool.query<RegistrationRow>(
      `
        ${registrationsWithConnectionCounts}
        WHERE agent_id = $1 AND visibility = 'public' AND (expires_at IS NULL OR expires_at > now())
      `,
      [agentId],
    );
    return (await recordsFromRows(this.pool, result.rows))[0] ?? null;
  }

  async getPublicAgentByIdForWeb(agentId: string) {
    const result = await this.pool.query<RegistrationRow>(
      `
        ${registrationsWithConnectionCounts}
        WHERE agent_id = $1 AND visibility = 'public' AND (expires_at IS NULL OR expires_at > now())
      `,
      [agentId],
    );
    return (await webRecordsFromRows(this.pool, result.rows))[0] ?? null;
  }

  async findByAgentId(agentId: string) {
    const result = await this.pool.query<RegistrationRow>(
      `
        ${registrationsWithConnectionCounts}
        WHERE agent_id = $1
      `,
      [agentId],
    );
    return (await recordsFromRows(this.pool, result.rows))[0] ?? null;
  }

  async findByWalletAddressAndAgentId(walletAddress: string, agentId: string) {
    const result = await this.pool.query<RegistrationRow>(
      `
        ${registrationsWithConnectionCounts}
        WHERE lower(wallet_address) = lower($1) AND agent_id = $2
      `,
      [walletAddress, agentId],
    );
    return (await recordsFromRows(this.pool, result.rows))[0] ?? null;
  }

  async findBySyncInboxId(syncInboxId: string) {
    const result = await this.pool.query<RegistrationRow>(
      `
        ${registrationsWithConnectionCounts}
        WHERE sync_inbox_id = $1
      `,
      [syncInboxId],
    );
    return (await recordsFromRows(this.pool, result.rows))[0] ?? null;
  }

  async upsertRegistrationBySyncInbox(write: RegistrationWrite) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<RegistrationRow>(
        `
          INSERT INTO registrations (
            registration_id,
            agent_id,
            sync_inbox_id,
            wallet_address,
            display_name,
            protocol_version,
            visibility,
            listing_tier,
            description,
            skill_disclosure,
            skill_packet,
            skill_ids,
            capability_ids,
            claim_types,
            extensions,
            expires_at,
            premium_expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::text[], $13::text[], $14::text[], $15::jsonb, $16, $17)
          ON CONFLICT (sync_inbox_id) DO UPDATE SET
            agent_id = EXCLUDED.agent_id,
            wallet_address = EXCLUDED.wallet_address,
            display_name = EXCLUDED.display_name,
            protocol_version = EXCLUDED.protocol_version,
            visibility = EXCLUDED.visibility,
            listing_tier = CASE
              WHEN EXCLUDED.listing_tier = 'premium' THEN EXCLUDED.listing_tier
              WHEN registrations.listing_tier = 'premium' AND registrations.premium_expires_at > now() THEN registrations.listing_tier
              ELSE EXCLUDED.listing_tier
            END,
            description = EXCLUDED.description,
            skill_disclosure = EXCLUDED.skill_disclosure,
            skill_packet = EXCLUDED.skill_packet,
            skill_ids = EXCLUDED.skill_ids,
            capability_ids = EXCLUDED.capability_ids,
            claim_types = EXCLUDED.claim_types,
            extensions = EXCLUDED.extensions,
            expires_at = CASE
              WHEN EXCLUDED.listing_tier = 'premium' THEN EXCLUDED.expires_at
              WHEN registrations.listing_tier = 'premium' AND registrations.premium_expires_at > now() THEN registrations.expires_at
              ELSE EXCLUDED.expires_at
            END,
            premium_expires_at = CASE
              WHEN EXCLUDED.listing_tier = 'premium' THEN EXCLUDED.premium_expires_at
              WHEN registrations.listing_tier = 'premium' AND registrations.premium_expires_at > now() THEN registrations.premium_expires_at
              ELSE EXCLUDED.premium_expires_at
            END,
            updated_at = now()
          RETURNING *
        `,
        [
          randomUUID(),
          write.agentId,
          write.syncInboxId,
          write.walletAddress,
          write.displayName,
          write.protocolVersion,
          write.visibility,
          write.listingTier ?? "standard",
          write.description,
          write.skillDisclosure,
          write.skillPacket ? JSON.stringify(skillPacketForStorage(write.skillPacket)) : null,
          write.skillIds,
          write.capabilityIds,
          write.claimTypes,
          write.extensions ? JSON.stringify(write.extensions) : null,
          write.expiresAt ?? null,
          write.premiumExpiresAt ?? null,
        ],
      );
      const row = result.rows[0];
      await client.query("DELETE FROM registration_skills WHERE registration_id = $1", [row.registration_id]);
      for (const [position, skill] of (write.skillPacket?.skills ?? []).entries()) {
        const sha256 = skillDocumentSha256(skill);
        const name = skillDocumentName(skill);
        const skillDocument = await client.query<{ id: string }>(
          `
            INSERT INTO skill_documents (id, name, skill_id, version, display_name, sha256, document)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            ON CONFLICT (name, sha256) DO UPDATE SET
              skill_id = EXCLUDED.skill_id,
              version = EXCLUDED.version,
              display_name = EXCLUDED.display_name,
              document = EXCLUDED.document,
              updated_at = now()
            RETURNING id
          `,
          [randomUUID(), name, skill.skillId, skill.version, skill.name, sha256, JSON.stringify(skill)],
        );
        await client.query(
          `
            INSERT INTO registration_skills (registration_id, position, skill_document_id)
            VALUES ($1, $2, $3)
          `,
          [row.registration_id, position, skillDocument.rows[0].id],
        );
      }
      const records = await recordsFromRows(client, [row]);
      await client.query("COMMIT");
      return records[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertPremiumRegistrationBySyncInbox(write: RegistrationWrite) {
    await this.pool.query(
      `
        DELETE FROM registrations
        WHERE agent_id = $1
          AND sync_inbox_id <> $2
          AND (
            (expires_at IS NOT NULL AND expires_at <= now())
            OR (listing_tier = 'premium' AND premium_expires_at IS NOT NULL AND premium_expires_at <= now())
          )
      `,
      [write.agentId, write.syncInboxId],
    );
    return this.upsertRegistrationBySyncInbox({ ...write, listingTier: "premium" });
  }

  async removeOwnedRegistration(input: { senderInboxId: string; agentId?: string; syncInboxId?: string }) {
    const result = await this.pool.query<RegistrationRow>(
      `
        DELETE FROM registrations
        WHERE sync_inbox_id = $1
          AND sync_inbox_id = $2
          AND ($3::text IS NULL OR agent_id = $3)
        RETURNING *
      `,
      [input.syncInboxId ?? input.senderInboxId, input.senderInboxId, input.agentId ?? null],
    );
    return result.rowCount === 1;
  }

  async saveConnectionClaim(write: ClaimWrite) {
    if (
      write.status === "verified" &&
      write.claimType === "sayso.claim.agent-connection" &&
      write.requesterType &&
      write.requesterAddress &&
      write.agentType &&
      write.agentAddress
    ) {
      const updated = await this.pool.query(
        `
          UPDATE connection_claims
          SET
            sender_inbox_id = $1,
            wallet_address = $2,
            signature_scheme = $8,
            canonical_message = $9,
            presentation = $10::jsonb,
            provider_response = $11::jsonb,
            error_message = $12,
            updated_at = now()
          WHERE claim_type = $3
            AND status = 'verified'
            AND lower(requester_type) = lower($5)
            AND lower(requester_address) = lower($6)
            AND lower(agent_type) = lower($7)
            AND lower(agent_address) = lower($4)
        `,
        [
          write.senderInboxId,
          write.walletAddress ?? null,
          write.claimType,
          write.agentAddress,
          write.requesterType,
          write.requesterAddress,
          write.agentType,
          write.signatureScheme ?? null,
          write.canonicalMessage ?? null,
          write.presentation ? JSON.stringify(write.presentation) : null,
          write.providerResponse ? JSON.stringify(write.providerResponse) : null,
          write.errorMessage ?? null,
        ],
      );
      if (updated.rowCount === 1) return;
    }

    await this.pool.query(
      `
        INSERT INTO connection_claims (
          id,
          sender_inbox_id,
          wallet_address,
          claim_type,
          status,
          requester_type,
          requester_address,
          agent_type,
          agent_address,
          signature_scheme,
          canonical_message,
          presentation,
          provider_response,
          error_message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14)
      `,
      [
        randomUUID(),
        write.senderInboxId,
        write.walletAddress,
        write.claimType,
        write.status,
        write.requesterType ?? null,
        write.requesterAddress ?? null,
        write.agentType ?? null,
        write.agentAddress ?? null,
        write.signatureScheme ?? null,
        write.canonicalMessage ?? null,
        write.presentation ? JSON.stringify(write.presentation) : null,
        write.providerResponse ? JSON.stringify(write.providerResponse) : null,
        write.errorMessage ?? null,
      ],
    );
  }
}
