export interface ChannelStatus {
  name: string;
  enabled: boolean;
}

export function formatChannelList(channels: ChannelStatus[]): string {
  if (channels.length === 0) return 'No channels configured.';
  const lines = channels.map(
    (ch) => `  ${ch.name}  ${ch.enabled ? '[enabled]' : '[disabled]'}`,
  );
  return `Channels:\n${lines.join('\n')}`;
}
