import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { PluginHook, PluginContext, PluginSource, Plugin } from '../plugin.js';

// Re-export types for convenience
export type { PluginHook, PluginContext, PluginSource, Plugin };

/**
 * Enhanced Plugin interface with runtime capabilities
 */
export interface EnhancedPlugin extends Plugin {
  // Plugin metadata (enhanced)
  keywords?: string[];
  metadata?: {
    category?: string;
    tags?: string[];
    supports?: string[]; // e.g., ['npm', 'yarn', 'pnpm', 'bun']
    requiresRestart?: boolean;
    singleton?: boolean; // Only one instance allowed
    runtimeUnloadable?: boolean; // Can be unloaded at runtime
    runtimeUpdatable?: boolean; // Can be updated without restart
    [key: string]: any;
  };

  // Runtime plugin management (new capabilities)
  onLoad?: (context: PluginContext) => Promise<void>;
  onUnload?: (context: PluginContext) => Promise<void>;
  onUpdate?: (context: PluginContext, oldVersion: string) => Promise<void>;
  healthCheck?: () => Promise<boolean>;
  getHealthStatus?: () => Promise<{ healthy: boolean; details?: any }>;

  // Plugin event handlers (new)
  onEvent?: (event: string, data: any, context: PluginContext) => Promise<void>;
  emitEvent?: (event: string, data: any) => Promise<void>;

  // Plugin custom commands (new)
  commands?: Record<string, {
    description: string;
    handler: (args: any, context: PluginContext) => Promise<void>;
  }>;
}

/**
 * Runtime plugin management options
 */
export interface PluginRuntimeOptions {
  /** Allow runtime plugin updates */
  enableUpdates: boolean;
  /** Allow runtime plugin unloading */
  enableUnloading: boolean;
  /** Auto-reload plugins on file changes (development) */
  hotReload: boolean;
  /** Validate plugin compatibility */
  validateCompatibility: boolean;
  /** Plugin health monitoring */
  monitorHealth: boolean;
  /** Maximum plugin execution time */
  maxExecutionTime: number;
  /** Plugin isolation level */
  isolationLevel: 'none' | 'sandbox' | 'container';
}

/**
 * Plugin registration info
 */
export interface PluginRegistration {
  plugin: EnhancedPlugin;
  source: PluginSource;
  path: string;
  loaded: Date;
  enabled: boolean;
  runtimeInfo: {
    pid?: number;
    memoryUsage?: number;
    lastActivity?: Date;
    errorCount?: number;
  };
}

/**
 * Plugin communication event
 */
export interface PluginEvent {
  eventId: string;
  pluginName: string;
  eventType: string;
  data: any;
  timestamp: number;
  targetPlugins?: string[]; // Empty means broadcast to all
}

/**
 * Plugin health status
 */
export interface PluginHealth {
  name: string;
  healthy: boolean;
  lastChecked: Date;
  responseTime: number;
  memoryUsage: number;
  errorCount: number;
  details?: any;
}

/**
 * Runtime plugin loader - provides enhanced plugin capabilities
 */
export class RuntimePluginLoader {
  private plugins: Map<string, PluginRegistration> = new Map();
  private eventListeners: Map<string, Array<(event: PluginEvent) => void>> = new Map();
  private healthMonitor: Map<string, PluginHealth> = new Map();
  private options: PluginRuntimeOptions;
  private eventHistory: PluginEvent[] = [];
  private maxEventHistory = 1000;

  constructor(options: Partial<PluginRuntimeOptions> = {}) {
    this.options = {
      enableUpdates: true,
      enableUnloading: true,
      hotReload: false,
      validateCompatibility: true,
      monitorHealth: true,
      maxExecutionTime: 30000, // 30 seconds
      isolationLevel: 'none',
      ...options
    };
  }

  /**
   * Load a plugin at runtime
   */
  async loadPlugin(pluginPath: string, source: PluginSource): Promise<boolean> {
    try {
      // Validate plugin path
      if (!await fs.pathExists(pluginPath)) {
        throw new Error(`Plugin path not found: ${pluginPath}`);
      }

      // Load plugin from path
      const plugin = await this.loadPluginFromPath(pluginPath);

      // Convert to enhanced plugin if needed
      const enhancedPlugin = this.enhancePlugin(plugin);

      // Validate plugin API compatibility
      if (this.options.validateCompatibility && !this.isPluginCompatible(enhancedPlugin)) {
        throw new Error(`Plugin ${enhancedPlugin.name} is not API compatible`);
      }

      // Check if plugin is already loaded (singleton check)
      if (enhancedPlugin.metadata?.singleton && this.plugins.has(enhancedPlugin.name)) {
        throw new Error(`Plugin ${enhancedPlugin.name} is already loaded (singleton)`);
      }

      // Register plugin
      const registration: PluginRegistration = {
        plugin: enhancedPlugin,
        source,
        path: pluginPath,
        loaded: new Date(),
        enabled: true,
        runtimeInfo: {
          pid: process.pid,
          memoryUsage: process.memoryUsage().heapUsed,
          lastActivity: new Date(),
          errorCount: 0
        }
      };

      this.plugins.set(enhancedPlugin.name, registration);

      // Call onLoad lifecycle method
      if (enhancedPlugin.onLoad) {
        const context = this.createPluginContext(enhancedPlugin);
        await this.executeWithTimeout(
          enhancedPlugin.onLoad(context),
          `Plugin ${enhancedPlugin.name} onLoad`
        );
      }

      // Start health monitoring if enabled
      if (this.options.monitorHealth && enhancedPlugin.healthCheck) {
        this.startHealthMonitoring(enhancedPlugin);
      }

      return true;
    } catch (error) {
      console.error(`Failed to load plugin ${pluginPath}:`, error);
      return false;
    }
  }

  /**
   * Unload a plugin at runtime
   */
  async unloadPlugin(pluginName: string): Promise<boolean> {
    try {
      const registration = this.plugins.get(pluginName);
      if (!registration) {
        throw new Error(`Plugin ${pluginName} not found`);
      }

      // Check if plugin supports runtime unloading
      if (!registration.plugin.metadata?.runtimeUnloadable) {
        throw new Error(`Plugin ${pluginName} does not support runtime unloading`);
      }

      // Stop health monitoring
      this.stopHealthMonitoring(pluginName);

      // Call onUnload lifecycle method
      if (registration.plugin.onUnload) {
        const context = this.createPluginContext(registration.plugin);
        await this.executeWithTimeout(
          registration.plugin.onUnload(context),
          `Plugin ${pluginName} onUnload`
        );
      }

      // Remove plugin from all registries
      this.plugins.delete(pluginName);
      return true;
    } catch (error) {
      console.error(`Failed to unload plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * Update a plugin at runtime
   */
  async updatePlugin(pluginName: string, newPluginPath: string): Promise<boolean> {
    try {
      const registration = this.plugins.get(pluginName);
      if (!registration) {
        throw new Error(`Plugin ${pluginName} not found`);
      }

      // Check if plugin supports runtime updates
      if (!registration.plugin.metadata?.runtimeUpdatable) {
        throw new Error(`Plugin ${pluginName} does not support runtime updates`);
      }

      // Load new plugin version
      const newPlugin = await this.loadPluginFromPath(newPluginPath);
      const oldVersion = registration.plugin.version;

      // Update registration
      registration.plugin = this.enhancePlugin(newPlugin);
      registration.loaded = new Date();

      // Call onUpdate lifecycle method
      if (registration.plugin.onUpdate) {
        const context = this.createPluginContext(registration.plugin);
        await this.executeWithTimeout(
          registration.plugin.onUpdate(context, oldVersion),
          `Plugin ${pluginName} onUpdate`
        );
      }

      return true;
    } catch (error) {
      console.error(`Failed to update plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * Emit an event to plugins
   */
  async emitEvent(event: PluginEvent): Promise<void> {
    // Add to event history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.maxEventHistory);
    }

    // Broadcast to all plugins or specific targets
    for (const [pluginName, registration] of this.plugins.entries()) {
      if (!registration.enabled) continue;

      const shouldReceive = !event.targetPlugins ||
        event.targetPlugins.length === 0 ||
        event.targetPlugins.includes(pluginName);

      if (shouldReceive && registration.plugin.onEvent) {
        try {
          const context = this.createPluginContext(registration.plugin);
          await this.executeWithTimeout(
            registration.plugin.onEvent(event.eventType, event.data, context),
            `Plugin ${pluginName} onEvent`
          );
        } catch (error) {
          console.error(`Plugin ${pluginName} failed to handle event:`, error);
        }
      }
    }
  }

  /**
   * Get plugin status
   */
  getPluginStatus(pluginName: string): PluginRegistration | null {
    return this.plugins.get(pluginName) || null;
  }

  /**
   * Get all registered plugins
   */
  getRegisteredPlugins(): PluginRegistration[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin health status
   */
  getHealthStatus(pluginName: string): PluginHealth | null {
    return this.healthMonitor.get(pluginName) || null;
  }

  /**
   * Execute plugin hook with timeout protection
   */
  private async executeWithTimeout(promise: Promise<any>, context: string): Promise<any> {
    if (!this.options.maxExecutionTime) {
      return promise;
    }

    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${context} exceeded timeout of ${this.options.maxExecutionTime}ms`));
        }, this.options.maxExecutionTime);
      })
    ]);
  }

  /**
   * Load plugin from file path
   */
  private async loadPluginFromPath(pluginPath: string): Promise<Plugin> {
    // Handle both file and directory paths
    let pluginFile = pluginPath;

    if (await fs.stat(pluginPath).then(stat => stat.isDirectory())) {
      pluginFile = path.join(pluginPath, 'index.js');
    }

    if (!await fs.pathExists(pluginFile)) {
      throw new Error(`Plugin file not found: ${pluginFile}`);
    }

    // Load plugin using dynamic import
    const pluginModule = await import(this.toFileUrlIfNeeded(pluginFile));
    const plugin = pluginModule.default;

    if (!plugin || typeof plugin.name !== 'string') {
      throw new Error(`Invalid plugin format: ${pluginFile}`);
    }

    return plugin;
  }

  /**
   * Enhance a basic plugin with runtime capabilities
   */
  private enhancePlugin(plugin: Plugin): EnhancedPlugin {
    return {
      ...plugin,
      metadata: {
        requiresRestart: true,
        ...(plugin as any).metadata
      },
      onEvent: undefined,
      emitEvent: undefined,
      commands: {},
      ...plugin
    };
  }

  /**
   * Check plugin API compatibility
   */
  private isPluginCompatible(plugin: EnhancedPlugin): boolean {
    // Basic compatibility checks
    if (!plugin.name || !plugin.version) return false;

    return true; // For now, all plugins are considered compatible
  }

  /**
   * Create plugin execution context
   */
  private createPluginContext(plugin: EnhancedPlugin): PluginContext {
    return {
      projectDir: process.cwd(),
      nodeModulesPath: path.join(process.cwd(), 'node_modules'),
      dependencies: {},
      packageManager: 'npm',
      options: {
        cache: true,
        concurrency: 8
      }
    };
  }

  /**
   * Start health monitoring for a plugin
   */
  private async startHealthMonitoring(plugin: EnhancedPlugin): Promise<void> {
    setInterval(async () => {
      try {
        const startTime = Date.now();
        const healthy = await plugin.healthCheck!();
        const responseTime = Date.now() - startTime;

        const health: PluginHealth = {
          name: plugin.name,
          healthy,
          lastChecked: new Date(),
          responseTime,
          memoryUsage: process.memoryUsage().heapUsed,
          errorCount: 0, // Would be tracked elsewhere
          details: {}
        };

        this.healthMonitor.set(plugin.name, health);
      } catch (error) {
        // Mark as unhealthy
        this.healthMonitor.set(plugin.name, {
          name: plugin.name,
          healthy: false,
          lastChecked: new Date(),
          responseTime: 0,
          memoryUsage: 0,
          errorCount: 1,
          details: { error: error instanceof Error ? error.message : String(error) }
        });
      }
    }, 60000); // Check every minute
  }

  /**
   * Stop health monitoring for a plugin
   */
  private stopHealthMonitoring(pluginName: string): void {
    // Implementation would stop the health check interval
    // For now, we just remove from monitoring
    this.healthMonitor.delete(pluginName);
  }

  // Helper to convert a path to a file:// URL for ESM import
  private toFileUrlIfNeeded(p: string): string {
    if (process.platform === 'win32' && !p.startsWith('file://')) {
      // Replace backslashes with forward slashes and encode spaces
      let pathName = p.replace(/\\/g, '/');
      // Handle drive letter
      if (!pathName.startsWith('/')) {
        pathName = '/' + pathName;
      }
      return 'file://' + pathName;
    }
    return p;
  }
}

/**
 * Global runtime plugin loader instance
 */
export const runtimePluginLoader = new RuntimePluginLoader();