# Flash Install - Tutorials and Examples

## Table of Contents
1. [Basic Installation](#basic-installation)
2. [Advanced Configuration](#advanced-configuration)
3. [Performance Optimization](#performance-optimization)
4. [Cloud Caching](#cloud-caching)
5. [Programmatic Usage](#programmatic-usage)
6. [Error Handling Examples](#error-handling-examples)
7. [Performance Tracking Examples](#performance-tracking-examples)
8. [Parallel Downloads Examples](#parallel-downloads-examples)
9. [CI/CD Integration](#cicd-integration)
10. [Troubleshooting Common Issues](#troubleshooting-common-issues)

## Basic Installation

### Installing All Dependencies
```bash
# Equivalent to npm install
flash
```

### Installing Specific Packages
```bash
# Install a single package
flash lodash

# Install multiple packages
flash lodash express react

# Install as dev dependency
flash jest --save-dev

# Install specific version
flash lodash@4.17.21
```

### Offline Installation
```bash
# Install from cache only (no network connection required)
flash --offline
```

### Production Installation
```bash
# Install only production dependencies (skip dev dependencies)
flash --no-dev
```

## Advanced Configuration

### Using Configuration File
Create a `.flashrc` file in your project root:

```json
{
  "concurrency": 12,
  "timeout": 45000,
  "cloudCache": true,
  "cloudProvider": "aws",
  "cloudBucket": "my-company-cache"
}
```

### Command Line Configuration
```bash
# Set concurrency to 10 with custom timeout
flash --concurrency 10 --timeout 45000

# Verbose logging for debugging
flash --verbose

# Skip dev dependencies and install offline
flash --no-dev --offline
```

## Performance Optimization

### Running the Setup Wizard
The easiest way to optimize performance is to run the interactive setup:

```bash
flash setup
```

This will guide you through configuration options and optimize settings for your system.

### Manual Optimization
For advanced users, here are performance optimization strategies:

```bash
# Increase concurrency for faster downloads (adjust based on your system)
flash --concurrency 16

# Increase timeout for slower networks
flash --timeout 60000

# Use cloud caching for team environments
flash --cloud-cache --cloud-provider aws --cloud-bucket my-cache-bucket
```

### Benchmarking Performance
Compare Flash Install with npm:

```bash
flash benchmark
```

This will run a comprehensive benchmark and show performance improvements.

## Cloud Integration and Caching

### AWS S3 Setup
```bash
flash --cloud-cache --cloud-provider aws --cloud-bucket my-bucket-name
```

Make sure your AWS credentials are configured (via AWS CLI, environment variables, or IAM roles).

### Google Cloud Storage Setup
```bash
flash --cloud-cache --cloud-provider gcp --cloud-bucket my-gcs-bucket
```

Ensure your GCP credentials are properly set up.

### Azure Blob Storage Setup
```bash
flash --cloud-cache --cloud-provider azure --cloud-bucket my-azure-container
```

Configure Azure credentials appropriately.

### Example: Team Shared Cache with AWS
```bash
# .flashrc file for team configuration
{
  "concurrency": 12,
  "cloudCache": true,
  "cloudProvider": "aws",
  "cloudBucket": "company-flash-cache",
  "timeout": 45000
}
```

## Programmatic Usage

### Using Flash Install in Your Code

```javascript
import { PackageDownloader } from './utils/parallel-downloader.js';
import { PerformanceTracker } from './utils/performance-tracker.js';
import { ErrorHandler } from './utils/error-handler.js';

// Create a package downloader instance
const downloader = new PackageDownloader({
  concurrency: 8,
  timeout: 30000
});

// Track performance
const tracker = new PerformanceTracker();

try {
  // Start performance tracking
  tracker.startOperation('package-download');
  
  // Download a package
  const result = await downloader.downloadPackage(
    'lodash', 
    '4.17.21', 
    './downloads'
  );
  
  // End performance tracking
  const duration = tracker.endOperation('package-download', 'network');
  
  console.log(`Download completed in ${duration}ms:`, result);
} catch (error) {
  // Handle errors with detailed suggestions
  const flashError = ErrorHandler.handleError(error, {
    operation: 'package-download',
    package: 'lodash@4.17.21'
  });
  
  throw flashError;
} finally {
  // Clean up resources
  downloader.destroy();
}
```

### Advanced Programmatic Example

```javascript
import { ParallelDownloadManager } from './utils/parallel-downloader.js';
import { measurePerformance } from './utils/performance-tracker.js';

class CustomInstaller {
  constructor(options = {}) {
    this.downloadManager = new ParallelDownloadManager({
      concurrency: options.concurrency || 8,
      timeout: options.timeout || 30000
    });
  }

  // Use performance decorator to automatically track this method
  @measurePerformance
  async installMultiple(packages, outputDir) {
    const downloads = packages.map(pkg => ({
      url: pkg.url,
      outputDir,
      filename: `${pkg.name}-${pkg.version}.tgz`
    }));

    return await this.downloadManager.downloadMultiple(downloads);
  }

  async cleanup() {
    this.downloadManager.destroy();
  }
}

// Usage
const installer = new CustomInstaller({ concurrency: 10 });
try {
  const results = await installer.installMultiple([
    { name: 'lodash', version: '4.17.21', url: '...' },
    { name: 'express', version: '4.18.2', url: '...' }
  ], './packages');
  
  console.log('Installation results:', results);
} finally {
  await installer.cleanup();
}
```

## Error Handling Examples

Flash Install provides comprehensive error handling with categorization and actionable suggestions:

### Basic Error Handling
```javascript
import { ErrorHandler, ErrorCategory, RecoveryStrategy } from './utils/error-handler.js';

try {
  // Some operation that might fail
  await someOperation();
} catch (error) {
  // Handle the error with detailed suggestions
  const flashError = ErrorHandler.handleError(error, {
    operation: 'some-operation',
    context: { 
      param1: 'value1',
      timestamp: Date.now()
    }
  });
  
  // The error will now include:
  // - Categorization (ErrorCategory)
  // - Recovery strategy (RecoveryStrategy)
  // - Actionable suggestions for resolution
  // - Contextual information
}
```

### Custom Error Handling
```javascript
import { FlashError, ErrorCategory, RecoveryStrategy } from './utils/error-handler.js';

// Create a custom error with specific category and recovery strategy
const myError = new FlashError(
  'Custom error message',
  ErrorCategory.NETWORK_TIMEOUT,  // Specific error category
  new Error('Original error'),    // Original error for context
  RecoveryStrategy.RETRY,         // Appropriate recovery strategy
  {
    maxRetries: 3,
    retryCount: 1,
    recoverable: true,
    context: { url: 'https://example.com' }
  }
);

// Log with actionable suggestions
myError.log();
```

### Error Handling with Retry Logic
```javascript
import { ErrorHandler } from './utils/error-handler.js';

// Wrap operations with automatic error handling and retries
const result = await ErrorHandler.withErrorHandling(
  async () => {
    // Operation that might fail and needs retry logic
    return await riskyOperation();
  },
  {
    operation: 'risky-operation',
    params: { id: 123 }
  },
  {
    maxRetries: 5,
    onError: (error) => {
      console.log(`Error occurred: ${error.message}`);
    },
    onRetry: (error, attempt) => {
      console.log(`Retry attempt ${attempt} after error: ${error.message}`);
    },
    retryDelay: 1000 // Start with 1 second delay
  }
);
```

## Performance Tracking Examples

Flash Install includes a comprehensive performance tracking system:

### Basic Performance Tracking
```javascript
import { PerformanceTracker } from './utils/performance-tracker.js';

// Create a performance tracker
const tracker = new PerformanceTracker({
  enabled: true,
  outputDir: './metrics',  // Directory to save metrics
  logToConsole: false,
  maxMetrics: 50,          // Keep last 50 metrics in memory
  trackDetailed: true
});

// Track a complete installation
tracker.trackInstallation(
  'npm',           // package manager used
  42,              // number of packages
  2450,            // total time in ms
  0.87,            // cache hit rate (0-1)
  true,            // success
  undefined        // error message if failed
);

// Get current statistics
const stats = tracker.getStats();
console.log(`Total installations: ${stats.totalInstallations}`);
console.log(`Success rate: ${tracker.getSuccessRate()}%`);
console.log(`Average time: ${tracker.getAverageInstallationTime()}ms`);
```

### Operation-Level Performance Tracking
```javascript
import { PerformanceTracker } from './utils/performance-tracker.js';

const tracker = new PerformanceTracker();

// Manually track specific operations
tracker.startOperation('network-request');
try {
  const result = await makeNetworkRequest();
  const duration = tracker.endOperation('network-request', 'network');
  console.log(`Network request took ${duration}ms`);
} catch (error) {
  tracker.endOperation('network-request', 'network');
  throw error;
}

// Or use the performance decorator for automatic tracking
import { measurePerformance } from './utils/performance-tracker.js';

class ApiService {
  @measurePerformance
  async fetchData(url) {
    // This method will be automatically tracked for performance
    const response = await fetch(url);
    return response.json();
  }
}
```

### Export Performance Reports
```javascript
import { PerformanceTracker } from './utils/performance-tracker.js';

const tracker = new PerformanceTracker();

// ... perform operations and track them ...

// Export metrics as JSON
const jsonReport = tracker.exportReport('json');
console.log(jsonReport);

// Export metrics as CSV
const csvReport = tracker.exportReport('csv');
console.log(csvReport);
```

## Parallel Downloads Examples

Flash Install implements sophisticated parallel download capabilities:

### Basic Parallel Downloads
```javascript
import { PackageDownloader } from './utils/parallel-downloader.js';

// Create a package downloader with custom options
const downloader = new PackageDownloader({
  concurrency: 10,    // 10 parallel downloads
  timeout: 45000,     // 45 second timeout
  retries: 3,         // 3 retry attempts
  retryDelay: 2000    // 2 second delay between retries
});

// Download a single package
const result = await downloader.downloadPackage(
  'lodash',
  '4.17.21',
  './downloads'
);

console.log('Download result:', result);
```

### Multiple Package Downloads
```javascript
import { PackageDownloader } from './utils/parallel-downloader.js';

const downloader = new PackageDownloader({
  concurrency: 8,
  timeout: 30000
});

// Download multiple packages in parallel
const packages = [
  { name: 'lodash', version: '4.17.21' },
  { name: 'express', version: '4.18.2' },
  { name: 'react', version: '18.2.0' }
];

const results = await downloader.downloadPackages(
  packages,
  './downloads'
);

// Results include detailed information about each download
results.forEach((result, index) => {
  if (result.success) {
    console.log(`✓ ${packages[index].name}@${packages[index].version} downloaded in ${result.duration}ms`);
  } else {
    console.log(`✗ ${packages[index].name}@${packages[index].version} failed: ${result.error}`);
  }
});

downloader.destroy(); // Clean up resources
```

### Advanced Parallel Download with Progress Tracking
```javascript
import { ParallelDownloadManager } from './utils/parallel-downloader.js';
import { PerformanceTracker } from './utils/performance-tracker.js';

const downloadManager = new ParallelDownloadManager({
  concurrency: 6,
  onProgress: (downloaded, total, url) => {
    const percent = total > 0 ? (downloaded / total * 100).toFixed(2) : 0;
    console.log(`${url} progress: ${percent}% (${downloaded}/${total} bytes)`);
  }
});

const tracker = new PerformanceTracker();

// Track download performance
tracker.startOperation('parallel-download');

const downloads = [
  { url: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz', outputDir: './downloads', filename: 'lodash.tgz' },
  { url: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz', outputDir: './downloads', filename: 'express.tgz' },
  { url: 'https://registry.npmjs.org/react/-/react-18.2.0.tgz', outputDir: './downloads', filename: 'react.tgz' }
];

try {
  const results = await downloadManager.downloadMultiple(downloads);
  const duration = tracker.endOperation('parallel-download', 'network');
  
  console.log(`Downloaded ${results.filter(r => r.success).length}/${results.length} packages in ${duration}ms`);
} finally {
  downloadManager.destroy();
}
```

## Using Flash Help

Flash Install includes contextual help for various topics:

```bash
# General help
flash help

# Help with common issues
flash help issues

# Performance tips
flash help performance

# Troubleshooting guide
flash help troubleshooting

# Quick start guide
flash help quickstart

# Specific command help
flash help setup
flash help clean
flash help benchmark
```

## Working with Workspaces

Flash Install supports npm workspaces with special options:

```bash
# Install in specific workspace
flash --workspace packages/my-package

# Install with workspace filter
flash --workspace-filter my-package

# Example with multiple workspace filters
flash --workspace-filter "ui-*" --workspace-filter "api-*"
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]

    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Install Flash Install
      run: npm install -g @flash-install/cli
    
    - name: Install dependencies with Flash Install
      run: flash
    
    - name: Run tests
      run: npm test
```

### Installing in CI/CD
Install Flash Install globally in your CI environment:

```bash
# Using npm
npm install -g @flash-install/cli

# Using yarn
yarn global add @flash-install/cli
```

### Performance Improvements in CI/CD
Flash Install provides significant speed improvements in CI/CD environments:

- **Small projects**: ~95% faster installation
- **Medium projects**: ~97% faster installation  
- **Large projects**: ~98% faster installation

This results in:
- Faster build pipelines
- Reduced CI/CD costs
- Improved developer productivity
- More reliable builds due to better error handling
```

### GitLab CI Example
```yaml
stages:
  - install
  - test

.install-template: &install-template
  before_script:
    - npm install -g @flash-install/cli
  script:
    - flash

test:
  stage: test
  <<: *install-template
  script:
    - flash
    - npm test
```

### Docker Example
```dockerfile
FROM node:18-alpine

# Install Flash Install
RUN npm install -g @flash-install/cli

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies using Flash Install
RUN flash

# Copy the rest of the application
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

## Troubleshooting Common Issues

### Permission Errors
```bash
# If getting permission errors, try running with sudo (on Unix systems)
sudo flash

# Or change the cache directory to a location you have write access to
flash setup
# Then choose a different cache directory
```

### Network Timeout Issues
```bash
# Increase the timeout value
flash --timeout 60000

# Or configure in .flashrc
{
  "timeout": 60000
}
```

### Out of Disk Space
```bash
# Clean the cache
flash clean

# Or change the cache location to a drive with more space
flash setup
```

### Slow Installation on First Run
```bash
# This is expected - Flash Install is fastest on subsequent runs
# The cache is built during the first installation
# Subsequent installations will be significantly faster
```

### Debugging with Verbose Logging
```bash
# Enable verbose logging to see detailed information
flash --verbose

# Or use the debug command if available
flash --debug
```

### Checking Network Status
```bash
# Check if required services are available
flash status

# Or check network connectivity specifically
flash --help issues
```

### Reset Configuration
```bash
# If you need to reset to default configuration
flash setup --reset
```