#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Command, Option } from "commander";
import type { DecodedMessage } from "@xmtp/node-sdk";
import type { ContentTypeId } from "@xmtp/content-type-primitives";
import { addCommonOptions, getCommonOptions } from "./options.js";
import { CONTENT_TYPES, contentTypeKey } from "../sayso/contentTypes.js";
import { createXmtpClient, getOrCreateDm, sendTyped, type SaySoConversation } from "../sayso/xmtp.js";
import type { SkillResponsePayload } from "../sayso/types.js";
import type { SaySoCodecContent } from "../sayso/codecs.js";
import { hasPongSkill } from "../pong/skill.js";

type WaitPredicate = (message: DecodedMessage<SaySoCodecContent>) => boolean;

const waitForMessage = async (
  conversation: SaySoConversation,
  ownInboxId: string,
  predicate: WaitPredicate,
  timeoutMs: number,
): Promise<DecodedMessage<SaySoCodecContent>> => {
  const stream = await conversation.stream();
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      (async () => {
        for await (const message of stream) {
          const typedMessage = message as DecodedMessage<SaySoCodecContent>;
          if (typedMessage.senderInboxId === ownInboxId) continue;
          if (predicate(typedMessage)) return typedMessage;
        }
        throw new Error("XMTP stream ended before receiving expected response.");
      })(),
      new Promise<DecodedMessage<SaySoCodecContent>>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Timed out waiting for response.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await stream.end();
  }
};

const sendAndWait = async (
  conversation: SaySoConversation,
  ownInboxId: string,
  content: SaySoCodecContent,
  contentType: ContentTypeId,
  expectedKey: ReturnType<typeof contentTypeKey>,
  timeoutMs: number,
) => {
  const pending = waitForMessage(
    conversation,
    ownInboxId,
    (message) => contentTypeKey(message.contentType) === expectedKey,
    timeoutMs,
  );
  await sendTyped(conversation, content, contentType);
  return pending;
};

const printSkillSummary = (skillResponse: SkillResponsePayload) => {
  if (skillResponse.status !== "ok") {
    console.log("Skill response error:");
    console.dir(skillResponse.error, { depth: null });
    return;
  }
  console.log("\nResolved skill summary");
  console.log(`Agent: ${skillResponse.agent.displayName} (${skillResponse.agent.agentId})`);
  console.log(`Protocol: ${skillResponse.agent.protocolVersion}`);
  console.log(`Capabilities: ${skillResponse.skill.capabilities.length}`);
  for (const capability of skillResponse.skill.capabilities) {
    console.log(`- ${capability.capabilityId} (${capability.paymentPolicy})`);
  }
  console.log(`Content types: ${skillResponse.skill.contentTypes.length}`);
  for (const contentType of skillResponse.skill.contentTypes) {
    console.log(`- ${contentType.authorityId}/${contentType.typeId}/${contentType.versionMajor}`);
  }
  console.log(`Payment policies: ${skillResponse.skill.paymentPolicies.length}`);
  for (const policy of skillResponse.skill.paymentPolicies) {
    console.log(`- ${policy.policyId}: required=${policy.required}`);
  }
  if (skillResponse.skills) {
    console.log(`Referenced skills: ${skillResponse.skills.length}`);
    for (const skill of skillResponse.skills) {
      console.log(`- ${skill.skillId}@${skill.version} (${skill.kind})`);
    }
  }
};

const program = new Command();
program
  .name("sayso-agent-test")
  .description("Connect to a SaySo agent over XMTP and test connection and skill discovery.")
  .requiredOption("--agent <wallet-or-inbox>", "Agent wallet address or XMTP inbox ID")
  .option("--timeout-ms <ms>", "Response timeout in milliseconds", "30000")
  .option("--ping", "Send sayso.demo.pong/ping-request/1 if the agent advertises pong")
  .addOption(new Option("--include <mode>", "Skill request include mode").choices(["resolved", "skills", "all"]).default("all"))
  .showHelpAfterError();

addCommonOptions(program);

program.action(async () => {
  const options = {
    ...getCommonOptions(program),
    ...program.opts<{
      agent: string;
      timeoutMs: string;
      ping?: boolean;
      include: "resolved" | "skills" | "all";
    }>(),
  };
  const timeoutMs = Number.parseInt(options.timeoutMs, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }

  const { client, walletAddress } = await createXmtpClient("agent-test", options);
  console.log(`Tester wallet: ${walletAddress}`);
  console.log(`Tester inbox: ${client.inboxId}`);
  console.log(`Target: ${options.agent}`);

  const conversation = await getOrCreateDm(client, options.agent);
  console.log("Sending connection-request/1...");
  const connectionMessage = await sendAndWait(
    conversation,
    client.inboxId,
    {},
    CONTENT_TYPES.connectionRequest,
    "connectionResponse",
    timeoutMs,
  );
  console.log("Connection response:");
  console.dir(connectionMessage.content, { depth: null });

  console.log(`Sending skill-request/1 include=${options.include}...`);
  const skillMessage = await sendAndWait(
    conversation,
    client.inboxId,
    { include: options.include },
    CONTENT_TYPES.skillRequest,
    "skillResponse",
    timeoutMs,
  );
  const skillResponse = skillMessage.content as SkillResponsePayload;
  printSkillSummary(skillResponse);

  if (options.ping) {
    if (skillResponse.status !== "ok" || !hasPongSkill(skillResponse)) {
      console.log("\nTarget did not advertise sayso.demo.pong; skipping ping.");
      return;
    }
    const requestId = `ping_${randomUUID()}`;
    console.log(`\nSending ping-request/1 requestId=${requestId}...`);
    const pongMessage = await sendAndWait(
      conversation,
      client.inboxId,
      {
        requestId,
        message: "hello",
        sentAt: new Date().toISOString(),
      },
      CONTENT_TYPES.pingRequest,
      "pongResponse",
      timeoutMs,
    );
    console.log("Pong response:");
    console.dir(pongMessage.content, { depth: null });
  }
});

await program.parseAsync();
