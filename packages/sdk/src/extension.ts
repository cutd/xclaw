import type { PluginManifest } from '@xclaw/core';

export abstract class BaseExtensionPlugin {
  abstract manifest: PluginManifest;

  abstract onLoad(): Promise<void>;
  abstract onUnload(): Promise<void>;

  providesChannels(): string[] {
    return this.manifest.provides?.channels ?? [];
  }

  providesTools(): string[] {
    return this.manifest.provides?.tools ?? [];
  }

  providesDevice(): string[] {
    return this.manifest.provides?.device ?? [];
  }

  providesMemory(): string | undefined {
    return this.manifest.provides?.memory;
  }

  providesVoice(): boolean {
    return this.manifest.provides?.voice ?? false;
  }
}
