# Flash Install - API Documentation

## Table of Contents
1. [Introduction](#introduction)
2. [Command Line Interface](#command-line-interface)
   - [flash](#flash)
   - [flash setup](#flash-setup)
   - [flash clean](#flash-clean)
   - [flash benchmark](#flash-benchmark)
   - [flash status](#flash-status)
   - [flash help](#flash-help)
3. [Core Modules](#core-modules)
   - [PackageDownloader](#packagedownloader)
   - [PerformanceTracker](#performancetracker)
   - [ErrorHandler](#errorhandler)
   - [NetworkManager](#networkmanager)
4. [Utility Modules](#utility-modules)
   - [ParallelDownloadManager](#paralleldownloadmanager)
   - [WorkerPool](#workerpool)
   - [Timer](#timer)
5. [Configuration](#configuration)
6. [Error Handling](#error-handling)

## Introduction

Flash Install provides a comprehensive API for developers looking to integrate fast package installation directly into their tools or applications. The API is organized into command-line interface and core modules that handle installation, performance tracking, and error management.

## Command Line Interface

Flash Install provides a rich command-line interface with multiple commands and configuration options.

### flash
Primary command for installing packages (drop-in replacement for npm install).

**Usage:**
```bash
flash [options]
```

**Options:**
- `--offline`: Install from cache only
- `--no-dev`: Skip devDependencies
- `--concurrency <number>`: Number of parallel downloads (default: 8)
- `--timeout <ms>`: Request timeout in milliseconds (default: 30000)
- `--verbose`: Enable verbose logging
- `--quiet`: Suppress output
- `--cloud-cache`: Enable cloud caching
- `--cloud-provider <provider>`: Cloud provider (aws, gcp, azure) (default: aws)
- `--cloud-bucket <name>`: Cloud bucket name
- `--workspace <dir>`: Install in workspace
- `--workspace-filter <pattern>`: Filter for workspaces

### flash setup
Run the interactive setup wizard to configure Flash Install.

**Usage:**
```bash
flash setup
```

**Options:**
- `--skip-verification`: Skip verification steps during setup
- `--reset`: Reset configuration to default values

### flash clean
Clean the package cache.

**Usage:**
```bash
flash clean [options]
```

**Options:**
- `--dry-run`: Show what would be cleaned without doing it

### flash benchmark
Run a performance benchmark against npm.

**Usage:**
```bash
flash benchmark
```

### flash status
Show the status of Flash Install.

**Usage:**
```bash
flash status
```

### flash help
Show help information and user guidance.

**Usage:**
```bash
flash help [topic]
```

**Topics:**
- `issues`: Common issues and solutions
- `performance`: Performance tips
- `troubleshooting`: Troubleshooting guide
- `quickstart`: Quick start guide

## Core Modules

### PackageDownloader

The `PackageDownloader` class handles downloading packages from registries with parallel capabilities.

#### Constructor
```typescript
new PackageDownloader(options: DownloadOptions = {})
```

**Parameters:**
- `options`: Optional configuration for download behavior

**DownloadOptions Interface:**
```typescript
interface DownloadOptions {
  concurrency?: number;        // Number of concurrent downloads (default: 8)
  timeout?: number;           // Request timeout in ms (default: 30000)
  retries?: number;           // Number of retry attempts (default: 3)
  retryDelay?: number;        // Delay between retries in ms (default: 1000)
  registry?: string;          // Registry URL (default: https://registry.npmjs.org)
  userAgent?: string;         // User agent string (default: Flash-Install/2.0)
  headers?: Record<string, string>; // Additional HTTP headers
  onProgress?: (downloaded: number, total: number, url: string) => void; // Progress callback
  connectionPoolSize?: number; // Connection pool size (default: 20)
}
```

#### Methods

**downloadPackage**
Downloads a single package tarball.

```typescript
async downloadPackage(
  name: string, 
  version: string, 
  outputDir: string, 
  registry?: string
): Promise<DownloadResult>
```

**downloadPackages**
Downloads multiple packages in parallel.

```typescript
async downloadPackages(
  packages: Array<{ name: string; version: string; registry?: string }>,
  outputDir: string
): Promise<DownloadResult[]>
```

**destroy**
Cleans up resources used by the downloader.

```typescript
destroy(): void
```

### PerformanceTracker

The `PerformanceTracker` class provides comprehensive performance measurement and analytics.

#### Constructor
```typescript
new PerformanceTracker(config: Partial<PerformanceTrackerConfig> = {})
```

**PerformanceTrackerConfig Interface:**
```typescript
interface PerformanceTrackerConfig {
  enabled: boolean;           // Whether tracking is enabled (default: true)
  outputDir?: string;         // Output directory for metrics files
  logToConsole: boolean;      // Whether to log to console (default: false)
  maxMetrics: number;         // Max metrics to keep in memory (default: 100)
  trackDetailed: boolean;     // Whether to track detailed metrics (default: true)
}
```

#### Methods

**trackInstallation**
Records an installation event.

```typescript
trackInstallation(
  packageManager: PackageManager,
  packageCount: number,
  totalTimeMs: number,
  cacheHitRate: number,
  success: boolean,
  error?: string
): void
```

**startOperation**
Begins tracking a specific operation.

```typescript
startOperation(operationName: string): void
```

**endOperation**
Ends tracking a specific operation.

```typescript
endOperation(
  operationName: string, 
  operationType: 'network' | 'cache' | 'fs' | 'cpu' = 'cpu'
): number
```

**getStats**
Retrieves current performance statistics.

```typescript
getStats(): typeof this.installationStats
```

**getMetrics**
Retrieves collected performance metrics.

```typescript
getMetrics(): PerformanceMetrics[]
```

**getAverageInstallationTime**
Calculates the average installation time.

```typescript
getAverageInstallationTime(): number
```

**getSuccessRate**
Calculates the success rate percentage.

```typescript
getSuccessRate(): number
```

**exportReport**
Exports a performance report.

```typescript
exportReport(format: 'json' | 'csv' = 'json'): string
```

**reset**
Clears all collected metrics.

```typescript
reset(): void
```

### ErrorHandler

The `ErrorHandler` class provides comprehensive error handling and categorization.

#### Static Methods

**handleError**
Handles an error and returns a FlashError.

```typescript
static handleError(
  error: Error | unknown,
  context?: Record<string, any>,
  options?: {
    maxRetries?: number;
    retryCount?: number;
    category?: ErrorCategory;
    recoveryStrategy?: RecoveryStrategy;
    recoverable?: boolean;
  }
): FlashError
```

**withErrorHandling**
Wraps a function with error handling.

```typescript
static async withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: Record<string, any>,
  options?: {
    maxRetries?: number;
    onError?: (error: FlashError) => void | Promise<void>;
    onRetry?: (error: FlashError, attempt: number) => void | Promise<void>;
    retryDelay?: number;
  }
): Promise<T>
```

### NetworkManager

The `NetworkManager` class handles network operations and connectivity checks.

#### Constructor
```typescript
new NetworkManager(options: NetworkCheckOptions = {})
```

**NetworkCheckOptions Interface:**
```typescript
interface NetworkCheckOptions {
  registry?: string;          // Registry URL to check (default: https://registry.npmjs.org)
  timeout?: number;           // Timeout in ms (default: 5000)
  retries?: number;           // Number of retries (default: 2)
  useDnsCheck?: boolean;      // Whether to use DNS check (default: true)
  useRegistryCheck?: boolean; // Whether to use registry check (default: true)
  useInternetCheck?: boolean; // Whether to use internet check (default: true)
}
```

#### Methods

**checkNetwork**
Checks network availability.

```typescript
async checkNetwork(options: NetworkCheckOptions = {}): Promise<NetworkCheckResult>
```

**isNetworkAvailable**
Checks if the network is available.

```typescript
async isNetworkAvailable(options: NetworkCheckOptions = {}): Promise<boolean>
```

**isRegistryAvailable**
Checks if the registry is available.

```typescript
async isRegistryAvailable(
  registry?: string, 
  timeout?: number, 
  retries?: number
): Promise<boolean>
```

## Utility Modules

### ParallelDownloadManager

Manages parallel downloads with rate limiting and connection pooling.

#### Constructor
```typescript
new ParallelDownloadManager(options: DownloadOptions = {})
```

#### Methods

**download**
Downloads a single file with retry logic.

```typescript
async download(
  url: string, 
  outputDir: string, 
  filename?: string
): Promise<DownloadResult>
```

**downloadMultiple**
Downloads multiple files in parallel.

```typescript
async downloadMultiple(
  downloads: Array<{ url: string; outputDir: string; filename?: string }>
): Promise<DownloadResult[]>
```

**getActiveDownloadCount**
Gets the number of active downloads.

```typescript
getActiveDownloadCount(): number
```

**getQueuedDownloadCount**
Gets the number of queued downloads.

```typescript
getQueuedDownloadCount(): number
```

**cancelAll**
Cancels all pending downloads.

```typescript
cancelAll(): void
```

**destroy**
Destroys the download manager and cleans up resources.

```typescript
destroy(): void
```

### WorkerPool

Manages a pool of worker threads for parallel processing.

#### Constructor
```typescript
new WorkerPool<T, R>(
  workerFn: (data: T) => Promise<R> | R,
  numWorkers = Math.max(1, os.cpus().length - 1),
  options?: {
    memoryLimitPercentage?: number;
    memoryThresholdPercentage?: number;
    initialBatchSize?: number;
    maxBatchSize?: number;
    minBatchSize?: number;
    taskTimeoutMs?: number;
  }
)
```

#### Methods

**execute**
Executes a task using the worker pool.

```typescript
async execute(task: T): Promise<R>
```

**executeAll**
Executes multiple tasks in parallel with adaptive batch sizing.

```typescript
async executeAll(dataItems: T[]): Promise<R[]>
```

**terminate**
Terminates the worker pool and all active tasks.

```typescript
async terminate(): Promise<void>
```

### Timer

Provides timing functionality for measuring elapsed time.

#### Constructor
```typescript
new Timer()
```

#### Methods

**start**
Starts the timer.

```typescript
start(): void
```

**stop**
Stops the timer.

```typescript
stop(): void
```

**getElapsedMs**
Gets the elapsed time in milliseconds.

```typescript
getElapsedMs(): number
```

**getElapsedSeconds**
Gets the elapsed time in seconds.

```typescript
getElapsedSeconds(): number
```

## Configuration

Configuration can be provided at initialization or through environment variables:

### Environment Variables

```bash
FLASH_CONCURRENCY=8
FLASH_TIMEOUT=30000
FLASH_CACHE_DIR=/path/to/cache
FLASH_REGISTRY=https://registry.npmjs.org
FLASH_CLOUD_CACHE=false
FLASH_CLOUD_PROVIDER=aws
FLASH_CLOUD_BUCKET=my-bucket
```

## Cloud Integration

Flash Install supports cloud integration enabling cloud caching through multiple providers:

### Cloud Providers
- **AWS S3**: Use `--cloud-provider aws` with appropriate bucket
- **Google Cloud Storage**: Use `--cloud-provider gcp` with bucket name
- **Azure Blob Storage**: Use `--cloud-provider azure` with container name

## Installation Reference

To install Flash Install globally for use in all projects:

### via npm:
```bash
npm install -g @flash-install/cli
```

### via yarn:
```bash
yarn global add @flash-install/cli
```

## Speed Improvements

Flash Install achieves significant performance improvements:
- **Small Projects**: Up to 97% faster than npm install
- **Medium Projects**: Up to 98% faster than npm install  
- **Large Projects**: Up to 99% faster than npm install
- **Overall**: Up to 65x faster than npm install

This is accomplished through:
- Intelligent caching system
- Parallel downloads (up to 8 concurrent by default)
- Connection pooling
- Optimized dependency resolution

## Performance Optimization

Optimize Flash Install performance with these techniques:
- Adjust concurrency based on your system (try 8-16 for most systems)
- Increase timeout for slower networks (default 30000ms)
- Enable cloud caching for team environments
- Use the setup wizard to optimize settings for your system
- Regularly clean the cache with `flash clean` if needed

## Error Handling

Flash Install uses a comprehensive error categorization system:

### Error Categories

The `ErrorCategory` enum includes:

- `FILE_NOT_FOUND`, `PERMISSION_DENIED`, `DISK_SPACE`, `FILE_SYSTEM`
- `NETWORK_TIMEOUT`, `NETWORK_CONNECTION`, `NETWORK_DNS`, `NETWORK`
- `CLOUD_AUTHENTICATION`, `CLOUD_PERMISSION`, `CLOUD_RESOURCE`, `CLOUD_QUOTA`, `CLOUD`
- `PACKAGE_NOT_FOUND`, `PACKAGE_INVALID`, `PACKAGE_VERSION`, `PACKAGE`
- `CONFIG_INVALID`, `CONFIG_MISSING`, `CONFIG`
- `DEPENDENCY_CONFLICT`, `DEPENDENCY_MISSING`, `DEPENDENCY`
- `PROCESS_TIMEOUT`, `PROCESS_CRASH`, `PROCESS`
- `MEMORY_LIMIT`, `MEMORY_LEAK`, `MEMORY`

### Recovery Strategies

The `RecoveryStrategy` enum includes:

- `FAIL`: No recovery possible, fail immediately
- `RETRY`: Retry the operation
- `ALTERNATIVE`: Use an alternative approach
- `CONTINUE_DEGRADED`: Continue with degraded functionality
- `IGNORE`: Ignore the error and continue

Errors are automatically handled with appropriate strategies based on their category, with actionable suggestions provided to the user.