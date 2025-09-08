import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';

interface DownloadRequest {
  url: string;
  destination: string;
  timeout?: number;
  retries?: number;
}

interface NetworkConfig {
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  concurrentDownloads: number;
  offlineMode: boolean;
  mirrorUrls: string[];
}

export class NetworkAdapter extends EventEmitter {
  private config: NetworkConfig;
  private downloadQueue: DownloadRequest[] = [];
  private activeDownloads = 0;
  private offlineCache: Map<string, string> = new Map();

  constructor(config: Partial<NetworkConfig> = {}) {
    super();

    // Default network configuration for maximum performance
    this.config = {
      timeout: 15000, // 15 seconds
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      concurrentDownloads: 16, // Increased from 8
      offlineMode: false,
      mirrorUrls: [
        'https://registry.npmjs.org',
        'https://registry.yarnpkg.com',
        'https://npm.pkg.github.com',
        'https://cdn.jsdelivr.net/npm'
      ],
      ...config
    };

    this.loadOfflineCache();
  }

  /**
   * Enhanced download with multiple endpoints, retry logic, and offline fallback
   */
  async downloadWithFallback(req: DownloadRequest): Promise<boolean> {
    const { url, destination, timeout = this.config.timeout } = req;

    // Check offline cache first for extreme speed
    const cachedPath = this.offlineCache.get(url);
    if (cachedPath && this.config.offlineMode) {
      try {
        await fs.copyFile(cachedPath, destination);
        this.emit('cache-hit', { url, destination, speed: 'instant' });
        return true;
      } catch (error) {
        console.warn(`⚠ Offline cache corrupted for ${url}, falling back to network`);
      }
    }

    // Try multiple endpoints with intelligent retry
    const packageName = this.extractPackageName(url);

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      for (const mirror of this.config.mirrorUrls) {
        try {
          const mirrorUrl = url.replace('https://registry.npmjs.org', mirror);

          const success = await this.tryDownload(mirrorUrl, destination, timeout);
          if (success) {
            this.emit('download-success', { url, mirror, attempt, destination });

            // Cache for offline use
            if (!this.config.offlineMode) {
              await this.cacheForOffline(url, destination);
            }
            return true;
          }
        } catch (error) {
          this.emit('download-failed', {
            url,
            mirror,
            attempt,
            error: error instanceof Error ? error.message : String(error),
            willRetry: attempt < this.config.maxRetries
          });
        }
      }

      // Exponential backoff for retries
      if (attempt < this.config.maxRetries) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // If all network attempts fail, try offline cache as last resort
    if (cachedPath) {
      try {
        await fs.copyFile(cachedPath, destination);
        this.emit('offline-fallback-used', { url, destination });
        return true;
      } catch (error) {
        console.error(`❌ All download methods failed for ${url}`);
      }
    }

    return false;
  }

  /**
   * Parallel download queue with intelligent throttling
   */
  async downloadParallel(requests: DownloadRequest[]): Promise<boolean[]> {
    this.downloadQueue = [...requests];
    const results: boolean[] = new Array(requests.length).fill(false);

    return new Promise((resolve) => {
      let completed = 0;

      const processQueue = async () => {
        while (this.downloadQueue.length > 0 && this.activeDownloads < this.config.concurrentDownloads) {
          const request = this.downloadQueue.shift();
          if (!request) break;

          this.activeDownloads++;
          const index = requests.indexOf(request);

          try {
            const success = await this.downloadWithFallback(request);
            results[index] = success;
          } catch (error) {
            results[index] = false;
            console.error(`❌ Parallel download failed: ${error instanceof Error ? error.message : String(error)}`);
          }

          this.activeDownloads--;
          completed++;

          if (completed >= requests.length) {
            resolve(results);
            return;
          }
        }

        // Continue processing if we still have capacity
        if (this.activeDownloads < this.config.concurrentDownloads && this.downloadQueue.length > 0) {
          setImmediate(processQueue);
        }
      };

      // Start initial batch
      for (let i = 0; i < Math.min(this.config.concurrentDownloads, requests.length); i++) {
        processQueue();
      }
    });
  }

  /**
   * Pre-cache frequently used packages for instant installs
   */
  async preloadCommonPackages(packages: string[]): Promise<void> {
    this.emit('preload-start', { packages: packages.length });

    const requests = packages.map(pkg => ({
      url: `https://registry.npmjs.org/${pkg}/latest`,
      destination: path.join(this.getCacheDir(), `${pkg}.cache`),
      timeout: this.config.timeout
    }));

    const results = await this.downloadParallel(requests);
    const successCount = results.filter(Boolean).length;

    this.emit('preload-complete', {
      total: packages.length,
      successful: successCount,
      duration: Date.now()
    });
  }

  private async tryDownload(url: string, destination: string, timeout: number): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Use system curl for maximum speed if available
      if (this.hasSystemCurl()) {
        execSync(`curl -L --silent --max-time 30 "${url}" -o "${destination}"`, {
          timeout,
          stdio: 'pipe'
        });
      } else {
        // Fallback to Node.js fetch with proxy detection
        const response = await fetch(url, {
          signal: AbortSignal.timeout(timeout)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const buffer = await response.arrayBuffer();
        await fs.writeFile(destination, Buffer.from(buffer));
      }

      const duration = Date.now() - startTime;
      this.emit('download-complete', { url, destination, duration, size: await this.getFileSize(destination) });
      return true;

    } catch (error) {
      throw new Error(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async cacheForOffline(url: string, sourcePath: string): Promise<void> {
    try {
      const cachePath = path.join(this.getCacheDir(), `${Date.now()}-${path.basename(sourcePath)}`);
      await fs.copyFile(sourcePath, cachePath);
      this.offlineCache.set(url, cachePath);

      // Save cache index
      await fs.writeFile(
        path.join(this.getCacheDir(), 'index.json'),
        JSON.stringify(Object.fromEntries(this.offlineCache), null, 2)
      );
    } catch (error) {
      console.warn(`⚠ Failed to cache ${url} for offline use`);
    }
  }

  private async loadOfflineCache(): Promise<void> {
    try {
      const indexPath = path.join(this.getCacheDir(), 'index.json');
      const indexData = await fs.readFile(indexPath, 'utf8');
      this.offlineCache = new Map(Object.entries(JSON.parse(indexData)));
    } catch (error) {
      // Cache doesn't exist yet, that's fine
    }
  }

  private getCacheDir(): string {
    return path.join(process.cwd(), '.flash-cache');
  }

  private extractPackageName(url: string): string {
    const match = url.match(/\/([^\/]+)(?:\/latest)?$/);
    return match ? match[1] : 'unknown';
  }

  private hasSystemCurl(): boolean {
    try {
      execSync('curl --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API methods
  enableOfflineMode(): void {
    this.config.offlineMode = true;
    this.emit('offline-mode-enabled');
  }

  setConcurrentDownloads(count: number): void {
    this.config.concurrentDownloads = Math.max(1, Math.min(count, 32));
  }

  addMirror(url: string): void {
    if (!this.config.mirrorUrls.includes(url)) {
      this.config.mirrorUrls.push(url);
    }
  }
}

export default NetworkAdapter;