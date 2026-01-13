import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { execSync, spawn } from 'child_process';
import * as lockfile from '@yarnpkg/lockfile';
import * as ini from 'ini';
import * as toml from 'toml';
import * as jsonc from 'jsonc-parser';
import { logger } from './utils/logger.js';
import * as fsUtils from './utils/fs.js';
import { hashDependencyTree } from './utils/hash.js';
import { cache } from './cache.js';
import { snapshot } from './snapshot.js';
import { WorkerPool, createWorkerFunction } from './utils/worker-pool.js';
import { Timer, createTimer } from './utils/timer.js';
import { ProgressIndicator, Spinner } from './utils/progress.js';
import { ReliableProgress } from './utils/reliable-progress.js';
import { pluginManager, PluginHook } from './plugin.js';
import { verifyPackageIntegrity } from './utils/integrity.js';
import chalk from 'chalk';
import { installPackages, PackageInstallOptions, downloadPackage } from './package-installer.js';
import { workspaceManager, WorkspacePackage } from './workspace.js';
import { InstallOptions as TypedInstallOptions, PackageDependency as TypedPackageDependency } from './types.js';
import { NetworkStatus, networkManager } from './utils/network.js';
import { fallbackManager, FallbackResult } from './utils/fallback.js';
import { CloudCacheConfig } from './cloud/cloud-cache.js';
import { ErrorHandler, FlashError, ErrorCategory, RecoveryStrategy } from './utils/error-handler.js';
import { dependencyAnalyzer, AnalysisResult } from './analysis.js'; // Import dependencyAnalyzer
// Import version from package.json
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = packageJson.version;

/**
 * Package manager types
 */
export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
  BUN = 'bun'
}

/**
 * Installation options
 */
export interface InstallOptions extends TypedInstallOptions {
  offline: boolean;
  useCache: boolean;
  concurrency: number;
  packageManager: PackageManager;
  includeDevDependencies: boolean;
  skipPostinstall: boolean;
  registry?: string;
  /** Whether to enable interactive mode */
  interactive?: boolean;
  workspace?: {
    enabled: boolean;
    hoistDependencies: boolean;
    parallelInstall: boolean;
    maxConcurrency: number;
    filter?: string[];
  };
  network?: {
    /** Whether to check network availability */
    checkAvailability: boolean;
    /** Timeout for network checks in milliseconds */
    timeout: number;
    /** Number of retries for network operations */
    retries: number;
    /** Whether to allow fallbacks in partial offline scenarios */
    allowFallbacks: boolean;
    /** Whether to warn about outdated dependencies in offline mode */
    warnOutdated: boolean;
  };
  /** Cloud cache configuration */
  cloud?: CloudCacheConfig;
  /** Perform lightweight analysis for speed */
  lightweightAnalysis?: boolean;
  /** Enable fast mode (skip plugins/hooks/logging) */
  fastMode?: boolean;
  installTimeoutMs: number;
  batchSize?: number;
  skipPlugins?: boolean;
  skipHooks?: boolean;
  minimalLogging?: boolean;
  nativeExtraction?: boolean;
}

/**
 * Default installation options
 */
const defaultOptions: InstallOptions = {
  offline: false,
  useCache: true,
  concurrency: Math.max(1, os.cpus().length - 1),
  packageManager: PackageManager.NPM,
  includeDevDependencies: true,
  skipPostinstall: false,
  interactive: true,
  workspace: {
    enabled: false,
    hoistDependencies: true,
    parallelInstall: true,
    maxConcurrency: 4
  },
  network: {
    checkAvailability: true,
    timeout: 5000,
    retries: 2,
    allowFallbacks: true,
    warnOutdated: true
  },
  installTimeoutMs: 120000
};

/**
 * Package dependency information
 */
interface PackageDependency extends TypedPackageDependency {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  isWorkspace?: boolean;
}

/**
 * Installer for managing dependencies
 */
export class Installer {
  private options: InstallOptions;
  private workerPool: WorkerPool<PackageDependency, boolean> | null = null;

  /**
   * Create a new installer
   * @param options Installation options
   */
  constructor(options: Partial<InstallOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Initialize the installer
   */
  async init(): Promise<void> {
    // Initialize cache with cloud configuration if provided
    if (this.options.cloud) {
await cache.init();
    } else {
      await cache.init();
    }

    // Create worker pool for parallel installation
    if (this.options.concurrency > 1) {
      const workerFunction = createWorkerFunction<PackageDependency, boolean>(async (pkg: PackageDependency) => {
        try {
          // This function will run in parallel
          const nodeModulesPath = path.join(pkg.path, 'node_modules', pkg.name);

          // Skip workspace packages when installing in workspace mode
          if (pkg.isWorkspace) {
            logger.debug(`Skipping workspace package: ${pkg.name}`);
            return true;
          }

          // Check if package is in cache
          if (await cache.hasPackage(pkg.name, pkg.version)) {
            await cache.restorePackage(pkg.name, pkg.version, nodeModulesPath);
            return true;
          }

          // Direct download from npm registry (much faster than using npm install)
          const registryUrl = this.options.registry || 'https://registry.npmjs.org';
          const packageUrl = `${registryUrl}/${encodeURIComponent(pkg.name)}/-/${pkg.name}-${pkg.version}.tgz`;

          try {
            // Create temp directory
            const tempDir = path.join(os.tmpdir(), `flash-install-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
            await fsUtils.ensureDir(tempDir);

            // Download and extract package
            const tarballPath = path.join(tempDir, 'package.tgz');

            // Download using curl (much faster than npm)
            execSync(`curl -s -L -o "${tarballPath}" "${packageUrl}"`, { stdio: 'ignore' });

            // Extract tarball
            await fsUtils.ensureDir(nodeModulesPath);
            execSync(`tar -xzf "${tarballPath}" -C "${nodeModulesPath}" --strip-components=1`, { stdio: 'ignore' });

            // Clean up
            await fsUtils.remove(tempDir);

            // Add to cache
            await cache.addPackage(pkg.name, pkg.version, nodeModulesPath);
            return true;
          } catch (directError) {
            // Fall back to package manager if direct download fails
            const cmd = {
              [PackageManager.NPM]: `npm install ${pkg.name}@${pkg.version} --no-save`,
              [PackageManager.YARN]: `yarn add ${pkg.name}@${pkg.version} --no-save`,
              [PackageManager.PNPM]: `pnpm add ${pkg.name}@${pkg.version} --no-save`,
              [PackageManager.BUN]: `bun add ${pkg.name}@${pkg.version} --no-save`
            }[this.options.packageManager];

            execSync(cmd, { cwd: pkg.path, stdio: 'ignore' });

            // Add to cache
            await cache.addPackage(pkg.name, pkg.version, nodeModulesPath);
            return true;
          }
        } catch (error) {
          console.error(`Error installing ${pkg.name}@${pkg.version}: ${error}`);
          return false;
        }
      }, this.options.installTimeoutMs);

      this.workerPool = new WorkerPool<PackageDependency, boolean>(workerFunction, this.options.concurrency, { taskTimeoutMs: this.options.installTimeoutMs, initialBatchSize: this.options.batchSize });
      await this.workerPool.init();
    }
  }

  /**
   * Detect the package manager used in the project
   * @param projectDir The project directory
   * @returns The detected package manager
   */
  detectPackageManager(projectDir: string): PackageManager {
    // Check for Bun lockfile (bun.lockb)
    if (fs.existsSync(path.join(projectDir, 'bun.lockb'))) {
      return PackageManager.BUN;
    }
    // Check for Yarn lockfile
    else if (fs.existsSync(path.join(projectDir, 'yarn.lock'))) {
      return PackageManager.YARN;
    }
    // Check for PNPM lockfile
    else if (fs.existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) {
      return PackageManager.PNPM;
    }
    // Check for NPM lockfile
    else if (fs.existsSync(path.join(projectDir, 'package-lock.json'))) {
      return PackageManager.NPM;
    }
    // Default to NPM if no lockfile is found
    else {
      return PackageManager.NPM;
    }
  }

  /**
   * Check if a package manager is installed
   * @param packageManager The package manager to check
   * @returns True if the package manager is installed
   */
  isPackageManagerInstalled(packageManager: PackageManager): boolean {
    try {
      const cmd = {
        [PackageManager.NPM]: 'npm --version',
        [PackageManager.YARN]: 'yarn --version',
        [PackageManager.PNPM]: 'pnpm --version',
        [PackageManager.BUN]: 'bun --version'
      }[packageManager];

      execSync(cmd, { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the version of a package manager
   * @param packageManager The package manager
   * @returns The version string or null if not installed
   */
  getPackageManagerVersion(packageManager: PackageManager): string | null {
    try {
      const cmd = {
        [PackageManager.NPM]: 'npm --version',
        [PackageManager.YARN]: 'yarn --version',
        [PackageManager.PNPM]: 'pnpm --version',
        [PackageManager.BUN]: 'bun --version'
      }[packageManager];

      const output = execSync(cmd, { encoding: 'utf8' }).trim();
      return output;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse package.json file
   * @param projectDir The project directory
   * @returns The parsed package data
   */
  async parsePackageJson(projectDir: string): Promise<PackageDependency> {
    const packageJsonPath = path.join(projectDir, 'package.json');

    if (!await fsUtils.fileExists(packageJsonPath)) {
      throw new Error('package.json not found');
    }

    const packageJson = await fs.readJSON(packageJsonPath);

    return {
      name: packageJson.name || 'root',
      version: packageJson.version || '0.0.0',
      path: projectDir,
      dependencies: packageJson.dependencies || {},
      devDependencies: packageJson.devDependencies || {},
      scripts: packageJson.scripts || {}
    };
  }

  /**
   * Parse npm lockfile (package-lock.json)
   * @param projectDir The project directory
   * @returns The parsed dependencies
   */
  async parseNpmLockfile(projectDir: string): Promise<Record<string, string>> {
    const lockfilePath = path.join(projectDir, 'package-lock.json');

    if (!await fsUtils.fileExists(lockfilePath)) {
      throw new Error('package-lock.json not found');
    }

    const lockfileContent = await fs.readJSON(lockfilePath);
    const dependencies: Record<string, string> = {};

    // Handle different lockfile versions
    if (lockfileContent.lockfileVersion >= 2) {
      // v2+ format
      for (const [name, pkg] of Object.entries(lockfileContent.packages)) {
        if (name === '') continue; // Skip root package

        // Remove leading 'node_modules/' if present
        const pkgName = name.startsWith('node_modules/')
          ? name.substring('node_modules/'.length)
          : name;

        // @ts-ignore - pkg.version exists in the lockfile
        dependencies[pkgName] = pkg.version;
      }
    } else {
      // v1 format
      for (const [name, pkg] of Object.entries(lockfileContent.dependencies || {})) {
        // @ts-ignore - pkg.version exists in the lockfile
        dependencies[name] = pkg.version;
      }
    }

    return dependencies;
  }

  /**
   * Parse yarn lockfile (yarn.lock)
   * @param projectDir The project directory
   * @returns The parsed dependencies
   */
  async parseYarnLockfile(projectDir: string): Promise<Record<string, string>> {
    const lockfilePath = path.join(projectDir, 'yarn.lock');

    if (!await fsUtils.fileExists(lockfilePath)) {
      throw new Error('yarn.lock not found');
    }

    const lockfileContent = await fs.readFile(lockfilePath, 'utf8');
    const parsed = lockfile.parse(lockfileContent);

    if (parsed.type !== 'success') {
      throw new Error('Failed to parse yarn.lock');
    }

    const dependencies: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed.object)) {
      // Extract package name from the key (format: "package-name@^1.0.0")
      const name = key.substring(0, key.lastIndexOf('@'));
      // @ts-ignore - value.version exists in the lockfile
      dependencies[name] = value.version;
    }

    return dependencies;
  }

  /**
   * Parse pnpm lockfile (pnpm-lock.yaml)
   * @param projectDir The project directory
   * @returns The parsed dependencies
   */
  async parsePnpmLockfile(projectDir: string): Promise<Record<string, string>> {
    const lockfilePath = path.join(projectDir, 'pnpm-lock.yaml');

    if (!await fsUtils.fileExists(lockfilePath)) {
      throw new Error('pnpm-lock.yaml not found');
    }

    // Simple YAML parsing for pnpm lockfile
    const lockfileContent = await fs.readFile(lockfilePath, 'utf8');
    const dependencies: Record<string, string> = {};

    // Extract package versions from the lockfile
    // This is a simplified approach - a proper YAML parser would be better
    const packageRegex = /\/([^/]+)\/([^:]+):/g;
    let match;

    while ((match = packageRegex.exec(lockfileContent)) !== null) {
      const name = match[1];
      const version = match[2];
      dependencies[name] = version;
    }

    return dependencies;
  }

  /**
   * Parse lockfile based on package manager
   * @param projectDir The project directory
   * @param packageManager The package manager
   * @returns The parsed dependencies
   */
  async parseLockfile(
    projectDir: string,
    packageManager = this.options.packageManager
  ): Promise<Record<string, string>> {
    switch (packageManager) {
      case PackageManager.NPM:
        return this.parseNpmLockfile(projectDir);
      case PackageManager.YARN:
        return this.parseYarnLockfile(projectDir);
      case PackageManager.PNPM:
        return this.parsePnpmLockfile(projectDir);
      case PackageManager.BUN:
        return this.parseBunLockfile(projectDir);
      default:
        throw new Error(`Unsupported package manager: ${packageManager}`);
    }
  }

  /**
   * Parse Bun lockfile (bun.lockb)
   * @param projectDir The project directory
   * @returns The parsed dependencies
   */
  async parseBunLockfile(projectDir: string): Promise<Record<string, string>> {
    try {
      logger.debug('Parsing Bun lockfile...');

      // Since bun.lockb is a binary file, we'll extract dependencies from package.json
      // and then use the 'bun pm ls' command to get the resolved versions

      // First, parse package.json to get the dependencies
      const pkg = await this.parsePackageJson(projectDir);
      const dependencies: Record<string, string> = { ...pkg.dependencies };

      // Include dev dependencies if needed
      if (this.options.includeDevDependencies && pkg.devDependencies) {
        Object.assign(dependencies, pkg.devDependencies);
      }

      // Try to get the resolved versions using 'bun pm ls --json'
      try {
        const bunLsOutput = execSync('bun pm ls --json', {
          cwd: projectDir,
          stdio: ['ignore', 'pipe', 'ignore'],
          encoding: 'utf8'
        });

        // Parse the JSON output
        const bunLsData = JSON.parse(bunLsOutput);
        const resolvedDependencies: Record<string, string> = {};

        // Process the dependencies from bun pm ls
        if (bunLsData && bunLsData.packages) {
          Object.entries(bunLsData.packages).forEach(([pkgName, pkgInfo]: [string, any]) => {
            if (pkgName && pkgInfo && pkgInfo.version) {
              // Remove the package scope from the name if it exists
              const simpleName = pkgName.split('/').pop() || pkgName;
              resolvedDependencies[simpleName] = pkgInfo.version;
            }
          });

          logger.debug(`Resolved ${Object.keys(resolvedDependencies).length} dependencies from Bun`);
          return resolvedDependencies;
        }
      } catch (error) {
        logger.debug(`Failed to get resolved versions from Bun: ${error}`);
        logger.debug('Falling back to package.json dependencies');
      }

      // If we couldn't get the resolved versions, return the dependencies from package.json
      return dependencies;
    } catch (error) {
      logger.error(`Failed to parse Bun lockfile: ${error}`);
      throw error;
    }
  }

  /**
   * Install dependencies
   * @param projectDir The project directory
   * @returns True if successful
   */
  async install(projectDir: string): Promise<boolean> {
    // Start overall timer
    const totalTimer = createTimer();

    // Create context for error handling
    const context = {
      projectDir,
      packageManager: this.options.packageManager,
      includeDevDependencies: this.options.includeDevDependencies,
      offline: this.options.offline,
      useCache: this.options.useCache,
      concurrency: this.options.concurrency
    };

    try {
      if (!this.options.fastMode) {
      // Print banner
        logger.flash(`flash-install v${version}`);
      logger.flash(`Installing dependencies in ${projectDir}`);
      // Initialize plugin manager with the correct project directory
      await ErrorHandler.withErrorHandling(
        async () => await pluginManager.init(projectDir),
        { ...context, operation: 'plugin-init' },
        {
          maxRetries: 2,
          onRetry: (error, attempt) => {
            logger.warn(`Retrying plugin initialization (attempt ${attempt}/2)`);
          }
        }
      );
      }
      // Detect package manager if not specified
      if (!this.options.packageManager) {
        this.options.packageManager = this.detectPackageManager(projectDir);
        context.packageManager = this.options.packageManager;
      }

      // Check if the package manager is installed
      if (!this.isPackageManagerInstalled(this.options.packageManager)) {
        logger.warn(`Package manager ${chalk.bold(this.options.packageManager)} is not installed.`);

        // Try to find an installed package manager
        const availablePackageManagers = [
          PackageManager.NPM,
          PackageManager.YARN,
          PackageManager.PNPM,
          PackageManager.BUN
        ].filter(pm => this.isPackageManagerInstalled(pm));

        if (availablePackageManagers.length > 0) {
          const fallbackPackageManager = availablePackageManagers[0];
          logger.warn(`Falling back to ${chalk.bold(fallbackPackageManager)}`);
          this.options.packageManager = fallbackPackageManager;
          context.packageManager = fallbackPackageManager;
        } else {
          logger.error('No supported package managers found. Please install npm, yarn, pnpm, or bun.');
          return false;
        }
      }

      // Get package manager version
      const packageManagerVersion = this.getPackageManagerVersion(this.options.packageManager);

      logger.info(`Using package manager: ${this.options.packageManager}${packageManagerVersion ? ` v${packageManagerVersion}` : ''}`);

      // Check for workspaces
      let hasWorkspaces = false;
      if (this.options.workspace?.enabled) {
        logger.info(`Checking for workspaces...`);

        try {
          hasWorkspaces = await ErrorHandler.withErrorHandling(
            async () => await workspaceManager.init(projectDir),
            { ...context, operation: 'workspace-init' },
            { maxRetries: 2 }
          );

          if (hasWorkspaces) {
            logger.success(`Found ${workspaceManager.getPackages().length.toString()} workspace packages`);
          } else {
            logger.info(`No workspaces found, continuing with regular installation`);
          }
        } catch (error) {
          // If workspace initialization fails, continue with regular installation
          if (error instanceof FlashError) {
            logger.warn(`Workspace initialization failed: ${error.message}`);
            logger.warn('Continuing with regular installation');
          } else {
            throw error;
          }
        }
      }

      // Parse package.json and lockfile, potentially using lightweight analysis
      let pkg: PackageDependency;
      let dependencies: Record<string, string>;

      if (this.options.lightweightAnalysis) {
        logger.info(`Performing lightweight dependency analysis...`);
        const analysisResult = await ErrorHandler.withErrorHandling(
          async () => await dependencyAnalyzer.analyze(projectDir),
          { ...context, operation: 'lightweight-analysis' },
          { maxRetries: 2 }
        );
        pkg = await this.parsePackageJson(projectDir); // Still need pkg for scripts etc.
        dependencies = Object.entries(analysisResult.dependencies).reduce((acc, [name, info]) => {
          acc[name] = info.version;
          return acc;
        }, {} as Record<string, string>);
        logger.debug(`Lightweight analysis completed.`);
      } else {
        // Existing full analysis logic
        const parseTimer = createTimer();
        logger.info(`Parsing package.json...`);

        pkg = await ErrorHandler.withErrorHandling(
          async () => await this.parsePackageJson(projectDir),
          { ...context, operation: 'parse-package-json' },
          {
            maxRetries: 3,
            retryDelay: 500,
            onRetry: (error, attempt) => {
              logger.warn(`Retrying package.json parsing (attempt ${attempt}/3)`);
            }
          }
        );

        logger.debug(`Parsed package.json in ${parseTimer.getElapsedFormatted()}`);

        // Parse lockfile
        const lockfileTimer = createTimer();

        try {
          logger.info(`Parsing lockfile...`);

          dependencies = await ErrorHandler.withErrorHandling(
            async () => await this.parseLockfile(projectDir, this.options.packageManager),
            { ...context, operation: 'parse-lockfile' },
            { maxRetries: 2 }
          );

          logger.debug(`Parsed lockfile in ${lockfileTimer.getElapsedFormatted()}`);
        } catch (error) {
          // Handle lockfile parsing errors with graceful fallback
          if (error instanceof FlashError) {
            logger.warn(`${error.message} (${error.category})`);
          } else {
            logger.warn(`Failed to parse lockfile: ${error}`);
          }

          logger.warn(`Falling back to package.json dependencies`);
          dependencies = { ...pkg.dependencies };

          if (this.options.includeDevDependencies) {
            dependencies = { ...dependencies, ...pkg.devDependencies };
          }
        }
      }

      // If we have workspaces and hoisting is enabled, merge dependencies
      if (hasWorkspaces && this.options.workspace?.hoistDependencies) {
        logger.info(`Hoisting workspace dependencies...`);
        const workspaceDeps = workspaceManager.getAllDependencies(this.options.includeDevDependencies);

        // Merge with root dependencies, preferring workspace versions
        for (const [name, version] of Object.entries(workspaceDeps)) {
          dependencies[name] = version;
        }

        // Log updated dependency count
        const depCount = Object.keys(dependencies).length;
        logger.success(`Found ${depCount.toString()} ${depCount === 1 ? 'dependency' : 'dependencies'} to install (including workspace dependencies)`);
      } else {
        // Log dependency count
        const depCount = Object.keys(dependencies).length;
        logger.success(`Found ${depCount.toString()} ${depCount === 1 ? 'dependency' : 'dependencies'} to install`);
      }

      // Create plugin context
      const nodeModulesPath = path.join(projectDir, 'node_modules');
      const pluginContext = {
        projectDir,
        dependencies,
        nodeModulesPath,
        packageManager: this.options.packageManager,
        workspaces: hasWorkspaces ? workspaceManager.getPackages() : []
      };

      if (!this.options.fastMode) {
      // Run pre-install hooks
      logger.info('Running PRE_INSTALL hooks...');
      await pluginManager.runHook(PluginHook.PRE_INSTALL, pluginContext);
      logger.info('Finished running PRE_INSTALL hooks');
      }

      // Check if we have a valid snapshot
      const snapshotCheckTimer = createTimer();
      logger.info(`Checking for valid snapshot...`);
      const hasValidSnapshot = await snapshot.isValid(projectDir, dependencies);
      logger.debug(`Checked snapshot validity in ${snapshotCheckTimer.getElapsedFormatted()}`);

      if (hasValidSnapshot) {
        logger.success(`Valid .flashpack snapshot found, restoring from snapshot...`);

        // Run pre-restore hooks
        await pluginManager.runHook(PluginHook.PRE_RESTORE, pluginContext);

        const restoreTimer = createTimer();

        const success = await snapshot.restore(projectDir);

        if (success) {
          // Run post-restore hooks
          await pluginManager.runHook(PluginHook.POST_RESTORE, pluginContext);

          logger.success(`Restored from snapshot in ${restoreTimer.getElapsedFormatted()}`);
          logger.success(`Total time: ${totalTimer.getElapsedFormatted()}`);

          // Compare with estimated npm install time
          const depCount = Object.keys(dependencies).length;
          const estimatedNpmTime = depCount * 0.5; // rough estimate: 0.5s per dependency
          const speedup = estimatedNpmTime / restoreTimer.getElapsedSeconds();
          if (speedup > 1) {
            logger.flash(`${speedup.toFixed(1)}x faster than npm install`);
          }

          // Run post-install hooks
          await pluginManager.runHook(PluginHook.POST_INSTALL, pluginContext);
        }

        return success;
      }

      // Check if we have the dependency tree in cache
      if (this.options.useCache) {
        const cacheCheckTimer = createTimer();
        logger.info(`Checking cache for dependency tree...`);
        const hasCachedTree = await cache.hasDependencyTree(dependencies);
        logger.debug(`Checked cache in ${cacheCheckTimer.getElapsedFormatted()}`);

        if (hasCachedTree) {
          logger.success(`Dependency tree found in cache, restoring...`);
          const restoreTimer = createTimer();

          // Show progress during cache restoration
          let lastProgress = 0;
          const progressInterval = setInterval(() => {
            lastProgress += 5;
            if (lastProgress <= 100) {
              process.stdout.write(`\r${chalk.gray(`→ Restoring from cache... ${lastProgress}%`)}`);
            }
          }, 100);

          const success = await cache.restoreDependencyTree(dependencies, nodeModulesPath);

          clearInterval(progressInterval);
          process.stdout.write(`\r${chalk.gray(`→ Restoring from cache... 100%`)}\n`);

          if (success) {
            logger.success(`Restored from cache in ${restoreTimer.getElapsedFormatted()}`);
            logger.success(`Total time: ${totalTimer.getElapsedFormatted()}`);

            // Compare with estimated npm install time
            const depCount2 = Object.keys(dependencies).length;
            const estimatedNpmTime = depCount2 * 0.5; // rough estimate: 0.5s per dependency
            const speedup = estimatedNpmTime / restoreTimer.getElapsedSeconds();
            if (speedup > 1) {
              logger.flash(`${speedup.toFixed(1)}x faster than npm install`);
            }

            // Run post-install hooks
            await pluginManager.runHook(PluginHook.POST_INSTALL, pluginContext);
          }

          return success;
        } else {
          logger.info(`No cache hit found for current dependencies`);
        }
      }

      // Check network availability if needed
      let networkStatus = NetworkStatus.ONLINE;

      if (this.options.network?.checkAvailability) {
        logger.info(`Checking network availability...`);

        try {
          const networkCheck = await networkManager.checkNetwork({
            registry: this.options.registry,
            timeout: this.options.network.timeout,
            retries: this.options.network.retries
          });

          networkStatus = networkCheck.status;

          if (networkStatus === NetworkStatus.OFFLINE) {
            logger.warn(`Network is offline`);
          } else if (networkStatus === NetworkStatus.PARTIAL) {
            logger.warn(`Network is partially available (${networkCheck.registryAvailable ? 'registry available' : 'registry unavailable'})`);
          }
        } catch (error) {
          logger.debug(`Network check failed: ${error}`);
          networkStatus = NetworkStatus.UNKNOWN;
          logger.warn(`Network status check failed, assuming offline`);
        }
      }

      // If offline mode is enabled or network is unavailable
      if (this.options.offline || networkStatus === NetworkStatus.OFFLINE) {
        // Try to find fallbacks for all dependencies
        if (this.options.network?.allowFallbacks) {
          logger.info(`Searching for fallbacks in offline mode...`);

          const fallbacks = await fallbackManager.findFallbacks(dependencies, {
            allowVersionFallback: true,
            useCache: this.options.useCache,
            useSnapshot: true,
            useLocal: true,
            projectDir,
            checkNetwork: false // Already checked
          });

          // Count fallbacks
          const totalDeps = Object.keys(dependencies).length;
          const foundExact = Object.values(fallbacks).filter(f => f.found && f.exactVersion).length;
          const foundFallback = Object.values(fallbacks).filter(f => f.found && !f.exactVersion).length;
          const missing = totalDeps - foundExact - foundFallback;

          if (missing === 0) {
            logger.success(`Found fallbacks for all ${totalDeps} dependencies (${foundExact} exact, ${foundFallback} compatible versions)`);

            // Install from fallbacks
            const fallbackTimer = createTimer();
            logger.info(`Installing from fallbacks...`);

            const fallbackSuccess = await this.installFromFallbacks(projectDir, fallbacks);

            if (fallbackSuccess) {
              logger.success(`Installed from fallbacks in ${fallbackTimer.getElapsedFormatted()}`);

              // Warn about non-exact versions if needed
              if (foundFallback > 0 && this.options.network?.warnOutdated) {
                              logger.warn(`${foundFallback} dependencies were installed with compatible versions rather than exact versions`);
              logger.warn(`Run 'flash-install sync' when online to update to exact versions`);
              }

              return true;
            } else {
              logger.error(`Failed to install from fallbacks`);
            }
          } else {
            logger.error(`Missing fallbacks for ${missing} dependencies in offline mode`);

            // List missing dependencies
            const missingDeps = Object.entries(dependencies)
              .filter(([name]) => !fallbacks[name] || !fallbacks[name].found)
              .map(([name, version]) => `${name}@${version}`)
              .join(', ');

            logger.error(`Missing: ${missingDeps}`);
            return false;
          }
        } else {
          logger.error(`Offline mode is enabled but dependencies are not in cache`);
          return false;
        }
      }

      // If network is partially available, warn but continue
      if (networkStatus === NetworkStatus.PARTIAL) {
        logger.warn(`Network is partially available, installation may fail for some packages`);
        logger.warn(`Use --offline flag to force offline mode with fallbacks`);
      }

      // Install dependencies using package manager
      logger.info(`Installing dependencies using ${this.options.packageManager}...`);

      const installTimer = createTimer();
      let success = false;

      // Add a simple progress indicator that updates every second
      const progressInterval = setInterval(() => {
        const elapsed = installTimer.getElapsedSeconds();
        const dots = '.'.repeat(Math.floor(elapsed) % 4);
        const spaces = ' '.repeat(3 - dots.length);
        process.stdout.write(`\r${chalk.cyan('→')} Installing packages${dots}${spaces}`);
      }, 250);

      try {
        if (this.workerPool && this.options.concurrency > 1) {
          // Parallel installation using worker threads
          console.log(chalk.gray(`\n→ Using parallel installation with ${this.options.concurrency} workers`));
          success = await this.installParallel(projectDir, dependencies);
        } else {
          // Sequential installation using package manager
          console.log(chalk.gray(`\n→ Using sequential installation`));
          success = await this.installSequential(projectDir);
        }
      } finally {
        // Always clear the interval
        clearInterval(progressInterval);
        // Clear the progress line
        process.stdout.write('\r                                \r');
      }

      if (!success) {
        console.log(chalk.red(`✗ Installation failed`));
        return false;
      }

      logger.success(`Dependencies installed in ${installTimer.getElapsedFormatted()}`);

      // Install workspace packages if needed
      if (hasWorkspaces) {
        console.log(chalk.cyan(`→ Installing workspace packages...`));
        const workspaceTimer = createTimer();

        const workspaceSuccess = await this.installWorkspaces(projectDir);

        if (!workspaceSuccess) {
          console.log(chalk.red(`✗ Workspace installation failed`));
          return false;
        }

        logger.success(`Workspace packages installed in ${workspaceTimer.getElapsedFormatted()}`);
      }

      // Run postinstall scripts if needed
      if (!this.options.skipPostinstall && pkg.scripts && pkg.scripts.postinstall) {
        logger.info('Running postinstall script...');
        const postinstallTimer = createTimer();
        const spinner = new Spinner('Running postinstall script');
        spinner.start();

        const postinstallSuccess = await this.runScript(projectDir, 'postinstall');

        spinner.stop();
        if (postinstallSuccess) {
          logger.success(`Postinstall completed in ${postinstallTimer.getElapsedFormatted()}`);
        } else {
          logger.error('Postinstall script failed');
        }
      }

      // Create snapshot in background (non-blocking)
      logger.info('Creating .flashpack snapshot...');

      // Run pre-snapshot hooks
      await pluginManager.runHook(PluginHook.PRE_SNAPSHOT, pluginContext);

      const snapshotTimer = createTimer();

      // Fire-and-forget: create snapshot in background, don't wait for it
      snapshot.create(projectDir, dependencies)
        .then(async (snapshotSuccess) => {
          if (snapshotSuccess) {
            // Run post-snapshot hooks
            await pluginManager.runHook(PluginHook.POST_SNAPSHOT, pluginContext);
            logger.debug(`Snapshot created in background: ${snapshotTimer.getElapsedFormatted()}`);
          }
        })
        .catch((error) => {
          logger.debug(`Background snapshot creation failed (non-blocking): ${error}`);
        });

      logger.debug('Snapshot creation started in background (install can now complete)');

      // Run post-install hooks
      if (!this.options.fastMode) {
      console.log('\n🔌 Running POST_INSTALL hooks...');
      await pluginManager.runHook(PluginHook.POST_INSTALL, pluginContext);
      console.log('🔌 Finished running POST_INSTALL hooks');
      }

      // Log total time
      logger.success(`Total time: ${totalTimer.getElapsedFormatted()}`);

      // Calculate estimated npm install time based on dependency count
      try {
        logger.info('Calculating performance comparison...');

        // Get dependency count
        const pkg = await this.parsePackageJson(projectDir);
        const dependencies = { ...pkg.dependencies };
        if (this.options.includeDevDependencies && pkg.devDependencies) {
          Object.assign(dependencies, pkg.devDependencies);
        }

        const depCount = Object.keys(dependencies).length;

        // Estimate npm install time based on dependency count
        // These are conservative estimates based on real-world observations
        // npm typically takes ~1-2s per package on a fast connection
        const estimatedNpmTime = Math.max(5, depCount * 1.5); // minimum 5 seconds
        const flashTime = totalTimer.getElapsedSeconds();
        const speedup = estimatedNpmTime / flashTime;

        if (speedup > 1) {
          logger.flash(`⚡ Estimated ${speedup.toFixed(1)}x faster than npm install`);

          // Add more detailed information for larger projects
          if (depCount > 10) {
            const savedTime = estimatedNpmTime - flashTime;
            logger.info(`Saved approximately ${savedTime.toFixed(1)} seconds`);
          }
        } else {
          // For first-time installs, we might be slower due to caching overhead
          logger.info(`First install completed. Future installs will be much faster.`);
        }

        // Add information about future performance
        if (await snapshot.isValid(projectDir, dependencies)) {
          const snapshotRestoreTime = 2 + (depCount * 0.05); // Estimate: base 2s + 0.05s per package
          const futureSpeedup = estimatedNpmTime / snapshotRestoreTime;
          logger.flash(`⚡ Future installs will be ~${futureSpeedup.toFixed(1)}x faster using snapshots`);
        }
      } catch (error) {
        logger.debug(`Failed to calculate performance comparison: ${error}`);
      }

      return true;
    } catch (error) {
      logger.error(`Installation failed: ${error}`);
      return false;
    }
  }

  /**
   * Install dependencies sequentially using package manager
   * @param projectDir The project directory
   * @returns True if successful
   */
  private async installSequential(projectDir: string): Promise<boolean> {
    // Create spinner
    const spinner = new Spinner('Preparing to install dependencies');
    spinner.start();

    try {
      // Get dependencies from package.json
      const pkg = await this.parsePackageJson(projectDir);
      const dependencies = { ...pkg.dependencies };

      if (this.options.includeDevDependencies && pkg.devDependencies) {
        Object.assign(dependencies, pkg.devDependencies);
      }

      // Create node_modules directory
      const nodeModulesPath = path.join(projectDir, 'node_modules');
      await fsUtils.ensureDir(nodeModulesPath);

      // Install each dependency
      const depEntries = Object.entries(dependencies);
      let installed = 0;

      for (const [name, version] of depEntries) {
        spinner.setMessage(`Installing ${name}@${version} (${installed + 1}/${depEntries.length})`);

        const packageNodeModulesPath = path.join(nodeModulesPath, name);

        // Check if package is in cache
        if (await cache.hasPackage(name, version)) {
          await cache.restorePackage(name, version, packageNodeModulesPath);
          installed++;
          continue;
        }

        // Direct download from npm registry (much faster than using npm install)
        const registryUrl = 'https://registry.npmjs.org';
        const packageUrl = `${registryUrl}/${encodeURIComponent(name)}/-/${name}-${version.replace(/^[\^~]/, '')}.tgz`;

        try {
          // Create temp directory
          const tempDir = path.join(os.tmpdir(), `flash-install-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
          await fsUtils.ensureDir(tempDir);

          // Download and extract package
          const tarballPath = path.join(tempDir, 'package.tgz');

          // Download using curl (much faster than npm)
          execSync(`curl -s -L -o "${tarballPath}" "${packageUrl}"`, { stdio: 'ignore' });

          // Extract tarball
          await fsUtils.ensureDir(packageNodeModulesPath);
          execSync(`tar -xzf "${tarballPath}" -C "${packageNodeModulesPath}" --strip-components=1`, { stdio: 'ignore' });

          // Clean up
          await fsUtils.remove(tempDir);

          // Add to cache
          await cache.addPackage(name, version, packageNodeModulesPath);
          installed++;
        } catch (directError) {
          // Fall back to package manager if direct download fails
          spinner.setMessage(`Falling back to ${this.options.packageManager} for ${name}@${version}`);

          const cmd = {
            [PackageManager.NPM]: `npm install ${name}@${version} --no-save`,
            [PackageManager.YARN]: `yarn add ${name}@${version} --no-save`,
            [PackageManager.PNPM]: `pnpm add ${name}@${version} --no-save`,
            [PackageManager.BUN]: `bun add ${name}@${version} --no-save`
          }[this.options.packageManager];

          execSync(cmd, { cwd: projectDir, stdio: 'ignore' });

          // Add to cache
          await cache.addPackage(name, version, packageNodeModulesPath);
          installed++;
        }
      }

      spinner.stop();
      logger.success(`${installed} packages installed successfully`);
      return true;
    } catch (error) {
      spinner.stop();
      logger.error(`Installation failed: ${error}`);
      return false;
    }
  }

  /**
   * Install dependencies in parallel using worker threads
   * @param projectDir The project directory
   * @param dependencies The dependencies to install
   * @returns True if successful
   */
  private async installParallel(
    projectDir: string,
    dependencies: Record<string, string>
  ): Promise<boolean> {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized');
    }

    // Create node_modules directory
    const nodeModulesPath = path.join(projectDir, 'node_modules');
    await fsUtils.ensureDir(nodeModulesPath);

    // Prepare tasks for worker pool
    const tasks: PackageDependency[] = Object.entries(dependencies)
      .filter(([name, version]) => {
        // Skip workspace packages (they'll be handled separately)
        if (name.startsWith('packages/') || name.includes('/node_modules/')) {
          logger.info(`Skipping workspace package: ${name}`);
          return false;
        }

        // Skip packages with 'undefined' in name or version
        if (name.includes('undefined') || version === 'undefined' || version === undefined) {
          logger.warn(`Skipping invalid package: ${name}@${version}`);
          return false;
        }

        // Skip invalid package names or versions
        if (name.includes('/')) {
          logger.info(`Skipping package with path: ${name}`);
          return false;
        }

        return true;
      })
      .map(([name, version]) => ({
        name,
        version,
        path: projectDir,
        dependencies: {}
      }));

    // Execute tasks in parallel with progress tracking
    const totalPackages = tasks.length;
    console.log(chalk.cyan(`→ Installing ${chalk.bold(totalPackages.toString())} packages in parallel...`));

    // Create reliable progress reporter
    const progress = new ReliableProgress('Installing packages');
    progress.start();

    // Track installed packages
    let installed = 0;
    let failed = 0;
    let lastPackage = '';

    // Process in batches
    const batchSize = this.options.concurrency;

    // Add immediate feedback
    logger.info(`Starting installation in batches of ${batchSize} packages`);

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);

      // Update progress with current batch info
      const currentBatch = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(tasks.length / batchSize);

      // Log batch start for immediate feedback
      console.log(chalk.cyan(`→ Processing batch ${currentBatch}/${totalBatches} (${batch.length} packages)`));

      // Show which packages are in this batch
      const packageNames = batch.map(t => `${chalk.green(t.name)}@${chalk.yellow(t.version)}`).join(', ');
      console.log(chalk.gray(`  Packages: ${packageNames}`));

      // Update progress status
      progress.updateStatus(`Batch ${currentBatch}/${totalBatches}`)

      // Execute batch with enhanced error handling
      const batchResults = await Promise.all(
        batch.map(async (task) => {
          // Create context for error handling
          const taskContext = {
            package: task.name,
            version: task.version,
            path: task.path,
            operation: 'install-package'
          };

          // Update progress with current package
          lastPackage = `${task.name}@${task.version}`;
          progress.updateStatus(`Installing ${chalk.green(lastPackage)} (${installed}/${totalPackages})`);

          try {
            // Use error handling wrapper for package installation
            const result = await ErrorHandler.withErrorHandling(
              async () => await this.workerPool!.execute(task),
              taskContext,
              {
                maxRetries: 2,
                retryDelay: 1000,
                onRetry: (error, attempt) => {
                  logger.warn(`Retrying installation of ${task.name}@${task.version} (attempt ${attempt}/2)`);
                  progress.updateStatus(`Retrying ${chalk.yellow(lastPackage)} (attempt ${attempt}/2)`);
                }
              }
            );

            if (result) {
              installed++;
              // Log success
              console.log(chalk.green(`✓ Installed ${chalk.bold(task.name)}@${chalk.bold(task.version)} (${installed}/${totalPackages})`));
            } else {
              failed++;
              // Log failure
              console.log(chalk.red(`✗ Failed to install ${chalk.bold(task.name)}@${chalk.bold(task.version)}`));
            }
            return result;
          } catch (error) {
            failed++;

            // Enhanced error reporting
            if (error instanceof FlashError) {
              // Categorized error with recovery information
              console.log(chalk.red(`✗ Error installing ${chalk.bold(task.name)}@${chalk.bold(task.version)}: ${error.message}`));
              logger.debug(`Error category: ${error.category}, Recovery strategy: ${error.recoveryStrategy}`);

              // For specific error categories, provide more helpful messages
              if (error.category === ErrorCategory.NETWORK) {
                console.log(chalk.yellow(`  → Network issue detected. Check your internet connection.`));
              } else if (error.category === ErrorCategory.PACKAGE_NOT_FOUND) {
                console.log(chalk.yellow(`  → Package not found. Check the package name and version.`));
              } else if (error.category === ErrorCategory.DISK_SPACE) {
                console.log(chalk.yellow(`  → Disk space issue. Free up some space and try again.`));
              }
            } else {
              // Generic error
              console.log(chalk.red(`✗ Error installing ${chalk.bold(task.name)}@${chalk.bold(task.version)}: ${error}`));
            }

            return false;
          }
        })
      );

      // Check if any package in this batch failed
      if (batchResults.some(result => !result)) {
        logger.warn(`Some packages in batch ${currentBatch}/${totalBatches} failed to install`);
      }
    }

    // Complete progress
    progress.stop();

    // Log results
    if (failed === 0) {
      progress.complete(`All ${installed} packages installed successfully`);
      return true;
    } else {
      console.log(chalk.yellow(`⚠ ${failed} of ${totalPackages} packages failed to install`));
      return false;
    }
  }

  /**
   * Install workspace packages
   * @param projectDir The project directory
   * @returns True if successful
   */
  private async installWorkspaces(projectDir: string): Promise<boolean> {
    // Get workspace packages
    const workspacePackages = workspaceManager.getPackages();

    if (workspacePackages.length === 0) {
      logger.debug('No workspace packages found');
      return true;
    }

    console.log(chalk.cyan(`\n→ Installing workspace packages...`));

    // Filter out any invalid workspace packages
    const validWorkspacePackages = workspacePackages.filter(pkg => {
      if (!pkg || !pkg.name || pkg.name === 'undefined') {
        logger.warn(`Skipping invalid workspace package: ${pkg?.name || 'unknown'}`);
        return false;
      }
      return true;
    });

    if (validWorkspacePackages.length === 0) {
      logger.warn('No valid workspace packages found');
      return true;
    }

    // Get installation order
    const installOrder = workspaceManager.getInstallationOrder();
    console.log(chalk.gray(`→ Determined installation order for ${installOrder.length} packages`));

    // Create progress bar
    const progress = new ReliableProgress('Installing workspace packages');
    progress.start();

    // Install each workspace package
    let installed = 0;

    // Check if we should install in parallel
    if (this.options.workspace?.parallelInstall) {
      // Parallel installation
      const maxConcurrency = this.options.workspace?.maxConcurrency || 4;
      console.log(chalk.gray(`→ Using parallel installation with ${maxConcurrency} workers`));

      // Create batches based on dependencies
      const batches: string[][] = [];
      const processed = new Set<string>();

      // Create batches based on dependency graph
      while (processed.size < installOrder.length) {
        const batch: string[] = [];

        for (const pkgName of installOrder) {
          if (processed.has(pkgName)) continue;

          // Get package dependencies
          const pkg = workspaceManager.getPackage(pkgName);
          if (!pkg) continue;

          // Check if all workspace dependencies are processed
          const deps = Object.keys(pkg.dependencies)
            .filter(dep => workspaceManager.getPackage(dep) !== undefined);

          const allDepsProcessed = deps.every(dep => processed.has(dep));

          if (allDepsProcessed) {
            batch.push(pkgName);
          }
        }

        if (batch.length === 0) {
          // This should not happen if the dependency graph is valid
          logger.warn('Could not determine next batch of packages to install');
          break;
        }

        batches.push(batch);
        batch.forEach(pkg => processed.add(pkg));
      }

      // Install batches in order
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(chalk.gray(`→ Installing batch ${i + 1}/${batches.length} (${batch.length} packages)`));

        // Install packages in this batch in parallel
        await Promise.all(batch.map(async (pkgName) => {
          const pkg = workspaceManager.getPackage(pkgName);
          if (!pkg) return;

          // Install package
          const success = await this.installWorkspacePackage(pkg, projectDir);

          if (success) {
            installed++;
            progress.updateStatus(`Installing workspace packages (${installed}/${installOrder.length})`);
          } else {
            logger.error(`Failed to install workspace package: ${pkgName}`);
          }
        }));
      }
    } else {
      // Sequential installation
      console.log(chalk.gray(`→ Using sequential installation`));

      for (const pkgName of installOrder) {
        const pkg = workspaceManager.getPackage(pkgName);
        if (!pkg) continue;

        progress.updateStatus(`Installing ${pkg.name}`);

        // Install package
        const success = await this.installWorkspacePackage(pkg, projectDir);

        if (success) {
          installed++;
          progress.updateStatus(`Installing workspace packages (${installed}/${installOrder.length})`);
        } else {
          progress.stop();
          logger.error(`Failed to install workspace package: ${pkgName}`);
          return false;
        }
      }
    }

    progress.stop();
    console.log(chalk.green(`✓ Installed ${installed} workspace packages`));

    return installed === installOrder.length;
  }

  /**
   * Install dependencies from fallbacks
   * @param projectDir Project directory
   * @param fallbacks Fallback results
   * @returns True if successful
   */
  private async installFromFallbacks(
    projectDir: string,
    fallbacks: Record<string, FallbackResult>
  ): Promise<boolean> {
    try {
      // Create node_modules directory
      const nodeModulesPath = path.join(projectDir, 'node_modules');
      await fsUtils.ensureDir(nodeModulesPath);

      // Create progress indicator
      const progress = new ReliableProgress('Installing from fallbacks');
      progress.start();

      // Count total packages
      const totalPackages = Object.keys(fallbacks).length;
      let installedCount = 0;

      // Process each fallback
      for (const [name, fallback] of Object.entries(fallbacks)) {
        // Skip packages without fallbacks
        if (!fallback.found || !fallback.path) {
          continue;
        }

        progress.updateStatus(`Installing ${name}@${fallback.version} (${installedCount + 1}/${totalPackages})`);

        // Install from different sources
        if (fallback.source === 'cache') {
          // Install from cache
          const success = await cache.restorePackage(
            name,
            fallback.version,
            path.join(nodeModulesPath, name)
          );

          if (!success) {
            logger.error(`Failed to restore ${name}@${fallback.version} from cache`);
            continue;
          }
        } else if (fallback.source === 'snapshot') {
          // Install from snapshot
          // This is a bit tricky since we need to extract just one package from the snapshot
          // For now, we'll restore the entire snapshot to a temporary directory and copy the package

          const tempDir = path.join(os.tmpdir(), `flash-install-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
          await fsUtils.ensureDir(tempDir);

          try {
            // Restore snapshot to temp directory
            await snapshot.restore(tempDir, fallback.path);

            // Copy package from temp directory
            const packagePath = path.join(tempDir, 'node_modules', name);
            const destPath = path.join(nodeModulesPath, name);

            if (await fsUtils.directoryExists(packagePath)) {
              await fsUtils.copy(packagePath, destPath);
            } else {
              logger.error(`Package ${name} not found in snapshot`);
              continue;
            }
          } finally {
            // Clean up temp directory
            await fsUtils.remove(tempDir);
          }
        } else if (fallback.source === 'local') {
          // Install from local node_modules
          const sourcePath = fallback.path;
          const destPath = path.join(nodeModulesPath, name);

          await fsUtils.copy(sourcePath, destPath);
        }

        installedCount++;
      }

      progress.stop();

      // Return true if all packages were installed
      return installedCount === Object.values(fallbacks).filter(f => f.found).length;
    } catch (error) {
      logger.error(`Failed to install from fallbacks: ${error}`);
      return false;
    }
  }

  /**
   * Install a single workspace package
   * @param pkg Workspace package
   * @param rootDir Root directory
   * @returns True if successful
   */
  private async installWorkspacePackage(pkg: WorkspacePackage, rootDir: string): Promise<boolean> {
    try {
      // Create node_modules directory
      const nodeModulesPath = path.join(pkg.directory, 'node_modules');
      await fsUtils.ensureDir(nodeModulesPath);

      // Create symlinks for workspace dependencies
      for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
        const depPkg = workspaceManager.getPackage(depName);

        if (depPkg) {
          // Create symlink to workspace package
          const targetPath = path.join(nodeModulesPath, depName);
          const sourcePath = depPkg.directory;

          // Ensure parent directory exists
          await fsUtils.ensureDir(path.dirname(targetPath));

          // Create symlink
          try {
            // Remove existing directory or symlink
            if (await fsUtils.exists(targetPath)) {
              await fsUtils.remove(targetPath);
            }

            // Create symlink
            await fs.symlink(sourcePath, targetPath, 'junction');
          } catch (error) {
            logger.debug(`Failed to create symlink from ${sourcePath} to ${targetPath}: ${error}`);
          }
        }
      }

      // Install non-workspace dependencies
      const dependencies: Record<string, string> = {};

      // Add regular dependencies
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        // Skip workspace packages
        if (workspaceManager.getPackage(name)) {
          continue;
        }

        dependencies[name] = version;
      }

      // Add dev dependencies if needed
      if (this.options.includeDevDependencies) {
        for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
          // Skip workspace packages
          if (workspaceManager.getPackage(name)) {
            continue;
          }

          dependencies[name] = version;
        }
      }

      // If hoisting is enabled, skip installing dependencies that are already in the root
      if (this.options.workspace?.hoistDependencies) {
        const rootNodeModulesPath = path.join(rootDir, 'node_modules');

        for (const name of Object.keys(dependencies)) {
          const depPath = path.join(rootNodeModulesPath, name);

          if (await fsUtils.directoryExists(depPath)) {
            // Create symlink to hoisted dependency
            const targetPath = path.join(nodeModulesPath, name);

            // Ensure parent directory exists
            await fsUtils.ensureDir(path.dirname(targetPath));

            // Create symlink
            try {
              // Remove existing directory or symlink
              if (await fsUtils.exists(targetPath)) {
                await fsUtils.remove(targetPath);
              }

              // Create symlink
              await fs.symlink(depPath, targetPath, 'junction');

              // Remove from dependencies to install
              delete dependencies[name];
            } catch (error) {
              logger.debug(`Failed to create symlink from ${depPath} to ${targetPath}: ${error}`);
            }
          }
        }
      }

      // If there are no dependencies left to install, we're done
      if (Object.keys(dependencies).length === 0) {
        return true;
      }

      // Install remaining dependencies
      if (Object.keys(dependencies).length > 0) {
        logger.info(`Installing ${Object.keys(dependencies).length} dependencies for ${pkg.name}...`);

        // Filter out any invalid dependencies (like undefined versions)
        const validDependencies = Object.entries(dependencies)
          .filter(([name, version]) => {
            if (version === undefined || version === 'undefined') {
              logger.warn(`Skipping invalid dependency ${name}@${version} in ${pkg.name}`);
              return false;
            }
            return true;
          });

        if (validDependencies.length === 0) {
          logger.info(`No valid dependencies to install for ${pkg.name}`);
          return true;
        }

        const depArray = validDependencies.map(([name, version]) => `${name}@${version}`);

        // Use npm directly for more reliable installation
        try {
          const cmd = {
            [PackageManager.NPM]: 'npm',
            [PackageManager.YARN]: 'yarn',
            [PackageManager.PNPM]: 'pnpm',
            [PackageManager.BUN]: 'bun'
          }[this.options.packageManager];

          const args = [
            'install',
            ...depArray,
            '--no-save'
          ];

          // Add registry option with the appropriate flag for each package manager
          if (this.options.registry) {
            switch (this.options.packageManager) {
              case PackageManager.NPM:
                args.push('--registry', this.options.registry);
                break;
              case PackageManager.YARN:
                args.push('--registry', this.options.registry);
                break;
              case PackageManager.PNPM:
                args.push('--registry', this.options.registry);
                break;
              case PackageManager.BUN:
                args.push('--registry', this.options.registry);
                break;
              default:
                args.push('--registry', this.options.registry);
            }
          }

          logger.debug(`Running: ${cmd} ${args.join(' ')} in ${pkg.directory}`);

          execSync(`${cmd} ${args.join(' ')}`, {
            cwd: pkg.directory,
            stdio: 'ignore'
          });

          return true;
        } catch (error) {
          logger.error(`Failed to install dependencies for ${pkg.name}: ${error}`);
          return false;
        }
      } else {
        logger.info(`No dependencies to install for ${pkg.name}`);
        return true;
      }
    } catch (error) {
      logger.error(`Failed to install workspace package ${pkg.name}: ${error}`);
      return false;
    }
  }

  /**
   * Run a package script
   * @param projectDir The project directory
   * @param script The script name
   * @returns True if successful
   */
  async runScript(projectDir: string, script: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const cmd = {
        [PackageManager.NPM]: 'npm',
        [PackageManager.YARN]: 'yarn',
        [PackageManager.PNPM]: 'pnpm',
        [PackageManager.BUN]: 'bun'
      }[this.options.packageManager];

      const args = {
        [PackageManager.NPM]: ['run', script],
        [PackageManager.YARN]: ['run', script],
        [PackageManager.PNPM]: ['run', script],
        [PackageManager.BUN]: ['run', script]
      }[this.options.packageManager];

      const child = spawn(cmd, args, {
        cwd: projectDir,
        stdio: 'inherit',
        shell: true
      });

      child.on('close', (code) => {
        if (code === 0) {
          logger.success(`Script '${script}' completed successfully`);
          resolve(true);
        } else {
          logger.error(`Script '${script}' failed with code ${code}`);
          resolve(false);
        }
      });
    });
  }

  /**
   * Clean node_modules and local cache
   * @param projectDir The project directory
   * @returns True if successful
   */
  async clean(projectDir: string): Promise<boolean> {
    try {
      const nodeModulesPath = path.join(projectDir, 'node_modules');
      const flashpackPath = path.join(projectDir, '.flashpack');

      // Remove node_modules
      if (await fsUtils.directoryExists(nodeModulesPath)) {
        logger.info('Removing node_modules directory...');
        await fsUtils.remove(nodeModulesPath);
      }

      // Remove .flashpack
      if (await fsUtils.fileExists(flashpackPath)) {
        logger.info('Removing .flashpack snapshot...');
        await fsUtils.remove(flashpackPath);
      }

      logger.success('Clean completed successfully');
      return true;
    } catch (error) {
      logger.error(`Clean failed: ${error}`);
      return false;
    }
  }

  /**
   * Install specific packages
   * @param projectDir Project directory
   * @param packages Array of package names with optional versions
   * @param options Installation options
   * @returns True if successful
   */
  async installPackages(
    projectDir: string,
    packages: string[],
    options: PackageInstallOptions
  ): Promise<boolean> {
    try {
      // Start timer
      const totalTimer = createTimer();
      if (!this.options.fastMode) {
      // Initialize plugin manager with the correct project directory
      await pluginManager.init(projectDir);
      }
      // Create plugin context
      const nodeModulesPath = path.join(projectDir, 'node_modules');
      const pluginContext = {
        projectDir,
        nodeModulesPath,
        dependencies: {},
        packageManager: this.options.packageManager,
        packages: packages
      };
      if (!this.options.fastMode) {
      // Run pre-install hooks
      console.log('\n🔌 Running PRE_INSTALL hooks...');
      await pluginManager.runHook(PluginHook.PRE_INSTALL, pluginContext);
      console.log('🔌 Finished running PRE_INSTALL hooks');
      }
      // Install packages
      const success = await installPackages(projectDir, packages, this.options.packageManager, {
        ...options,
        registry: this.options.registry
      });

      if (success && !this.options.fastMode) {
        // Run post-install hooks
        console.log('\n🔌 Running POST_INSTALL hooks...');
        await pluginManager.runHook(PluginHook.POST_INSTALL, pluginContext);
        console.log('🔌 Finished running POST_INSTALL hooks');
        // Log total time
        logger.success(`Total time: ${totalTimer.getElapsedFormatted()}`);
      }
      return success;
    } catch (error) {
      logger.error(`Failed to install packages: ${error}`);
      return false;
    }
  }

  /**
   * Download a package tarball
   * @param packageName Package name with optional version
   * @param outputDir Output directory
   * @returns Path to downloaded tarball
   */
  async downloadPackage(packageName: string, outputDir: string): Promise<string> {
    return downloadPackage(packageName, outputDir, {
      registry: this.options.registry
    });
  }
}

// Export a default installer instance
export const installer = new Installer();
