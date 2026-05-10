CREATE TABLE registrations (
  registration_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  sync_inbox_id TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  display_name TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  listing_tier TEXT NOT NULL DEFAULT 'standard' CHECK (listing_tier IN ('standard', 'premium')),
  description TEXT NOT NULL,
  skill_disclosure TEXT NOT NULL CHECK (skill_disclosure IN ('summary-only', 'include-skill-packet')),
  skill_packet JSONB,
  skill_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  capability_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  claim_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  extensions JSONB,
  expires_at TIMESTAMPTZ,
  premium_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX registrations_visibility_updated_at_idx
  ON registrations (visibility, updated_at DESC, registration_id);

CREATE INDEX registrations_premium_listing_idx
  ON registrations (visibility, listing_tier, premium_expires_at DESC, updated_at DESC, registration_id);

CREATE INDEX registrations_wallet_address_idx
  ON registrations (wallet_address);

CREATE UNIQUE INDEX registrations_wallet_agent_id_key
  ON registrations (lower(wallet_address), agent_id);

CREATE INDEX registrations_skill_ids_idx
  ON registrations USING GIN (skill_ids);

CREATE INDEX registrations_capability_ids_idx
  ON registrations USING GIN (capability_ids);

CREATE INDEX registrations_claim_types_idx
  ON registrations USING GIN (claim_types);

CREATE INDEX registrations_public_search_idx
  ON registrations USING GIN (to_tsvector('simple', agent_id || ' ' || display_name || ' ' || description));

CREATE TABLE skill_documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  display_name TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  document JSONB NOT NULL,
  is_reference BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, sha256)
);

CREATE INDEX skill_documents_skill_version_idx
  ON skill_documents (skill_id, version);

CREATE UNIQUE INDEX skill_documents_reference_name_key
  ON skill_documents (name)
  WHERE is_reference;

CREATE TABLE registration_skills (
  registration_id TEXT NOT NULL REFERENCES registrations (registration_id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  skill_document_id TEXT NOT NULL REFERENCES skill_documents (id),
  PRIMARY KEY (registration_id, position)
);

CREATE INDEX registration_skills_skill_document_id_idx
  ON registration_skills (skill_document_id);

CREATE TABLE connection_claims (
  id TEXT PRIMARY KEY,
  sender_inbox_id TEXT NOT NULL,
  wallet_address TEXT,
  claim_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'failed', 'malformed', 'provider-error')),
  requester_type TEXT,
  requester_address TEXT,
  agent_type TEXT,
  agent_address TEXT,
  signature_scheme TEXT,
  canonical_message TEXT,
  presentation JSONB,
  provider_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX connection_claims_verified_agent_connection_key
  ON connection_claims (
    claim_type,
    lower(requester_type),
    lower(requester_address),
    lower(agent_type),
    lower(agent_address)
  )
  WHERE claim_type = 'sayso.claim.agent-connection'
    AND status = 'verified'
    AND requester_type IS NOT NULL
    AND requester_address IS NOT NULL
    AND agent_type IS NOT NULL
    AND agent_address IS NOT NULL;

CREATE INDEX connection_claims_sender_inbox_id_idx
  ON connection_claims (sender_inbox_id);

CREATE INDEX connection_claims_agent_connection_count_idx
  ON connection_claims (claim_type, status, lower(agent_address))
  WHERE claim_type = 'sayso.claim.agent-connection'
    AND status = 'verified'
    AND agent_address IS NOT NULL;
