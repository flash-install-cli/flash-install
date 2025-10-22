# ⚡ Flash Install - The Fastest Package Installation Tool

[![npm version](https://badge.fury.io/js/@flash-install%2Fcli.svg)](https://badge.fury.io/js/@flash-install%2Fcli)
[![License](https://img.shields.io/npm/l/@flash-install/cli.svg)](https://github.com/flash-install-cli/flash-install/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/@flash-install/cli.svg)](https://www.npmjs.com/package/@flash-install/cli)

**Flash Install** is a blazingly fast, drop-in replacement for `npm install` with deterministic caching and advanced performance optimizations. Experience installation speeds up to 65x faster than traditional npm install!

## 🚀 Key Features

- **Lightning Fast**: Up to 65x faster than `npm install` through intelligent caching and parallel downloads
- **Drop-in Replacement**: Works with existing npm workflows - just replace `npm install` with `flash`
- **Advanced Caching**: Multi-layer caching system with integrity verification
- **Parallel Downloads**: Configurable concurrent downloads for maximum speed
- **Cloud Integration**: Share caches across teams using AWS S3, GCP, or Azure
- **Performance Tracking**: Built-in analytics to monitor installation performance
- **Cross-Platform**: Works on Windows, macOS, and Linux

## 📦 Installation

### Prerequisites
- Node.js version 16.0.0 or higher

### Install Globally
```bash
npm install -g @flash-install/cli
```

Or with yarn:
```bash
yarn global add @flash-install/cli
```

## 🚦 Quick Start

### Basic Usage
Flash Install works as a direct replacement for npm install:

```bash
# Install all dependencies (equivalent to npm install)
flash

# Install a specific package (equivalent to npm install package-name)
flash lodash

# Install as dev dependency (equivalent to npm install package-name --save-dev)
flash lodash --save-dev
```

### Optimize with Setup Wizard
Run the interactive setup wizard to optimize Flash Install for your system:

```bash
flash setup
```

## ⚙️ Configuration

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
Create a `.flashrc` file in your project directory or use the global config at `~/.flash-install/config.json`:

```json
{
  "concurrency": 12,
  "timeout": 45000,
  "cloudCache": true,
  "cloudProvider": "aws",
  "cloudBucket": "my-company-cache"
}
```

## 📊 Performance

Flash Install achieves significant performance improvements:

| Project Size | npm install | Flash Install | Improvement |
|--------------|-------------|---------------|-------------|
| Small | 4.26s | 0.12s | 97.18% |
| Medium | 5.16s | 0.12s | 97.67% |
| Large | 14.68s | 0.13s | 99.11% |

**Overall Speed Improvement**: 65x faster than npm install

*Performance results based on real benchmarks. Actual performance may vary based on network conditions and system specifications.*

## 🌐 Cloud Caching

Accelerate installation across your team with cloud caching:

```bash
# Enable AWS S3 caching
flash --cloud-cache --cloud-provider aws --cloud-bucket my-bucket

# Enable Google Cloud Storage caching
flash --cloud-cache --cloud-provider gcp --cloud-bucket my-gcs-bucket

# Enable Azure Blob Storage caching
flash --cloud-cache --cloud-provider azure --cloud-bucket my-container
```

## 🛠️ Advanced Usage

### Performance Benchmarking
Compare Flash Install with npm install:

```bash
flash benchmark
```

### Clean Cache
Clear the package cache:

```bash
flash clean
```

### Check Status
View Flash Install status and cache information:

```bash
flash status
```

### Get Help
Access contextual help:

```bash
flash help                    # General help
flash help issues             # Common issues and solutions
flash help performance        # Performance tips
flash help troubleshooting    # Troubleshooting guide
```

## 📚 Documentation

- [Complete User Documentation](./docs/user-documentation.md)
- [API Reference](./docs/api-documentation.md)
- [Tutorials and Examples](./docs/tutorials-examples.md)

## ☁️ Cloud Integration

Flash Install provides comprehensive cloud integration through cloud-based caching for team environments with AWS S3, Google Cloud Storage, and Azure Blob Storage.

## 🏗️ Architecture

Flash Install is built with several core components:

- **PackageDownloader**: Manages package downloads with parallel capabilities
- **PerformanceTracker**: Tracks and analyzes installation performance metrics
- **ErrorHandler**: Provides comprehensive error categorization and recovery strategies
- **NetworkManager**: Handles network operations and connectivity checks
- **ParallelDownloadManager**: Implements parallel download functionality
- **WorkerPool**: Manages parallel processing tasks
- **Timer**: Provides precise performance measurement utilities

## 🧪 Error Handling System

Our advanced error handling includes:

- **ErrorCategory**: Detailed error categorization (FILE_NOT_FOUND, NETWORK_TIMEOUT, etc.)
- **RecoveryStrategy**: Automated recovery strategies (RETRY, ALTERNATIVE, etc.)
- **FlashError**: Enhanced error objects with actionable suggestions

## 📊 Performance Tracking

Built-in analytics include:

- Installation time measurement
- Cache hit rate tracking
- Network vs. cache operation comparison
- Success rate monitoring
- Exportable reports in JSON/CSV formats

## 🔧 Troubleshooting

### Common Issues

#### Permission Denied
Run with appropriate permissions or adjust cache directory:
```bash
flash setup  # Change cache directory location
```

#### Network Timeout
Increase timeout value in configuration:
```bash
flash --timeout 60000
```

#### Slow First Install
This is expected. Flash Install builds cache during first install and is fastest on subsequent runs.

### Getting Help
- [Troubleshooting Guide](./docs/user-documentation.md#troubleshooting)
- [FAQ](./docs/user-documentation.md#faq)
- [Create an Issue](https://github.com/flash-install-cli/flash-install/issues)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Thanks to all [contributors](https://github.com/flash-install-cli/flash-install/graphs/contributors)
- Inspired by the need for faster development workflows
- Built with performance and user experience in mind

---

**Flash Install** - *Making dependency management effortless and efficient*

⭐ If you find this tool helpful, please give it a star!

## 📞 Support

For support, please [open an issue](https://github.com/flash-install-cli/flash-install/issues) on our GitHub repository.