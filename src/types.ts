/**
 * Package installation options
 */
export interface PackageInstallOptions {
  /** Save to dependencies */
  saveToDependencies?: boolean;
  /** Save to dev dependencies */
  saveToDevDependencies?: boolean;
  /** Save exact version */
  saveExact?: boolean;
}

/**
 * Installation options
 */
export interface InstallOptions {
  /** Number of concurrent installations */
  concurrency?: number;
  /** Package manager to use */
  packageManager?: string;
  /** Whether to include dev dependencies */
  includeDevDependencies?: boolean;
  /** Whether to use cache */
  useCache?: boolean;
  /** Whether to use offline mode */
  offline?: boolean;
  /** Registry URL */
  registry?: string;
  /** Whether to skip postinstall scripts */
  skipPostinstall?: boolean;
  /** Workspace options */
  workspace?: WorkspaceOptions;
  /** Enable fast mode (skip plugins/hooks/logging) */
  fastMode?: boolean;
}

/**
 * Workspace options
 */
export interface WorkspaceOptions {
  /** Whether to enable workspace support */
  enabled?: boolean;
  /** Whether to hoist dependencies */
  hoistDependencies?: boolean;
  /** Whether to install packages in parallel */
  parallelInstall?: boolean;
  /** Maximum concurrency for parallel installation */
  maxConcurrency?: number;
  /** Filter to specific workspaces */
  filter?: string[];
}

/**
 * Package dependency
 */
export interface PackageDependency {
  /** Package name */
  name: string;
  /** Package version */
  version: string;
  /** Package path */
  path: string;
}

/**
 * Telemetry configuration options
 */
export interface TelemetryOptions {
  /** Enable telemetry collection */
  enabled?: boolean;
  /** Unique installation ID */
  installId?: string;
  /** Command usage tracking */
  trackCommands?: boolean;
  /** Performance metrics tracking */
  trackPerformance?: boolean;
  /** Error tracking */
  trackErrors?: boolean;
  /** Anonymize user data */
  anonymize?: boolean;
}

/**
 * Telemetry event data
 */
export interface TelemetryEvent {
  /** Event type */
  type: 'command' | 'performance' | 'error' | 'system';
  /** Command name (for command events) */
  command?: string;
  /** Timestamp */
  timestamp: number;
  /** Duration in milliseconds (for performance events) */
  duration?: number;
  /** Cache hit rate (0-1) */
  cacheHitRate?: number;
  /** Package manager used */
  packageManager?: string;
  /** Number of packages processed */
  packageCount?: number;
  /** Anonymized system hash */
  systemHash?: string;
  /** Error message (for error events) */
  error?: string;
  /** Success flag */
  success?: boolean;
}

/**
 * Telemetry aggregation data
 */
export interface TelemetryStats {
  /** Total commands executed */
  totalCommands: number;
  /** Average execution time */
  averageDuration: number;
  /** Cache hit rate */
  overallCacheHitRate: number;
  /** Most used commands */
  topCommands: { [command: string]: number };
  /** Package manager distribution */
  packageManagerUsage: { [packageManager: string]: number };
  /** Error rate */
  errorRate: number;
}