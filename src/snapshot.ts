import path from 'path';
import fs from 'fs-extra';
import archiver from 'archiver';
import decompress from 'decompress';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';
import { execSync, spawn } from 'child_process';
import * as tarStream from 'tar-stream';

// Define TarExtract class with proper typing
interface TarHeader {
  name: string;
  type: string;
}

interface TarNext {
  (err?: Error): void;
}

type TarExtractType = {
  new(): tarStream.Extract;
  prototype: tarStream.Extract;
};

const TarExtract = tarStream.extract as unknown as TarExtractType;
import { logger } from './utils/logger.js';
import * as fsUtils from './utils/fs.js';
import { hashDependencyTree } from './utils/hash.js';
import { cache } from './cache.js';
import { Timer, createTimer } from './utils/timer.js';
import { Spinner } from './utils/progress.js';
import { ReliableProgress } from './utils/reliable-progress.js';
import { performance } from 'perf_hooks';

import {
  createSnapshotFingerprint,
  verifySnapshotFingerprint,
  getLockfilePath,
  SnapshotFingerprint
} from './utils/integrity.js';

/**
 * Snapshot format options *
 */
export enum SnapshotFormat {
  ZIP = 'zip',
  TAR = 'tar',
  TAR_GZ = 'tar.gz'
}

// Helper function to check format
function isZipFormat(format: SnapshotFormat): boolean {
  return format === SnapshotFormat.ZIP;
}

/**
 * Snapshot options
 */
export interface SnapshotOptions {
  format: SnapshotFormat;
  compressionLevel: number;
  includeDevDependencies: boolean;
  cacheTimeout?: string; // Timeout in seconds
}

/**
 * Default snapshot options
 */
const defaultOptions: SnapshotOptions = {
  format: SnapshotFormat.TAR_GZ,
  compressionLevel: 3,
  includeDevDependencies: true
};

/**
 * Snapshot manager for creating and restoring .flashpack archives
 */
export class Snapshot {
  private options: SnapshotOptions;

  /**
   * Create a new snapshot manager
   * @param options Snapshot options
   */
  constructor(options: Partial<SnapshotOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Get the default snapshot path for a project
   * @param projectDir The project directory
   * @returns The snapshot path
   */
  getSnapshotPath(projectDir: string): string {
    return path.join(projectDir, '.flashpack');
  }

  /**
   * Create a snapshot of node_modules
   * @param projectDir The project directory
   * @param dependencies The dependency tree
   * @param outputPath Optional custom output path
   * @returns True if successful
   */
  async create(
    projectDir: string,
    dependencies: Record<string, string>,
    outputPath?: string
  ): Promise<boolean> {
    const nodeModulesPath = path.join(projectDir, 'node_modules');
    const snapshotPath = outputPath || this.getSnapshotPath(projectDir);

    // Check if node_modules exists
    if (!await fsUtils.directoryExists(nodeModulesPath)) {
      logger.error('node_modules directory not found');
      return false;
    }

    try {
      // Start timer
      const timer = createTimer();
      const startTime = Date.now();

      // Very simple progress indicator
      let dots = '';
      const progressInterval = setInterval(() => {
        dots = (dots.length >= 3) ? '' : dots + '.';
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\rCreating snapshot${dots.padEnd(3)} (${elapsed}s elapsed)${' '.repeat(20)}`);
      }, 500);

      // Create parent directory if needed
      await fsUtils.ensureDir(path.dirname(snapshotPath));

      // Create metadata file with fingerprint
      const metadataPath = path.join(projectDir, '.flashpack-metadata.json');
      const lockfilePath = getLockfilePath(projectDir);
      const fingerprint = await createSnapshotFingerprint(dependencies, lockfilePath);

      await fs.writeJSON(metadataPath, {
        dependencies,
        timestamp: Date.now(),
        format: this.options.format,
        fingerprint
      }, { spaces: 2 });

      // Use native tools for maximum speed
      if (this.options.format === SnapshotFormat.TAR_GZ) {
        // Update progress message
        clearInterval(progressInterval);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        process.stdout.write(`\rCreating tar.gz snapshot... ${' '.repeat(20)}`);

        // Use native tar command with lower compression level (much faster than JS libraries)
        execSync(
          `tar -c -C "${projectDir}" --exclude=".git" --exclude="node_modules/*/node_modules" node_modules | gzip -3 > "${snapshotPath}"`,
          { stdio: 'ignore', shell: '/bin/bash' }
        );
      }
      else if (isZipFormat(this.options.format)) {
        // Update progress message
        clearInterval(progressInterval);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        process.stdout.write(`\rCreating zip snapshot... ${' '.repeat(20)}`);

        // Use native zip command
        execSync(
          `cd "${projectDir}" && zip -r "${snapshotPath}" .flashpack-metadata.json node_modules -x "*.git*" -x "node_modules/*/node_modules/*"`,
          { stdio: 'ignore' }
        );
      }
      else {
        // Fall back to archiver for other formats
        const output = createWriteStream(snapshotPath);
        const format = isZipFormat(this.options.format) ? 'zip' : 'tar';
        const archive = archiver(
          format,
          {
            zlib: { level: this.options.compressionLevel }
          }
        );

        // Track progress
        archive.on('progress', (progress) => {
          const { entries, fs } = progress;
          if (entries.total > 0) {
            const percent = Math.round((entries.processed / entries.total) * 100);
            // Update progress message
            clearInterval(progressInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            process.stdout.write(`\rCreating snapshot: ${percent}% (${entries.processed}/${entries.total} files)${' '.repeat(20)}`);
          }

          if (fs.processedBytes > 0) {
            const size = fsUtils.formatSize(fs.processedBytes);
            // Update progress message
            clearInterval(progressInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            process.stdout.write(`\rCreating snapshot: ${size} processed${' '.repeat(20)}`);
          }
        });

        // Set up archive
        archive.pipe(output);

        // Add metadata file
        archive.file(metadataPath, { name: '.flashpack-metadata.json' });

        // Add node_modules
        archive.directory(nodeModulesPath, 'node_modules');

        // Finalize and wait for completion
        clearInterval(progressInterval);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        process.stdout.write(`\rFinalizing snapshot...${' '.repeat(20)}`);
        await archive.finalize();
      }

      // Keep metadata file separate from archive (faster extraction)

      // Add to cache with timeout
      // Update progress message
      clearInterval(progressInterval);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      process.stdout.write(`\rAdding to global cache...${' '.repeat(20)}`);

      // Set a timeout to prevent hanging
      const cacheTimeout = this.options.cacheTimeout ?
        parseInt(this.options.cacheTimeout, 10) * 1000 :
        30000; // Default 30 seconds max for caching

      const cachePromise = cache.addDependencyTree(dependencies, nodeModulesPath);

      try {
        // Log timeout information
        logger.info(`Using cache timeout of ${cacheTimeout/1000}s (use --cache-timeout to change)`);

        // Use Promise.race to implement timeout
        await Promise.race([
          cachePromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Cache operation timed out after ${cacheTimeout/1000}s`)), cacheTimeout)
          )
        ]);
      } catch (error: any) {
        logger.warn(`Cache operation skipped: ${error?.message || String(error)}`);
        logger.info('Continuing without caching');
      }

      // Log success
      const stats = await fs.stat(snapshotPath);
      logger.success(`Created snapshot at ${snapshotPath} (${fsUtils.formatSize(stats.size)}) in ${timer.getElapsedFormatted()}`);

      return true;
    } catch (error) {
      logger.error(`Failed to create snapshot: ${error}`);
      return false;
    }
  }

  /**
   * Restore node_modules from a snapshot
   * @param projectDir The project directory
   * @param snapshotPath Optional custom snapshot path
   * @returns True if successful
   */
  async restore(projectDir: string, snapshotPath?: string): Promise<boolean> {
    const nodeModulesPath = path.join(projectDir, 'node_modules');
    const flashpackPath = snapshotPath || this.getSnapshotPath(projectDir);

    // Check if snapshot exists
    if (!await fsUtils.fileExists(flashpackPath)) {
      logger.error(`Snapshot not found at ${flashpackPath}`);
      return false;
    }

    try {
      // Start timer
      const timer = createTimer();
      const startTime = performance.now();

      // Get snapshot size for progress reporting
      const stats = await fs.stat(flashpackPath);
      const snapshotSize = stats.size;
      const snapshotSizeFormatted = fsUtils.formatSize(snapshotSize);

      // Improved progress indicator
      let processedBytes = 0;
      let lastPercent = 0;
      let lastUpdate = Date.now();
      process.stdout.write(`\x1b[36m\nRestoring from snapshot: ${snapshotSizeFormatted}\n\x1b[0m`);
      process.stdout.write('[' + ' '.repeat(50) + `] 0%`);

      // Remove existing node_modules if present
      if (await fsUtils.directoryExists(nodeModulesPath)) {
        process.stdout.write(`\n\x1b[33mRemoving existing node_modules...\x1b[0m\n`);
        await fsUtils.remove(nodeModulesPath);
      }

      // Ensure project directory exists
      await fsUtils.ensureDir(projectDir);
      await fsUtils.ensureDir(nodeModulesPath);

      // Use streaming extraction for tar.gz
      if (flashpackPath.endsWith('.tar.gz') || flashpackPath.endsWith('.tgz')) {
        const readStream = createReadStream(flashpackPath);
        const { createGunzip } = await import('zlib');
        const gunzip = createGunzip();
        const tarStream = await import('tar-stream');
        const tar = tarStream.extract();
        let totalFiles = 0;
        let extractedFiles = 0;

        tar.on('entry', (header: any, stream: NodeJS.ReadableStream, next: () => void) => {
          totalFiles++;
          const filePath = path.join(projectDir, header.name);
          fsUtils.ensureDir(path.dirname(filePath)).then(() => {
            const writeStream = createWriteStream(filePath);
            stream.pipe(writeStream);
            stream.on('data', (chunk: Buffer) => {
              processedBytes += chunk.length;
              const percent = Math.floor((processedBytes / snapshotSize) * 100);
              if (percent !== lastPercent && Date.now() - lastUpdate > 100) {
                lastPercent = percent;
                lastUpdate = Date.now();
                const bar = '='.repeat(percent / 2) + ' '.repeat(50 - percent / 2);
                process.stdout.write(`\r[${bar}] ${percent}%`);
              }
            });
            writeStream.on('finish', () => {
              extractedFiles++;
              next();
            });
          });
        });
        tar.on('finish', () => {
          process.stdout.write(`\r[${'='.repeat(50)}] 100%\n`);
        });
        await new Promise((resolve, reject) => {
          readStream.pipe(gunzip).pipe(tar);
          tar.on('finish', resolve);
          tar.on('error', reject);
        });
      } else {
        // Fallback to decompress with progress
        const decompress = (await import('decompress')).default;
        let fileCount = 0;
        await decompress(flashpackPath, projectDir, {
          filter: () => true,
          map: (file: any) => {
            processedBytes += file.data.length;
            fileCount++;
            const percent = Math.floor((processedBytes / snapshotSize) * 100);
            if (percent !== lastPercent && Date.now() - lastUpdate > 100) {
              lastPercent = percent;
              lastUpdate = Date.now();
              const bar = '='.repeat(percent / 2) + ' '.repeat(50 - percent / 2);
              process.stdout.write(`\r[${bar}] ${percent}%`);
            }
            return file;
          }
        });
        process.stdout.write(`\r[${'='.repeat(50)}] 100%\n`);
      }

      // Calculate elapsed time
      const endTime = performance.now();
      const elapsedMs = endTime - startTime;
      const extractionSpeed = snapshotSize / (elapsedMs / 1000); // bytes per second

      // Log success with timing and speed information
      process.stdout.write(`\x1b[32m\n✓ Restored node_modules from snapshot in ${timer.getElapsedFormatted()}\n\x1b[0m`);
      process.stdout.write(`\x1b[36mExtraction speed: ${fsUtils.formatSize(extractionSpeed)}/s\x1b[0m\n`);

      // Get node_modules size if it exists
      if (await fsUtils.directoryExists(nodeModulesPath)) {
        try {
          const nodeModulesStats = await fsUtils.getSize(nodeModulesPath);
          process.stdout.write(`\x1b[36mRestored ${fsUtils.formatSize(nodeModulesStats)} of dependencies\x1b[0m\n`);
        } catch (error) {
          process.stdout.write(`\x1b[33mCould not determine size of restored dependencies\x1b[0m\n`);
        }
      } else {
        process.stdout.write(`\x1b[31mnode_modules directory not found after restoration\x1b[0m\n`);
        process.stdout.write(`\x1b[33mTry running 'flash-install' to install dependencies\x1b[0m\n`);
      }

      return true;
    } catch (error) {
      process.stdout.write(`\x1b[31mFailed to restore snapshot: ${error}\x1b[0m\n`);
      return false;
    }
  }

  /**
   * Check if native extraction tools are available for the given snapshot
   * @param snapshotPath Path to the snapshot file
   * @returns True if native extraction is available
   */
  private isNativeExtractionAvailable(snapshotPath: string): boolean {
    // Check file extension
    const isTarGz = snapshotPath.endsWith('.tar.gz') || snapshotPath.endsWith('.tgz');
    const isZip = snapshotPath.endsWith('.zip');
    const isTar = snapshotPath.endsWith('.tar');

    if (!isTarGz && !isZip && !isTar) {
      return false;
    }

    // Check if native tools are available
    try {
      if (isTarGz || isTar) {
        execSync('tar --version', { stdio: 'ignore' });
        return true;
      } else if (isZip) {
        execSync('unzip -v', { stdio: 'ignore' });
        return true;
      }
    } catch (error) {
      logger.debug(`Native extraction tools not available: ${error}`);
      return false;
    }

    return false;
  }

  /**
   * Extract snapshot using native tools (tar, unzip)
   * @param snapshotPath Path to the snapshot file
   * @param projectDir Project directory
   * @param progress Progress indicator
   */
  private async extractWithNativeTools(
    snapshotPath: string,
    projectDir: string,
    progress: ReliableProgress
  ): Promise<void> {
    progress.updateStatus(`Extracting with native tools...`);

    // Use appropriate native tool based on file extension
    if (snapshotPath.endsWith('.tar.gz') || snapshotPath.endsWith('.tgz')) {
      // Use tar with progress monitoring
      return new Promise((resolve, reject) => {
        const process = spawn('tar', ['-xzf', snapshotPath, '-C', projectDir]);

        process.on('error', (error) => {
          logger.error(`Native extraction failed: ${error}`);
          reject(error);
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`tar exited with code ${code}`));
          }
        });

        // Update progress periodically
        let dots = '';
        const updateInterval = setInterval(() => {
          dots = dots.length >= 3 ? '' : dots + '.';
          progress.updateStatus(`Extracting with tar${dots}`);
        }, 500);

        // Clear interval when done
        process.on('close', () => clearInterval(updateInterval));
      });
    } else if (snapshotPath.endsWith('.zip')) {
      // Use unzip with progress monitoring
      return new Promise((resolve, reject) => {
        const process = spawn('unzip', ['-q', snapshotPath, '-d', projectDir]);

        process.on('error', (error) => {
          logger.error(`Native extraction failed: ${error}`);
          reject(error);
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`unzip exited with code ${code}`));
          }
        });

        // Update progress periodically
        let dots = '';
        const updateInterval = setInterval(() => {
          dots = dots.length >= 3 ? '' : dots + '.';
          progress.updateStatus(`Extracting with unzip${dots}`);
        }, 500);

        // Clear interval when done
        process.on('close', () => clearInterval(updateInterval));
      });
    } else if (snapshotPath.endsWith('.tar')) {
      // Use tar with progress monitoring
      return new Promise((resolve, reject) => {
        const process = spawn('tar', ['-xf', snapshotPath, '-C', projectDir]);

        process.on('error', (error) => {
          logger.error(`Native extraction failed: ${error}`);
          reject(error);
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`tar exited with code ${code}`));
          }
        });

        // Update progress periodically
        let dots = '';
        const updateInterval = setInterval(() => {
          dots = dots.length >= 3 ? '' : dots + '.';
          progress.updateStatus(`Extracting with tar${dots}`);
        }, 500);

        // Clear interval when done
        process.on('close', () => clearInterval(updateInterval));
      });
    } else {
      throw new Error(`Unsupported snapshot format for native extraction`);
    }
  }

  /**
   * Extract snapshot using streaming extraction (memory efficient)
   * @param snapshotPath Path to the snapshot file
   * @param projectDir Project directory
   * @param progress Progress indicator
   */
  private async extractWithStreaming(
    snapshotPath: string,
    projectDir: string,
    progress: ReliableProgress
  ): Promise<void> {
    progress.updateStatus(`Extracting with streaming...`);

    // Get snapshot size for progress reporting
    const stats = await fs.stat(snapshotPath);
    const totalSize = stats.size;
    let processedBytes = 0;

    // Use appropriate streaming method based on file extension
    if (snapshotPath.endsWith('.tar.gz') || snapshotPath.endsWith('.tgz')) {
      // Create read stream for the snapshot
      const readStream = createReadStream(snapshotPath);

      // Create gunzip stream
      const gunzip = zlib.createGunzip();

      // Create tar extract stream
      const extract = new TarExtract();

      // Track progress
      readStream.on('data', (chunk: Buffer) => {
        processedBytes += chunk.length;
        const percent = Math.round((processedBytes / totalSize) * 100);
        progress.updateStatus(`Extracting: ${percent}% (${fsUtils.formatSize(processedBytes)}/${fsUtils.formatSize(totalSize)})`);
      });

      // Handle extracted entries
      extract.on('entry', async (header: TarHeader, stream: NodeJS.ReadableStream, next: TarNext) => {
        try {
          // Get file path
          const filePath = path.join(projectDir, header.name);

          // Create directory if needed
          if (header.type === 'directory') {
            await fsUtils.ensureDir(filePath);
            stream.resume();
            next();
            return;
          }

          // Ensure parent directory exists
          await fsUtils.ensureDir(path.dirname(filePath));

          // Create write stream
          const writeStream = createWriteStream(filePath);

          // Pipe data to file
          stream.pipe(writeStream);

          // Handle completion
          writeStream.on('finish', () => {
            next();
          });

          // Handle errors
          writeStream.on('error', (error) => {
            logger.error(`Failed to write file ${filePath}: ${error}`);
            next(error);
          });
        } catch (error) {
          logger.error(`Failed to process entry ${header.name}: ${error}`);
          next(error instanceof Error ? error : new Error(String(error)));
        }
      });

      // Handle extraction completion
      extract.on('finish', () => {
        progress.updateStatus(`Extraction complete`);
      });

      // Pipe streams together
      await pipeline(readStream, gunzip, extract);
    } else if (snapshotPath.endsWith('.zip')) {
      // For zip files, we'll use the decompress library but with streaming options
      progress.updateStatus(`Extracting zip archive...`);

      // Use decompress with progress tracking
      await decompress(snapshotPath, projectDir, {
        filter: () => true,
        map: (file: any) => {
          processedBytes += file.data.length;
          const percent = Math.min(99, Math.round((processedBytes / totalSize) * 100));
          progress.updateStatus(`Extracting: ${percent}% (${fsUtils.formatSize(processedBytes)})`);
          return file;
        }
      });
    } else {
      // For other formats, fall back to decompress
      progress.updateStatus(`Extracting with decompress...`);
      await decompress(snapshotPath, projectDir);
    }
  }

  /**
   * Check if a snapshot exists and is valid
   * @param projectDir The project directory
   * @param dependencies The current dependency tree
   * @param snapshotPath Optional custom snapshot path
   * @returns True if a valid snapshot exists
   */
  async isValid(
    projectDir: string,
    dependencies: Record<string, string>,
    snapshotPath?: string
  ): Promise<boolean> {
    const flashpackPath = snapshotPath || this.getSnapshotPath(projectDir);

    // Check if snapshot exists
    if (!await fsUtils.fileExists(flashpackPath)) {
      return false;
    }

    try {
      // Get metadata using streaming extraction
      const metadata = await this.getMetadata(flashpackPath);

      if (!metadata) {
        return false;
      }

      // Check if fingerprint exists
      if (metadata.fingerprint) {
        // Verify fingerprint
        const lockfilePath = getLockfilePath(projectDir);
        const result = await verifySnapshotFingerprint(
          metadata.fingerprint,
          dependencies,
          lockfilePath
        );

        if (!result.valid) {
          logger.debug(`Snapshot invalid: ${result.reason}`);
          return false;
        }

        return true;
      } else {
        // Fall back to legacy validation
        // Compare dependency trees
        const currentHash = hashDependencyTree(dependencies);
        const snapshotHash = hashDependencyTree(metadata.dependencies);

        return currentHash === snapshotHash;
      }
    } catch (error) {
      logger.debug(`Failed to validate snapshot: ${error}`);
      return false;
    }
  }

  /**
   * Get metadata from a snapshot using streaming extraction
   * @param snapshotPath The snapshot path
   * @returns The snapshot metadata
   */
  async getMetadata(snapshotPath: string): Promise<any> {
    try {
      // Check for separate metadata file first (new format)
      const projectDir = path.dirname(snapshotPath);
      const metadataPath = path.join(projectDir, '.flashpack-metadata.json');
      
      if (await fsUtils.fileExists(metadataPath)) {
        return await fs.readJSON(metadataPath);
      }

      // Fall back to extracting from archive (old format)
      // Check file format
      const isTarGz = snapshotPath.endsWith('.tar.gz') || snapshotPath.endsWith('.tgz');
      const isZip = snapshotPath.endsWith('.zip');

      // Use streaming extraction for tar.gz files
      if (isTarGz) {
        return await this.getMetadataFromTarGz(snapshotPath);
      }
      // For other formats, fall back to decompress
      else {
        // Extract metadata only
        const files = await decompress(snapshotPath, undefined, {
          filter: file => file.path === '.flashpack-metadata.json'
        });

        if (files.length === 0) {
          throw new Error('No metadata found in snapshot');
        }

        // Parse metadata
        return JSON.parse(files[0].data.toString());
      }
    } catch (error) {
      logger.error(`Failed to get snapshot metadata: ${error}`);
      throw error;
    }
  }

  /**
   * Get metadata from a tar.gz snapshot using streaming extraction
   * @param snapshotPath The snapshot path
   * @returns The snapshot metadata
   */
  private async getMetadataFromTarGz(snapshotPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Create read stream for the snapshot
      const readStream = createReadStream(snapshotPath);

      // Create gunzip stream
      const gunzip = zlib.createGunzip();

      // Create tar extract stream
      const extract = new TarExtract();

      // Track if metadata was found
      let metadataFound = false;

      // Handle extracted entries
      extract.on('entry', (header: any, stream: NodeJS.ReadableStream, next: () => void) => {
        // Check if this is the metadata file
        if (header.name === '.flashpack-metadata.json') {
          metadataFound = true;

          // Collect data chunks
          const chunks: Buffer[] = [];

          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          stream.on('end', () => {
            try {
              // Combine chunks and parse JSON
              const data = Buffer.concat(chunks);
              const metadata = JSON.parse(data.toString());

              // End extraction early since we found what we needed
              readStream.destroy();
              gunzip.destroy();
              extract.destroy();

              resolve(metadata);
            } catch (error) {
              reject(error);
            }
          });
        } else {
          // Skip other files
          stream.resume();
        }

        next();
      });

      // Handle extraction completion
      extract.on('finish', () => {
        if (!metadataFound) {
          reject(new Error('No metadata found in snapshot'));
        }
      });

      // Handle errors
      readStream.on('error', reject);
      gunzip.on('error', reject);
      extract.on('error', reject);

      // Pipe streams together
      readStream.pipe(gunzip).pipe(extract);
    });
  }
}

// Export a default snapshot instance
export const snapshot = new Snapshot();
