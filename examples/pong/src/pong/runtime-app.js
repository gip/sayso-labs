const createApplication = ({ sayso }) => {
  const CONTENT_TYPES = Object.freeze({
    connectionResponse: "sayso.protocol/connection-response/1",
    skillResponse: "sayso.protocol/skill-response/1",
    disconnectAck: "sayso.protocol/disconnect-ack/1",
    error: "sayso.protocol/error/1",
    configurationRequest: "sayso.configure/configuration-request/1",
    configurationResponse: "sayso.configure/configuration-response/1",
    sourceManifestRequest: "sayso.source/source-manifest-request/1",
    sourceManifestResponse: "sayso.source/source-manifest-response/1",
    sourceChunkRequest: "sayso.source/source-chunk-request/1",
    sourceChunkResponse: "sayso.source/source-chunk-response/1",
    pingRequest: "sayso.demo.pong/ping-request/1",
    pongResponse: "sayso.demo.pong/pong-response/1",
  });

  const CONTENT_TYPE_BY_KEY = Object.freeze({
    configurationRequest: CONTENT_TYPES.configurationRequest,
    sourceManifestRequest: CONTENT_TYPES.sourceManifestRequest,
    sourceChunkRequest: CONTENT_TYPES.sourceChunkRequest,
    pingRequest: CONTENT_TYPES.pingRequest,
  });

  let cachedParams = null;
  const params = async () => {
    if (!cachedParams) cachedParams = await sayso.call("params.get", {});
    return cachedParams;
  };

  const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const requestIdFrom = (content) => isRecord(content) && typeof content.requestId === "string" ? content.requestId : null;
  const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
  const isRelativeSourcePath = (value) =>
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("//") &&
    !value.split("/").includes("..");

  const coreError = (message, requestId) => ({
    contentType: CONTENT_TYPES.error,
    content: {
      code: "malformed",
      message,
      ...(requestId ? { requestId } : {}),
    },
  });

  const protocolVersion = "0.1.0";

  const parseConfigurationRequest = (value) => {
    if (!isRecord(value) || typeof value.requestId !== "string") return null;
    if (value.names !== undefined && !isStringArray(value.names)) return null;
    if (value.includeValues !== undefined && value.includeValues !== "public" && value.includeValues !== "none") return null;
    return value;
  };

  const parseSourceManifestRequest = (value) => {
    if (!isRecord(value) || typeof value.requestId !== "string") return null;
    if (value.format !== undefined && value.format !== "files" && value.format !== "tar.gz" && value.format !== "zip") return null;
    if (value.include !== undefined && !isStringArray(value.include)) return null;
    if (value.exclude !== undefined && !isStringArray(value.exclude)) return null;
    if (value.maxChunkSizeBytes !== undefined && (!Number.isInteger(value.maxChunkSizeBytes) || value.maxChunkSizeBytes < 1)) return null;
    return value;
  };

  const parseSourceChunkRequest = (value) => {
    if (!isRecord(value) || typeof value.requestId !== "string" || typeof value.snapshotId !== "string") return null;
    if (!Number.isInteger(value.chunkIndex) || value.chunkIndex < 0) return null;
    if (!isRecord(value.target)) return null;
    if (value.target.kind === "file" && isRelativeSourcePath(value.target.path)) return value;
    if (value.target.kind === "archive" && (value.target.format === "tar.gz" || value.target.format === "zip")) return value;
    return null;
  };

  const isPingRequest = (value) =>
    isRecord(value) &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    (value.message === undefined || typeof value.message === "string") &&
    (value.sentAt === undefined || typeof value.sentAt === "string");

  const configurationVariables = (runtime) => [
    {
      name: "XMTP_ENV",
      visibility: "public",
      description: "XMTP network environment used by the pong agent.",
      valueType: "string",
      source: "runtime",
      value: runtime.xmtpEnv,
    },
    {
      name: "SAYSO_NETWORK_AGENT",
      visibility: "public",
      description: "SaySo Network registry agent wallet address or inbox ID used for registration.",
      valueType: "string",
      source: "runtime",
      value: runtime.networkAgent,
    },
    {
      name: "DEBUG",
      visibility: "public",
      description: "Debug logging selector for the pong process.",
      valueType: "string",
      source: "environment",
      required: false,
      ...(runtime.debug === undefined ? {} : { value: runtime.debug }),
    },
    {
      name: "XMTP_PRIVATE_KEY",
      visibility: "private",
      description: "Wallet private key used to create the pong XMTP client.",
      valueType: "secret",
      source: "environment",
      required: true,
    },
    {
      name: "XMTP_DB_ENCRYPTION_KEY",
      visibility: "private",
      description: "Encryption key for the local XMTP database.",
      valueType: "secret",
      source: "environment",
      required: true,
    },
    {
      name: "XMTP_DB_DIR",
      visibility: "public",
      description: "Base directory for the pong agent's local XMTP database.",
      valueType: "string",
      source: "runtime",
      value: runtime.dbDir,
    },
  ];

  const createConfigurationResponse = async (request) => {
    const runtime = (await params()).configuration;
    const requestedNames = request.names ? new Set(request.names) : null;
    const includeValues = request.includeValues ?? "public";
    const variables = configurationVariables(runtime)
      .filter((variable) => !requestedNames || requestedNames.has(variable.name))
      .map((variable) => {
        if (includeValues !== "none") return variable;
        const { value: _value, ...rest } = variable;
        return rest;
      });
    return {
      requestId: request.requestId,
      status: "ok",
      variables,
      generatedAt: await sayso.call("clock.nowIso", {}),
    };
  };

  const skillResponse = (input, p) => {
    const mode = input.request.include ?? "resolved";
    const includedSkillIds = p.skills.map((skill) => skill.skillId);
    const response = {
      status: "ok",
      agent: {
        ...p.skillPacket.agent,
        syncInboxId: input.agent.syncInboxId,
      },
      skill: p.resolvedSkill,
      content: "# SaySo Demo Pong\n\nNo-payment SaySo agent that responds to ping requests.",
      mediaType: "text/markdown",
    };
    if (mode === "skills" || mode === "all") {
      response.skills = p.skills;
      response.resolution = {
        mode,
        ...(input.request.skillIds ? { requestedSkillIds: input.request.skillIds } : {}),
        includedSkillIds,
        dependencyOrder: includedSkillIds,
      };
    }
    return response;
  };

  return {
    appId: "sayso.demo.pong",
    runtime: {
      skillId: "sayso.runtime",
      abiVersion: "0.1.0",
    },
    source: {
      skillId: "sayso.source",
      format: "files",
      entrypoint: "examples/pong/src/pong/runtime-app.js",
      include: ["examples/pong/src/pong/runtime-app.js"],
    },
    hostOperations: ["params.get", "clock.nowIso", "pong.sourceManifest", "pong.sourceChunk"],
    capabilities: {
      network: {
        https: [],
        wss: [],
      },
    },
    skillPacket: async (_input) => (await params()).skillPacket,
    handleConnectionRequest: async (input) => {
      const p = await params();
      if (input.presentations && input.presentations.length > 0) {
        return {
          status: "error",
          supportedProtocolVersions: [protocolVersion],
          error: {
            code: "presentation-unsupported",
            message: "This agent does not advertise support for claim presentations.",
          },
        };
      }
      return {
        status: "ok",
        protocolVersion,
        supportedProtocolVersions: [protocolVersion],
        agent: {
          agentId: input.agent.agentId,
          syncInboxId: input.agent.syncInboxId,
          displayName: input.agent.displayName,
        },
        next: "sayso.protocol/skill-request/1",
        skillPacket: p.skillPacket,
      };
    },
    handleSkillRequest: async (input) => skillResponse(input, await params()),
    handleMessage: async (message) => {
      const contentType = message.contentType ?? CONTENT_TYPE_BY_KEY[message.key] ?? message.key;
      const content = message.content;
      switch (contentType) {
        case CONTENT_TYPES.configurationRequest: {
          const request = parseConfigurationRequest(content);
          if (!request) {
            const requestId = requestIdFrom(content);
            if (!requestId) return [coreError("Invalid configuration-request/1 payload.")];
            return [{
              contentType: CONTENT_TYPES.configurationResponse,
              content: {
                requestId,
                status: "error",
                error: {
                  code: "malformed",
                  message: "Invalid configuration-request/1 payload.",
                },
              },
            }];
          }
          return [{
            contentType: CONTENT_TYPES.configurationResponse,
            content: await createConfigurationResponse(request),
          }];
        }
        case CONTENT_TYPES.sourceManifestRequest: {
          const request = parseSourceManifestRequest(content);
          if (!request) {
            const requestId = requestIdFrom(content);
            if (!requestId) return [coreError("Invalid source-manifest-request/1 payload.")];
            return [{
              contentType: CONTENT_TYPES.sourceManifestResponse,
              content: {
                requestId,
                status: "error",
                error: {
                  code: "malformed",
                  message: "Invalid source-manifest-request/1 payload.",
                },
              },
            }];
          }
          return [{
            contentType: CONTENT_TYPES.sourceManifestResponse,
            content: await sayso.call("pong.sourceManifest", request),
          }];
        }
        case CONTENT_TYPES.sourceChunkRequest: {
          const request = parseSourceChunkRequest(content);
          if (!request) {
            const requestId = requestIdFrom(content);
            if (!requestId) return [coreError("Invalid source-chunk-request/1 payload.")];
            return [{
              contentType: CONTENT_TYPES.sourceChunkResponse,
              content: {
                requestId,
                status: "error",
                error: {
                  code: "malformed",
                  message: "Invalid source-chunk-request/1 payload.",
                },
              },
            }];
          }
          return [{
            contentType: CONTENT_TYPES.sourceChunkResponse,
            content: await sayso.call("pong.sourceChunk", request),
          }];
        }
        case CONTENT_TYPES.pingRequest: {
          if (!isPingRequest(content)) return [coreError("Invalid ping-request/1 payload.")];
          const receivedAt = await sayso.call("clock.nowIso", {});
          const respondedAt = await sayso.call("clock.nowIso", {});
          return [{
            contentType: CONTENT_TYPES.pongResponse,
            content: {
              requestId: content.requestId,
              message: "pong",
              ...(content.message ? { receivedMessage: content.message } : {}),
              receivedAt,
              respondedAt,
            },
          }];
        }
        default:
          return null;
      }
    },
    disconnect: async () => [{
      contentType: CONTENT_TYPES.disconnectAck,
      content: {
        action: "disconnect",
        status: "ok",
        details: { closed: ["connection_state"] },
      },
    }],
    forgetMe: async () => [{
      contentType: CONTENT_TYPES.disconnectAck,
      content: {
        action: "forget-me",
        status: "ok",
        details: { deleted: ["connection_state", "onboarding_state"] },
      },
    }],
  };
};

sayso.registerApplication(createApplication({ sayso }));
