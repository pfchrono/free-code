import type {
  MCPServerConnection,
} from '../../services/mcp/types.js';
import type { LoadedPlugin, PluginError } from '../../types/plugin.js';
import type { PersistablePluginScope } from '../../utils/plugins/pluginIdentifier.js';

export type PluginManagerScope = PersistablePluginScope | 'builtin' | 'flagged';

export type McpPluginStatus =
  | 'connected'
  | 'disabled'
  | 'pending'
  | 'needs-auth'
  | 'failed';

export type UnifiedInstalledItem =
  | {
      type: 'plugin';
      id: string;
      name: string;
      description?: string;
      marketplace: string;
      scope: PluginManagerScope;
      isEnabled: boolean;
      errorCount: number;
      errors: PluginError[];
      plugin: LoadedPlugin;
      pendingEnable?: boolean;
      pendingUpdate?: boolean;
      pendingToggle?: 'will-enable' | 'will-disable';
    }
  | {
      type: 'failed-plugin';
      id: string;
      name: string;
      marketplace: string;
      scope: PersistablePluginScope;
      errorCount: number;
      errors: PluginError[];
    }
  | {
      type: 'flagged-plugin';
      id: string;
      name: string;
      marketplace: string;
      scope: 'flagged';
      flaggedAt?: number;
      description?: string;
    }
  | {
      type: 'mcp';
      id: string;
      name: string;
      description?: string;
      scope: PersistablePluginScope;
      status: McpPluginStatus;
      client: MCPServerConnection;
      indented?: boolean;
    };
