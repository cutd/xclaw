export function sandboxInfo(): string {
  const platform = process.platform;
  const backends: Record<string, string> = {
    darwin: 'macOS sandbox-exec (App Sandbox)',
    linux: 'bubblewrap (bwrap)',
  };
  const backend = backends[platform] ?? 'VM isolate (fallback)';

  return [
    'Sandbox info:',
    `  Platform: ${platform}`,
    `  Backend: ${backend}`,
    '  Default mode: passthrough',
    '  Memory limit: 512 MB',
    '  Timeout: 30s',
  ].join('\n');
}
