import type { AgentSkillContract } from "@sayso-labs/protocol/browser";

export function ChannelCards({ channels }: { channels: AgentSkillContract["channels"] }) {
  if (channels.length === 0) return <p className="description">No channels are declared.</p>;
  return (
    <div className="channel-card-grid">
      {channels.map((channel) => (
        <div className="channel-card" key={channel.channelId}>
          <strong>{channel.channelId}</strong>
          <span>{channel.kind}</span>
          <p>{channel.description}</p>
        </div>
      ))}
    </div>
  );
}
