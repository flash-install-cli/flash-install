# Changelog

## Version 2.0.0 (2025-10-22)

### Added
- Interactive setup wizard with `flash setup` command for guided configuration
- Comprehensive user guide system with contextual help (`flash help [topic]`)
- Enhanced error messages with actionable suggestions based on error categories
- New documentation files: user documentation, API reference, and tutorials
- Documentation validation script to ensure comprehensive coverage
- Performance optimization guides and configuration recommendations
- Cloud integration examples for AWS S3, GCP, and Azure
- Parallel download examples and advanced programmatic usage tutorials
- Error handling examples with recovery strategies
- Performance tracking API examples and usage guides
- Core component documentation (NetworkManager, WorkerPool, Timer, etc.)
- Additional command line options: --workspace and --workspace-filter

### Changed
- Enhanced FlashError class to provide detailed suggestions for resolution
- Improved error logging with actionable guidance and setup wizard recommendations
- Updated README with comprehensive feature overview and architecture details
- Refined user experience with better guidance and troubleshooting information
- Enhanced API documentation with complete method references
- Improved CLI help system with topic-based guidance

### Fixed
- Fixed TypeScript compilation errors and import issues
- Corrected worker pool implementation to properly handle concurrent operations
- Resolved issues with decorator functions and 'this' context in performance tracking
- Fixed required parameter following optional parameter errors in parallel downloader
- Corrected path import issues in performance tracker
- Fixed various compilation and type errors across utility modules

### Security
- Added integrity verification with SHA256 for cached packages
- Enhanced error categorization for better security-related error handling

## Version 1.8.4 (2025-04-30)

### Bug Fixes
- Fixed display issue with the 50% badge in README

## Version 1.8.3 (2025-04-30)

### Bug Fixes
- Fixed issue with default command not running install

## Version 1.8.2 (2025-04-30)

### Enhancements
- Made `flash-install` command without arguments run the install command by default
- Improved user experience by allowing both `flash-install` and `flash-install install` to work the same way

### Documentation
- Completely restructured README for better readability
- Moved command usage to the top of the README
- Simplified and organized options for better clarity
- Added more examples of common usage patterns

## Version 1.8.1 (2025-04-25)

### Breaking Changes
- Changed the `flash-install` command to use the direct CLI implementation for better reliability and performance
- Removed the React-based terminal UI to avoid compatibility issues with React versions

### Bug Fixes
- Fixed critical error when running `flash-install` after downloading
- Fixed React version compatibility issues by downgrading React from 19.1.0 to 18.3.1
- Updated the postinstall script to make the direct CLI executable

### Documentation
- Updated README and documentation to reflect the new command usage
- Clarified that `flash-install install` is the recommended command
- Added more examples of command usage

## Version 1.8.0

Initial release with full feature set.
