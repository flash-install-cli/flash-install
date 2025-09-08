<p align="center">
  <img src="https://raw.githubusercontent.com/flash-install-cli/flash-install/main/assets/logo.png" alt="flash-install logo" width="200" height="200">
</p>

<h1 align="center">⚡ Flash Install</h1>
<p align="center">A blazingly fast replacement for npm install with deterministic caching</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D%2016.0.0-brightgreen.svg" alt="Node.js Version"></a>
  <a href="https://www.npmjs.com/package/@flash-install/cli"><img src="https://img.shields.io/npm/v/@flash-install/cli" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@flash-install/cli"><img src="https://img.shields.io/npm/dm/@flash-install/cli" alt="npm downloads"></a>
  <a href="https://github.com/flash-install-cli/flash-install/graphs/commit-activity"><img src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" alt="Maintenance"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Cache-Deterministic-blue" alt="Cache: Deterministic">
  <img src="https://img.shields.io/badge/Cloud-Team%20Sharing-lightblue" alt="Cloud: Team Sharing">
  <img src="https://img.shields.io/badge/CI/CD-Optimized-green" alt="CI/CD: Optimized">
</p>

## Quick Start

### Installation

```bash
npm install -g @flash-install/cli
```

### Basic Usage

```bash
# Install dependencies
flash-install install

# Create a snapshot for faster future installs
flash-install snapshot

# Restore from a snapshot (ultra-fast)
flash-install restore

# Clean up
flash-install clean
```

## Features

- ⚡ **30-50% faster** than standard npm install
- 🔄 **Deterministic caching** for consistent builds
- 📦 **Snapshot support** for instant dependency restoration
- ☁️ **Cloud caching** for team sharing
- 🔌 **Multiple package managers** support (npm, yarn, pnpm, bun)
- 🏗️ **Monorepo support** with workspace detection
- 🔍 **Fallback to npm** if any issues occur

## Command Reference

| Command | Description |
|---------|-------------|
| `flash-install` | Install dependencies (default) |
| `flash-install install` | Install dependencies |
| `flash-install snapshot` | Create a snapshot of node_modules |
| `flash-install restore` | Restore node_modules from a snapshot |
| `flash-install clean` | Remove node_modules and snapshot |
| `flash-install clean-modules` | Remove only node_modules (preserves snapshot) |
| `flash-install clean-snapshot` | Remove only snapshot (preserves node_modules) |
| `flash-install sync` | Synchronize dependencies with lockfile |

## Common Options

```bash
# Use offline mode
flash-install --offline

# Specify package manager
flash-install --package-manager yarn

# Skip dev dependencies
flash-install --no-dev

# Enable workspace support for monorepos
flash-install -w
```

## Performance Comparison

| Scenario | npm install | flash-install | Speedup |
|----------|------------|---------------|---------|
| First install (small project) | 30-60s | 10-15s | 3-4x |
| First install (large project) | 3-5min | 1-2min | 2-3x |
| Subsequent install (from cache) | 30-60s | 5-10s | 6-10x |
| Subsequent install (from snapshot) | 30-60s | 1-3s | 20-30x |
| CI/CD environment | 1-3min | 5-15s | 10-20x |

## Advanced Features

### Cloud Caching

Share caches across your team or CI/CD environments:

```bash
flash-install --cloud-cache --cloud-provider=s3 --cloud-bucket=your-bucket-name
```

### Workspace Support

Efficiently manage monorepo dependencies:

```bash
flash-install -w
```

### Offline Development

Work without an internet connection:

```bash
# Create a snapshot while online
flash-install snapshot

# Later, restore dependencies while offline
flash-install restore --offline
```

### Using Different Package Managers

```bash
# Use with Yarn
flash-install --package-manager yarn

# Use with PNPM
flash-install --package-manager pnpm

# Use with Bun
flash-install --package-manager bun
```

## Additional Options

Here are some of the most useful options you can use with flash-install:

### General Options
- `--offline`: Use offline mode (requires cache or snapshot)
- `--no-cache`: Disable cache usage
- `--concurrency <number>`: Number of concurrent installations
- `--package-manager <manager>`: Package manager to use (npm, yarn, pnpm, bun)
- `--no-dev`: Skip dev dependencies
- `--verbose`: Enable verbose logging
- `--quiet`: Suppress all output except errors

### Workspace Options
- `--workspace` or `-w`: Enable workspace support for monorepos
- `--workspace-filter <packages...>`: Filter specific workspace packages

### Cloud Options
- `--cloud-cache`: Enable cloud cache integration
- `--cloud-provider <provider>`: Cloud provider type (s3, azure, gcp)
- `--cloud-bucket <name>`: Cloud provider bucket name
- `--cloud-region <region>`: Cloud provider region

For a complete list of all available options, run:
```bash
flash-install --help
```

## GitHub Actions Integration

Add Flash Install to your GitHub Actions workflow:

```yaml
steps:
  - uses: actions/checkout@v3

  - name: Install dependencies with Flash Install
    run: |
      npm install -g @flash-install/cli
      flash-install install --concurrency 8 --quiet

  # Or install and create snapshot for future runs
  - name: Create flash-install snapshot
    run: flash-install snapshot
    continue-on-error: true

  # Future workflows can restore ultra-fast from snapshot
  - name: Restore ultra-fast from snapshot
    run: flash-install restore || npm ci

  # Optional GitHub Action (when published):
  # - uses: flash-install-cli/flash-install-action@v1
  #   with:
  #     command: 'install'
  #     concurrency: '8'
```

> Note: The native GitHub Action will be available when `flash-install-cli/flash-install-action` is published.

## How It Works

1. **Dependency Resolution**: Parses lockfiles to determine exact dependencies
2. **Workspace Detection**: Identifies workspace packages in monorepos (when enabled)
3. **Cache Check**: Checks if dependencies are in the global cache
4. **Snapshot Check**: Checks if a valid `.flashpack` snapshot exists
5. **Installation**: If no cache or snapshot is available, installs dependencies using the package manager
6. **Caching**: Adds newly installed packages to the cache with optional compression
7. **Snapshotting**: Creates a `.flashpack` snapshot with fingerprinting for future use

## Documentation

For more detailed documentation, see the [docs](docs) directory:

- [Performance Optimizations](docs/performance.md)
- [Monorepo Support](docs/monorepo.md)
- [Offline Mode](docs/offline-mode.md)
- [Dependency Analysis](docs/dependency-analysis.md)
- [Cloud Cache](docs/cloud-cache.md)
- [Enhanced Plugin System](docs/enhanced-plugin-system.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository at https://github.com/flash-install-cli/flash-install
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Acknowledgements

- Inspired by the speed of [Bun](https://bun.sh/), the reliability of [Yarn](https://yarnpkg.com/), and the efficiency of [PNPM](https://pnpm.io/)
- Thanks to all the open-source projects that made this possible
