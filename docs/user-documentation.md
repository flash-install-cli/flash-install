# Flash Install - Complete User Documentation

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Quick Start Guide](#quick-start-guide)
4. [Configuration](#configuration)
5. [Commands](#commands)
6. [Features](#features)
7. [Error Handling](#error-handling)
8. [Performance Tracking](#performance-tracking)
9. [Cloud Integration](#cloud-integration)
10. [Troubleshooting](#troubleshooting)
11. [Performance Optimization](#performance-optimization)
12. [API Reference](#api-reference)
13. [FAQ](#faq)

## Introduction

Flash Install is a fast, drop-in replacement for npm install with deterministic caching. It significantly speeds up package installation times by intelligently caching packages and using parallel downloads.

### Key Benefits
- **Speed**: Up to 65x faster than traditional npm install
- **Caching**: Advanced caching system for faster repeated installations
- **Reliability**: More stable and reliable dependency management
- **Compatibility**: Drop-in replacement for existing npm workflows

## Installation

### Prerequisites
- Node.js version 16.0.0 or higher
- npm or yarn package manager

### Install via npm
```bash
npm install -g @flash-install/cli
```

### Install via yarn
```bash
yarn global add @flash-install/cli
```

## Quick Start Guide

### Basic Usage
Flash Install works as a drop-in replacement for npm install:

```bash
# Install all dependencies (equivalent to npm install)
flash

# Install a specific package (equivalent to npm install package-name)
flash lodash

# Install as dev dependency (equivalent to npm install package-name --save-dev)
flash lodash --save-dev
```

### Running the Setup Wizard
For optimal performance, run the interactive setup wizard:

```bash
flash setup
```

This will guide you through configuration options including cache directory, concurrency settings, and cloud caching.

## Configuration

Flash Install can be configured via command line flags or a configuration file.

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--offline` | Install from cache only | false |
| `--no-dev` | Skip devDependencies | false |
| `--concurrency <number>` | Number of parallel downloads | 8 |
| `--timeout <ms>` | Request timeout in milliseconds | 30000 |
| `--verbose` | Enable verbose logging | false |
| `--quiet` | Suppress output | false |
| `--cloud-cache` | Enable cloud caching | false |
| `--cloud-provider <provider>` | Cloud provider (aws, gcp, azure) | aws |
| `--cloud-bucket <name>` | Cloud bucket name | - |
| `--workspace <dir>` | Install in workspace | - |
| `--workspace-filter <pattern>` | Filter for workspaces | - |

### Configuration File

Flash Install can also be configured using a `.flashrc` file in your project directory or a global config file at `~/.flash-install/config.json`:

```json
{
  "cacheDir": "/path/to/cache",
  "concurrency": 8,
  "timeout": 30000,
  "cloudCache": false,
  "cloudProvider": "aws",
  "cloudBucket": "your-bucket-name",
  "verbose": false
}
```

## Commands

### flash
Install packages with Flash Install (drop-in replacement for npm install)

**Usage:**
```bash
flash [options]
```

**Examples:**
```bash
flash # Install all dependencies
flash lodash # Install a specific package
flash lodash --save-dev # Install as dev dependency
flash --offline # Install from cache only
flash --no-dev # Install production dependencies only
```

### flash setup
Run the interactive setup wizard to configure Flash Install

**Usage:**
```bash
flash setup
```

**Examples:**
```bash
flash setup # Run the guided setup process
```

### flash clean
Clean the package cache

**Usage:**
```bash
flash clean [options]
```

**Examples:**
```bash
flash clean # Clean the entire cache
flash clean --dry-run # Show what would be cleaned without doing it
```

### flash benchmark
Run a performance benchmark against npm

**Usage:**
```bash
flash benchmark
```

**Examples:**
```bash
flash benchmark # Compare Flash Install vs npm install performance
```

### flash status
Show the status of Flash Install

**Usage:**
```bash
flash status
```

**Examples:**
```bash
flash status # Show cache status, network connectivity, etc.
```

### flash help
Show help information and user guidance

**Usage:**
```bash
flash help [topic]
```

**Examples:**
```bash
flash help # Show general help
flash help issues # Show common issues and solutions
flash help performance # Show performance tips
flash help troubleshooting # Show troubleshooting guide
```

## Features

### Advanced Caching System
Flash Install implements a multi-layer caching system:
- Package-level caching
- Dependency-tree-level caching
- Integrity verification with SHA256
- Optional compression (gzip/brotli)

### Parallel Downloads
- Configurable number of concurrent downloads (default: 8)
- Connection pooling for efficient resource usage
- Rate limiting to respect registry limits
- Intelligent retry mechanism with exponential backoff

## Error Handling

Flash Install implements a comprehensive error handling system with detailed categorization and actionable suggestions:

### Error Categories (ErrorCategory)
- **File System**: `FILE_NOT_FOUND`, `PERMISSION_DENIED`, `DISK_SPACE`, `FILE_SYSTEM`
- **Network**: `NETWORK_TIMEOUT`, `NETWORK_CONNECTION`, `NETWORK_DNS`, `NETWORK`
- **Cloud**: `CLOUD_AUTHENTICATION`, `CLOUD_PERMISSION`, `CLOUD_RESOURCE`, `CLOUD_QUOTA`, `CLOUD`
- **Package**: `PACKAGE_NOT_FOUND`, `PACKAGE_INVALID`, `PACKAGE_VERSION`, `PACKAGE`
- **Configuration**: `CONFIG_INVALID`, `CONFIG_MISSING`, `CONFIG`
- **Dependency**: `DEPENDENCY_CONFLICT`, `DEPENDENCY_MISSING`, `DEPENDENCY`
- **Process**: `PROCESS_TIMEOUT`, `PROCESS_CRASH`, `PROCESS`
- **Memory**: `MEMORY_LIMIT`, `MEMORY_LEAK`, `MEMORY`
- **Unknown**: `UNKNOWN`

### Recovery Strategies (RecoveryStrategy)
- `FAIL`: No recovery possible, fail immediately
- `RETRY`: Retry the operation
- `ALTERNATIVE`: Use an alternative approach
- `CONTINUE_DEGRADED`: Continue with degraded functionality
- `IGNORE`: Ignore the error and continue

### FlashError Class
The `FlashError` class provides enhanced error information:
- Detailed error categorization
- Recovery strategy suggestions
- Actionable guidance for users
- Contextual information for debugging

When errors occur, Flash Install automatically provides actionable suggestions such as:
- Checking file/directory permissions
- Verifying network connectivity
- Increasing timeout values
- Running the setup wizard to review configuration

## Performance Tracking

Flash Install includes a comprehensive `PerformanceTracker` for monitoring and analyzing installation performance:

### Key Metrics Tracked
- Installation time
- Package count
- Cache hit rate
- Network operations count and time
- Cache operations count and time
- CPU usage
- Memory usage (current and peak)
- Success/failure rates

### PerformanceTracker Class Methods
- `trackInstallation()`: Records an installation event with all metrics
- `startOperation()`: Begin tracking a specific operation
- `endOperation()`: End tracking and get duration
- `getStats()`: Retrieve current performance statistics
- `getMetrics()`: Retrieve collected performance metrics
- `getAverageInstallationTime()`: Calculate average installation time
- `getSuccessRate()`: Calculate success rate percentage
- `exportReport()`: Export performance report in JSON or CSV format
- `reset()`: Clear all collected metrics

### Performance Commands
- `flash benchmark`: Compare Flash Install vs npm install performance
- `flash status`: Show cache status, network connectivity, and performance metrics

## Cloud Integration

Flash Install supports cloud integration through cloud-based caching for team environments:

### Supported Providers
- **AWS S3**: Amazon S3 buckets for cache synchronization
- **Google Cloud Storage**: GCP Cloud Storage for shared caching
- **Azure Blob Storage**: Microsoft Azure Blob Storage support

### Configuration
Cloud caching can be configured via:
- Command line: `--cloud-cache --cloud-provider <provider> --cloud-bucket <name>`
- Configuration file: Set `cloudCache`, `cloudProvider`, and `cloudBucket` options

### Benefits
- Shared cache across team members
- Consistent installation times
- Reduced bandwidth usage
- Faster CI/CD pipelines

## Core Components

Flash Install is built with several core components that work together to provide high performance:

### NetworkManager
The `NetworkManager` handles all network operations and connectivity checks. It includes features like:
- DNS resolution checking
- Registry availability verification  
- Internet connectivity validation
- Network status monitoring

### ParallelDownloadManager
The `ParallelDownloadManager` implements efficient parallel downloads with:
- Configurable concurrency levels
- Connection pooling
- Retry logic with exponential backoff
- Progress tracking
- Queue-based processing

### WorkerPool
The `WorkerPool` manages parallel processing tasks with:
- Adaptive batch sizing based on memory usage
- Automatic garbage collection
- Task timeout protection
- Memory monitoring and throttling

### Timer
The `Timer` utility provides precise performance measurement with:
- High-resolution timing (nanosecond precision)
- Start/stop/reset functionality
- Elapsed time formatting

## Troubleshooting

### Common Issues and Solutions

#### Permission denied errors
**Cause:** Insufficient permissions to write to node_modules or cache directory  
**Solution:** Run with appropriate permissions (e.g., use sudo on Unix systems), or change the cache directory location in configuration.

#### Slow installation speeds
**Cause:** Suboptimal configuration or network conditions  
**Solution:** Use the setup wizard to optimize settings like concurrency and timeout, or try installing during off-peak network hours.

#### Network timeout errors
**Cause:** Request taking longer than configured timeout  
**Solution:** Increase the timeout value in your configuration, or reduce concurrency to decrease network load.

#### Cache not being used effectively
**Cause:** Cache directory issues or corrupted cache entries  
**Solution:** Clean the cache with `flash clean` and reinstall, or verify cache directory permissions and space.

#### Module not found after installation
**Cause:** Dependency not properly linked or cached  
**Solution:** Try running `flash` again, or clear the cache and reinstall. Verify the package name is correct.

### Troubleshooting Steps

1. **Verify Installation**: Run `flash --version` to confirm Flash Install is properly installed
2. **Check Network**: Ensure your internet connection is working and firewall/proxy settings are correct
3. **Verify Cache**: Use `flash status` to check cache status and run `flash clean` if needed
4. **Validate Configuration**: Run the setup wizard with `flash setup` to review and optimize settings
5. **Test with Simple Package**: Try installing a simple package like `lodash` to isolate the issue
6. **Check Logs**: Enable verbose logging with `--verbose` flag to gather more information

## Performance Optimization

### Performance Tips

1. **Optimize Concurrency**: Adjust the number of concurrent downloads based on your system and network. Start with 8 and adjust as needed.
2. **Use Cache Effectively**: Flash Install uses a smart caching system. The first installation of a package will be slower, but subsequent installations will be extremely fast.
3. **Configure Network Settings**: Set appropriate timeout values and consider using cloud caching for team environments.
4. **Offline Mode**: Use `--offline` flag to install from cache only when network connectivity is limited.
5. **Production Installs**: Use `--no-dev` flag to skip devDependencies for faster production builds.

### Running Performance Benchmarks

Use the built-in benchmark command to compare Flash Install with npm:

```bash
flash benchmark
```

This will compare installation times for different project sizes and provide detailed performance metrics.

## API Reference

Flash Install provides both command-line and programmatic APIs.

### Programmatic Usage

```javascript
import { PackageDownloader } from './utils/parallel-downloader.js';
import { PerformanceTracker } from './utils/performance-tracker.js';
import { ErrorHandler } from './utils/error-handler.js';

// Example: Use the package downloader programmatically
const downloader = new PackageDownloader({
  concurrency: 8,
  timeout: 30000
});

try {
  const result = await downloader.downloadPackage(
    'lodash', 
    '4.17.21', 
    './downloads'
  );
  console.log('Download successful:', result);
} catch (error) {
  console.error('Download failed:', error.message);
}

// Example: Track performance
const tracker = new PerformanceTracker();
tracker.startOperation('installation');
// ... perform installation ...
const duration = tracker.endOperation('installation');
console.log(`Installation took ${duration}ms`);
```

## FAQ

### How much faster is Flash Install compared to npm?
Flash Install typically achieves 40-65x speed improvements over npm install, with the exact improvement depending on project size and network conditions.

### Is Flash Install compatible with existing npm workflows?
Yes, Flash Install is designed as a drop-in replacement for npm install, supporting all common flags and workflows.

### Can I use Flash Install with yarn or pnpm?
Flash Install is primarily designed as an npm replacement, but it can be configured to work in projects using other package managers.

### How does the caching work?
Flash Install caches packages at multiple levels - individual packages and dependency trees. It uses SHA256 integrity verification to ensure cache reliability.

### Is cloud caching secure?
Yes, cloud caching uses secure authentication with your cloud provider and maintains the same integrity checks as local caching.

### What platforms does Flash Install support?
Flash Install supports all platforms where Node.js runs, including Windows, macOS, and Linux.