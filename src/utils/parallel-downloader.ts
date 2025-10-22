/**
 * Optimized network operations and parallel download manager for Flash Install
 * Implements parallel downloads with rate limiting and connection pooling
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from './logger.js';
import { Timer, createTimer } from './timer.js';
import { WorkerPool } from './worker-pool.js';
import { networkManager } from './network.js';
import { FlashError, ErrorHandler, ErrorCategory, RecoveryStrategy } from './error-handler.js';

/**
 * Download options
 */
export interface DownloadOptions {
  /** Maximum number of concurrent downloads */
  concurrency?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Registry URL */
  registry?: string;
  /** User agent string */
  userAgent?: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Progress callback */
  onProgress?: (downloaded: number, total: number, url: string) => void;
  /** Connection pool size */
  connectionPoolSize?: number;
}

/**
 * Default download options
 */
const defaultOptions: DownloadOptions = {
  concurrency: 8,
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  userAgent: 'Flash-Install/2.0',
  connectionPoolSize: 20
};

/**
 * Download result
 */
export interface DownloadResult {
  /** Whether the download was successful */
  success: boolean;
  /** Downloaded file path */
  filePath?: string;
  /** Download size in bytes */
  size?: number;
  /** Download duration in milliseconds */
  duration?: number;
  /** Error information if any */
  error?: string;
  /** URL that was downloaded */
  url: string;
}

/**
 * Parallel download manager
 */
export class ParallelDownloadManager {
  private options: DownloadOptions;
  private activeDownloads: Map<string, Timer>;
  private downloadQueue: Array<{
    url: string;
    outputDir: string;
    filename?: string;
    resolve: (value: DownloadResult) => void;
    reject: (reason: any) => void;
  }>;
  private isProcessing: boolean;
  private workerPool?: WorkerPool<unknown, unknown>;
  private agent: https.Agent; // Connection pooling agent

  /**
   * Create a new parallel download manager
   * @param options Download options
   */
  constructor(options: DownloadOptions = {}) {
    this.options = { ...defaultOptions, ...options };
    this.activeDownloads = new Map();
    this.downloadQueue = [];
    this.isProcessing = false;
    
    // Worker pool initialization is not needed as we handle concurrency through downloadQueue and processQueue
    
    // Initialize HTTP agent with connection pooling
    this.agent = new https.Agent({
      keepAlive: true,
      maxSockets: this.options.connectionPoolSize,
      timeout: this.options.timeout,
    });
  }

  /**
   * Download a single file with retry logic
   * @param url URL to download
   * @param outputDir Output directory
   * @param filename Optional filename (will be extracted from URL if not provided)
   * @returns Download result
   */
  async download(url: string, outputDir: string, filename?: string): Promise<DownloadResult> {
    // Create a promise to handle the download
    return new Promise<DownloadResult>((resolve, reject) => {
      // Add to queue
      this.downloadQueue.push({
        url,
        outputDir,
        filename,
        resolve,
        reject
      });

      // Start processing if not already processing
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Download multiple files in parallel
   * @param downloads Array of download specifications
   * @returns Array of download results
   */
  async downloadMultiple(
    downloads: Array<{ url: string; outputDir: string; filename?: string }>
  ): Promise<DownloadResult[]> {
    const promises = downloads.map(download => 
      this.download(download.url, download.outputDir, download.filename)
    );
    
    return Promise.all(promises);
  }

  /**
   * Process the download queue
   */
  private async processQueue(): Promise<void> {
    if (this.downloadQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    // Process downloads in batches based on concurrency
    const batch = this.downloadQueue.splice(0, this.options.concurrency || 8);
    
    // Execute batch downloads
    const batchPromises = batch.map(job => this.executeDownload(job));
    
    // Wait for batch to complete
    await Promise.allSettled(batchPromises);
    
    // Process remaining items in queue
    await this.processQueue();
  }

  /**
   * Execute a single download job
   * @param job Download job specification
   */
  private async executeDownload(
    job: {
      url: string;
      outputDir: string;
      filename?: string;
      resolve: (value: DownloadResult) => void;
      reject: (reason: any) => void;
    }
  ): Promise<void> {
    const { url, outputDir, filename, resolve } = job;
    let tries = 0;
    const maxRetries = this.options.retries || 3;

    // Start timer for this download
    const timer = createTimer();
    
    while (tries <= maxRetries) {
      try {
        const result = await this.performDownload(url, outputDir, timer, filename);
        resolve(result);
        return; // Success, exit retry loop
      } catch (error) {
        tries++;
        
        if (tries > maxRetries) {
          // All retries exhausted
          const result: DownloadResult = {
            success: false,
            url,
            error: error instanceof Error ? error.message : String(error),
            duration: timer.getElapsedMs()
          };
          resolve(result);
          return;
        }
        
        // Wait before retrying
        logger.warn(`Download failed for ${url}, attempt ${tries}/${maxRetries}. Retrying in ${this.options.retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
      }
    }
  }

  /**
   * Perform the actual download
   * @param url URL to download
   * @param outputDir Output directory
   * @param filename Optional filename
   * @param timer Timer for tracking duration
   * @returns Download result
   */
  private async performDownload(
    url: string,
    outputDir: string,
    timer: Timer,
    filename?: string
  ): Promise<DownloadResult> {
    // Extract filename from URL if not provided
    if (!filename) {
      const parsedUrl = new URL(url);
      filename = path.basename(parsedUrl.pathname);
    }

    // Create output directory if it doesn't exist
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Create output file path
    const filePath = path.join(outputDir, filename);

    // Make HTTP request
    const parsedUrl = new URL(url);
    
    const requestOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': this.options.userAgent,
        ...this.options.headers,
      },
      timeout: this.options.timeout,
      agent: this.agent // Use connection pooling agent
    };

    return new Promise<DownloadResult>((resolve, reject) => {
      const request = https.request(requestOptions, (response) => {
        // Check response status
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        // Create write stream
        const fileStream = createWriteStream(filePath);

        // Track download progress
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          
          // Call progress callback if provided
          if (this.options.onProgress) {
            this.options.onProgress(downloadedBytes, totalBytes, url);
          }
        });

        // Pipe response to file
        pipeline(response, fileStream)
          .then(() => {
            // Download complete
            const duration = timer.getElapsedMs();
            const result: DownloadResult = {
              success: true,
              filePath,
              size: downloadedBytes,
              duration,
              url
            };
            resolve(result);
          })
          .catch((error) => {
            reject(error);
          });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });

      request.end();
    });
  }

  /**
   * Get the number of active downloads
   * @returns Number of active downloads
   */
  getActiveDownloadCount(): number {
    return this.activeDownloads.size;
  }

  /**
   * Get the number of queued downloads
   * @returns Number of queued downloads
   */
  getQueuedDownloadCount(): number {
    return this.downloadQueue.length;
  }

  /**
   * Cancel all pending downloads
   */
  cancelAll(): void {
    // Clear the queue
    const queued = this.downloadQueue.splice(0);
    
    // Reject all queued downloads
    for (const job of queued) {
      const result: DownloadResult = {
        success: false,
        url: job.url,
        error: 'Download cancelled'
      };
      job.resolve(result);
    }
  }

  /**
   * Destroy the download manager and clean up resources
   */
  destroy(): void {
    this.cancelAll();
    this.agent.destroy();
  }
}

/**
 * Enhanced package downloader with parallel capabilities
 */
export class PackageDownloader {
  private downloadManager: ParallelDownloadManager;

  /**
   * Create a new package downloader
   * @param options Download options
   */
  constructor(options: DownloadOptions = {}) {
    this.downloadManager = new ParallelDownloadManager(options);
  }

  /**
   * Download package tarballs in parallel
   * @param packages Array of package metadata
   * @param outputDir Output directory for tarballs
   * @returns Array of download results
   */
  async downloadPackages(
    packages: Array<{ name: string; version: string; registry?: string }>,
    outputDir: string
  ): Promise<DownloadResult[]> {
    // Prepare download specifications
    const downloads = packages.map(pkg => {
      const registryUrl = pkg.registry || this.downloadManager['options'].registry || 'https://registry.npmjs.org';
      const url = `${registryUrl}/${encodeURIComponent(pkg.name)}/-/${pkg.name}-${pkg.version}.tgz`;
      const filename = `${pkg.name}-${pkg.version}.tgz`;
      
      return {
        url,
        outputDir,
        filename
      };
    });

    // Log download attempt
    logger.info(`Starting download of ${downloads.length} packages with ${this.downloadManager['options'].concurrency} concurrent downloads`);

    // Perform parallel downloads
    const results = await this.downloadManager.downloadMultiple(downloads);
    
    // Count successes and failures
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;
    
    logger.success(`Download completed: ${successes} successful, ${failures} failed`);
    
    return results;
  }

  /**
   * Download a single package tarball
   * @param name Package name
   * @param version Package version
   * @param outputDir Output directory
   * @param registry Optional registry URL
   * @returns Download result
   */
  async downloadPackage(
    name: string,
    version: string,
    outputDir: string,
    registry?: string
  ): Promise<DownloadResult> {
    const registryUrl = registry || this.downloadManager['options'].registry || 'https://registry.npmjs.org';
    const url = `${registryUrl}/${encodeURIComponent(name)}/-/${name}-${version}.tgz`;
    const filename = `${name}-${version}.tgz`;
    
    logger.info(`Downloading ${name}@${version}...`);
    
    return await this.downloadManager.download(url, outputDir, filename);
  }

  /**
   * Destroy the package downloader and clean up resources
   */
  destroy(): void {
    this.downloadManager.destroy();
  }
}

// Export singleton instance with default configuration
export const packageDownloader = new PackageDownloader({
  concurrency: 8,  // Balance between performance and registry load
  timeout: 30000,
  retries: 3,
  retryDelay: 1000
});