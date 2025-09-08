import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { TelemetryOptions, TelemetryEvent, TelemetryStats } from './types.js';

export class TelemetryService {
  private configPath: string;
  private options: TelemetryOptions;
  private events: TelemetryEvent[] = [];
  private enabled = false;

  constructor(options: TelemetryOptions = {}) {
    this.configPath = path.join(os.homedir(), '.flash-install', 'telemetry.json');

    // Default configuration - telemetry is DISABLED by default
    this.options = {
      enabled: false,
      trackCommands: false,
      trackPerformance: false,
      trackErrors: false,
      anonymize: true,
      ...options
    };

    this.loadConfiguration();
  }

  /**
   * Load configuration from disk
   */
  private async loadConfiguration(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.configPath));

      if (await fs.pathExists(this.configPath)) {
        const savedConfig = await fs.readJSON(this.configPath);
        this.options = { ...this.options, ...savedConfig };
      }

      // Generate a unique installation ID if not exists
      if (!this.options.installId) {
        this.options.installId = this.generateAnonymousId();
        await this.saveConfiguration();
      }
    } catch (error) {
      // Silent failure - telemetry should never break the app
      this.enabled = false;
    }

    this.enabled = this.options.enabled || false;
  }

  /**
   * Save configuration to disk
   */
  private async saveConfiguration(): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.configPath));
      await fs.writeJSON(this.configPath, this.options);
    } catch (error) {
      // Silent failure
    }
  }

  /**
   * Generate an anonymous installation ID
   */
  private generateAnonymousId(): string {
    const systemData = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      timestamp: Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7)) // Weekly buckets
    };

    return crypto.createHash('sha256')
      .update(JSON.stringify(systemData))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Enable telemetry collection
   */
  async enable(): Promise<void> {
    this.options.enabled = true;
    this.enabled = true;
    await this.saveConfiguration();
  }

  /**
   * Disable telemetry collection
   */
  async disable(): Promise<void> {
    this.options.enabled = false;
    this.enabled = false;
    await this.saveConfiguration();
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Track a command execution
   */
  async trackCommand(command: string, duration?: number, success: boolean = true): Promise<void> {
    if (!this.enabled || !this.options.trackCommands) return;

    const event: TelemetryEvent = {
      type: 'command',
      command,
      timestamp: Date.now(),
      duration,
      packageManager: this.getPackageManagerInfo(),
      systemHash: this.options.anonymize ? this.options.installId : undefined,
      success
    };

    this.events.push(event);
    await this.sendEvent(event);
  }

  /**
   * Track performance metrics
   */
  async trackPerformance(
    cacheHitRate?: number,
    packageCount?: number,
    packageManager?: string,
    success: boolean = true
  ): Promise<void> {
    if (!this.enabled || !this.options.trackPerformance) return;

    const event: TelemetryEvent = {
      type: 'performance',
      timestamp: Date.now(),
      cacheHitRate,
      packageCount,
      packageManager: packageManager || this.getPackageManagerInfo(),
      systemHash: this.options.anonymize ? this.options.installId : undefined,
      success
    };

    this.events.push(event);
    await this.sendEvent(event);
  }

  /**
   * Track an error
   */
  async trackError(error: string, context?: string): Promise<void> {
    if (!this.enabled || !this.options.trackErrors) return;

    const event: TelemetryEvent = {
      type: 'error',
      timestamp: Date.now(),
      error: this.options.anonymize ? error.substring(0, 100) : error,
      command: context,
      systemHash: this.options.anonymize ? this.options.installId : undefined,
      success: false
    };

    this.events.push(event);
    await this.sendEvent(event);
  }

  /**
   * Get package manager information
   */
  private getPackageManagerInfo(): string | undefined {
    // This would be determined from the actual package manager used
    // For now, return undefined
    return undefined;
  }

  /**
   * Send event to telemetry service (mock implementation)
   */
  private async sendEvent(event: TelemetryEvent): Promise<void> {
    // In a real implementation, this would send to a telemetry server
    // For now, we'll just store events locally for the demo

    try {
      const eventsPath = path.join(os.homedir(), '.flash-install', 'events.json');
      let existingEvents: TelemetryEvent[] = [];

      if (await fs.pathExists(eventsPath)) {
        existingEvents = await fs.readJSON(eventsPath);
      }

      existingEvents.push(event);

      // Keep only last 100 events to avoid disk space issues
      if (existingEvents.length > 100) {
        existingEvents = existingEvents.slice(-100);
      }

      await fs.writeJSON(eventsPath, existingEvents);
    } catch (error) {
      // Silent failure - telemetry should never break the app
    }
  }

  /**
   * Get aggregated telemetry statistics
   */
  async getStats(): Promise<TelemetryStats | null> {
    if (this.events.length === 0) return null;

    const commands = this.events.filter(e => e.type === 'command');
    const performances = this.events.filter(e => e.type === 'performance');

    const totalCommands = commands.length;
    const averageDuration = commands.reduce((sum, cmd) => sum + (cmd.duration || 0), 0) / commands.length || 0;
    const overallCacheHitRate = performances.reduce((sum, perf) => sum + (perf.cacheHitRate || 0), 0) / performances.length || 0;
    const errorRate = this.events.filter(e => !e.success).length / this.events.length;

    // Top commands
    const topCommands: { [command: string]: number } = {};
    commands.forEach(cmd => {
      if (cmd.command) {
        topCommands[cmd.command] = (topCommands[cmd.command] || 0) + 1;
      }
    });

    // Package manager usage
    const packageManagerUsage: { [packageManager: string]: number } = {};
    this.events.forEach(event => {
      if (event.packageManager) {
        packageManagerUsage[event.packageManager] = (packageManagerUsage[event.packageManager] || 0) + 1;
      }
    });

    return {
      totalCommands,
      averageDuration,
      overallCacheHitRate,
      topCommands,
      packageManagerUsage,
      errorRate
    };
  }

  /**
   * Clear stored events
   */
  async clearEvents(): Promise<void> {
    try {
      const eventsPath = path.join(os.homedir(), '.flash-install', 'events.json');
      await fs.remove(eventsPath);
      this.events = [];
    } catch (error) {
      // Silent failure
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TelemetryOptions {
    return { ...this.options };
  }
}

/**
 * Global telemetry instance
 */
export const telemetry = new TelemetryService();