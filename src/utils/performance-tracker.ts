/**
 * Performance measurement and tracking for Flash Install
 * Provides comprehensive performance metrics and analytics
 */

import fs from 'fs';
import * as os from 'os';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from './logger.js';
import { Timer, createTimer } from './timer.js';
import { PackageManager } from '../install.js';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  /** Installation ID */
  id: string;
  /** Timestamp of the measurement */
  timestamp: number;
  /** Package manager used */
  packageManager: PackageManager;
  /** Number of packages installed */
  packageCount: number;
  /** Total installation time in milliseconds */
  totalTimeMs: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  /** Network operations count */
  networkOperations: number;
  /** Network time in milliseconds */
  networkTimeMs: number;
  /** Cache operations count */
  cacheOperations: number;
  /** Cache time in milliseconds */
  cacheTimeMs: number;
  /** CPU usage percentage */
  cpuUsage: number;
  /** Memory usage in MB */
  memoryUsage: number;
  /** Peak memory usage in MB */
  peakMemoryUsage: number;
  /** Whether the installation was successful */
  success: boolean;
  /** Error message if installation failed */
  error?: string;
  /** Environment information */
  environment: {
    os: string;
    nodeVersion: string;
    systemMemory: number;
    cpuCores: number;
  };
}

/**
 * Performance tracker configuration
 */
export interface PerformanceTrackerConfig {
  /** Whether to enable performance tracking */
  enabled: boolean;
  /** Output directory for metrics files */
  outputDir?: string;
  /** Whether to log performance metrics to console */
  logToConsole: boolean;
  /** Maximum number of metrics to keep in memory */
  maxMetrics: number;
  /** Whether to track detailed metrics */
  trackDetailed: boolean;
}

/**
 * Default performance tracker configuration
 */
const defaultConfig: PerformanceTrackerConfig = {
  enabled: true,
  outputDir: os.homedir() + '/.flash-install/metrics',
  logToConsole: false,
  maxMetrics: 100,
  trackDetailed: true
};

/**
 * Performance tracker class
 */
export class PerformanceTracker {
  private config: PerformanceTrackerConfig;
  private metrics: PerformanceMetrics[] = [];
  private performanceTimers: Map<string, Timer> = new Map();
  private installationStats: {
    totalInstallations: number;
    successfulInstallations: number;
    failedInstallations: number;
    totalInstallTime: number; // in ms
    totalPackages: number;
  } = {
    totalInstallations: 0,
    successfulInstallations: 0,
    failedInstallations: 0,
    totalInstallTime: 0,
    totalPackages: 0
  };

  /**
   * Create a new performance tracker
   * @param config Performance tracker configuration
   */
  constructor(config: Partial<PerformanceTrackerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    
    // Ensure output directory exists
    if (this.config.outputDir) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  /**
   * Track an installation event
   * @param packageManager Package manager used
   * @param packageCount Number of packages installed
   * @param totalTimeMs Total installation time in milliseconds
   * @param cacheHitRate Cache hit rate (0-1)
   * @param success Whether the installation was successful
   * @param error Error message if installation failed
   */
  trackInstallation(
    packageManager: PackageManager,
    packageCount: number,
    totalTimeMs: number,
    cacheHitRate: number,
    success: boolean,
    error?: string
  ): void {
    if (!this.config.enabled) return;

    // Get current memory usage
    const memoryInfo = process.memoryUsage();
    const currentMemoryMB = Math.round(memoryInfo.heapUsed / 1024 / 1024);
    const peakMemoryMB = Math.round(memoryInfo.heapTotal / 1024 / 1024);

    // Create metrics object
    const metrics: PerformanceMetrics = {
      id: this.generateId(),
      timestamp: Date.now(),
      packageManager,
      packageCount,
      totalTimeMs,
      cacheHitRate,
      networkOperations: 0, // These would be updated as needed
      networkTimeMs: 0,
      cacheOperations: 0,
      cacheTimeMs: 0,
      cpuUsage: 0, // This would need to be calculated
      memoryUsage: currentMemoryMB,
      peakMemoryUsage: peakMemoryMB,
      success,
      error,
      environment: {
        os: process.platform,
        nodeVersion: process.version,
        systemMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024), // in GB
        cpuCores: os.cpus().length
      }
    };

    // Add to metrics collection
    this.metrics.push(metrics);
    
    // Maintain max metrics count
    if (this.metrics.length > this.config.maxMetrics) {
      this.metrics.shift();
    }

    // Update installation stats
    this.installationStats.totalInstallations++;
    if (success) {
      this.installationStats.successfulInstallations++;
    } else {
      this.installationStats.failedInstallations++;
    }
    this.installationStats.totalInstallTime += totalTimeMs;
    this.installationStats.totalPackages += packageCount;

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logMetrics(metrics);
    }

    // Save metrics to file if output directory is specified
    if (this.config.outputDir) {
      this.saveMetricsToFile(metrics);
    }
  }

  /**
   * Start tracking a specific operation
   * @param operationName Name of the operation to track
   */
  startOperation(operationName: string): void {
    if (!this.config.enabled) return;
    
    const timer = createTimer();
    timer.start();
    this.performanceTimers.set(operationName, timer);
  }

  /**
   * End tracking a specific operation
   * @param operationName Name of the operation to end tracking
   * @param operationType Type of operation (used for categorization)
   * @returns Duration in milliseconds
   */
  endOperation(operationName: string, operationType: 'network' | 'cache' | 'fs' | 'cpu' = 'cpu'): number {
    if (!this.config.enabled) return 0;
    
    const timer = this.performanceTimers.get(operationName);
    if (!timer) {
      logger.warn(`No timer found for operation: ${operationName}`);
      return 0;
    }

    timer.stop();
    const duration = timer.getElapsedMs();
    
    // Update metrics based on operation type
    if (operationType === 'network') {
      this.updateLastMetrics('networkOperations', 1);
      this.updateLastMetrics('networkTimeMs', duration);
    } else if (operationType === 'cache') {
      this.updateLastMetrics('cacheOperations', 1);
      this.updateLastMetrics('cacheTimeMs', duration);
    }
    
    this.performanceTimers.delete(operationName);
    return duration;
  }

  /**
   * Update the last metrics with a specific value
   */
  private updateLastMetrics<T extends keyof PerformanceMetrics>(key: T, value: PerformanceMetrics[T] | ((current: PerformanceMetrics[T]) => PerformanceMetrics[T])): void {
    if (this.metrics.length === 0) return;
    
    const lastMetric = this.metrics[this.metrics.length - 1];
    
    if (typeof value === 'function') {
      lastMetric[key] = value(lastMetric[key]);
    } else {
      if (typeof lastMetric[key] === 'number' && typeof value === 'number') {
        lastMetric[key] = (lastMetric[key] as number + value as number) as PerformanceMetrics[T];
      } else {
        lastMetric[key] = value;
      }
    }
  }

  /**
   * Calculate CPU usage percentage
   * @returns CPU usage percentage
   */
  calculateCpuUsage(): number {
    if (typeof process.cpuUsage !== 'function') return 0; // Not available on all platforms
    
    // Get start CPU usage
    const startUsage = process.cpuUsage();
    // Wait for a short time to calculate
    const start = Date.now();
    while (Date.now() - start < 100); // Wait 100ms
    // Get end CPU usage
    const endUsage = process.cpuUsage();
    
    // Calculate usage percentage
    const elapsedReal = (Date.now() - start) * 1000; // in microseconds
    const elapsedUser = endUsage.user - startUsage.user;
    const elapsedSystem = endUsage.system - startUsage.system;
    
    return Math.min(100, Math.round(((elapsedUser + elapsedSystem) / elapsedReal) * 100));
  }

  /**
   * Get current performance statistics
   * @returns Performance statistics
   */
  getStats(): typeof this.installationStats {
    return { ...this.installationStats };
  }

  /**
   * Get all collected metrics
   * @returns Array of performance metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Calculate average installation time
   * @returns Average installation time in milliseconds
   */
  getAverageInstallationTime(): number {
    if (this.installationStats.totalInstallations === 0) return 0;
    return this.installationStats.totalInstallTime / this.installationStats.totalInstallations;
  }

  /**
   * Calculate success rate
   * @returns Success rate as a percentage (0-100)
   */
  getSuccessRate(): number {
    if (this.installationStats.totalInstallations === 0) return 0;
    return (this.installationStats.successfulInstallations / this.installationStats.totalInstallations) * 100;
  }

  /**
   * Generate a unique ID for the metrics
   * @returns Unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log metrics to console
   * @param metrics Performance metrics to log
   */
  private logMetrics(metrics: PerformanceMetrics): void {
    logger.debug(`Performance Metrics: ID=${metrics.id}, Time=${metrics.totalTimeMs}ms, Packages=${metrics.packageCount}, CacheHitRate=${Math.round(metrics.cacheHitRate * 100)}%`);
  }

  /**
   * Save metrics to a file
   * @param metrics Performance metrics to save
   */
  private saveMetricsToFile(metrics: PerformanceMetrics): void {
    try {
      const fileName = `metrics-${new Date().toISOString().split('T')[0]}.json`;
      const filePath = `${this.config.outputDir}/${fileName}`;
      
      const existingData: PerformanceMetrics[] = [];
      
      // Read existing data if file exists
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        existingData.push(...JSON.parse(fileContent));
      }
      
      // Add new metrics
      existingData.push(metrics);
      
      // Write updated data back to file
      fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
    } catch (error) {
      logger.warn(`Failed to save metrics to file: ${error}`);
    }
  }

  /**
   * Export performance report
   * @param format Output format ('json' or 'csv')
   * @returns Performance report as string
   */
  exportReport(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        meta: {
          generated: new Date().toISOString(),
          totalMetrics: this.metrics.length
        },
        stats: this.installationStats,
        metrics: this.metrics
      }, null, 2);
    } else if (format === 'csv') {
      // Create CSV header
      let csv = 'id,timestamp,packageManager,packageCount,totalTimeMs,cacheHitRate,networkOperations,networkTimeMs,cacheOperations,cacheTimeMs,cpuUsage,memoryUsage,peakMemoryUsage,success,error\n';
      
      // Add each metric as a row
      for (const metric of this.metrics) {
        csv += [
          metric.id,
          metric.timestamp,
          metric.packageManager,
          metric.packageCount,
          metric.totalTimeMs,
          metric.cacheHitRate,
          metric.networkOperations,
          metric.networkTimeMs,
          metric.cacheOperations,
          metric.cacheTimeMs,
          metric.cpuUsage,
          metric.memoryUsage,
          metric.peakMemoryUsage,
          metric.success,
          metric.error || ''
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',') + '\n';
      }
      
      return csv;
    }
    
    throw new Error('Invalid export format. Use "json" or "csv".');
  }

  /**
   * Reset all collected metrics
   */
  reset(): void {
    this.metrics = [];
    this.installationStats = {
      totalInstallations: 0,
      successfulInstallations: 0,
      failedInstallations: 0,
      totalInstallTime: 0,
      totalPackages: 0
    };
    this.performanceTimers.clear();
  }
}

/**
 * Global performance tracker instance
 */
export const performanceTracker = new PerformanceTracker();

/**
 * Performance measurement decorator
 * Use this to automatically measure the performance of async functions
 */
export function measurePerformance<T extends (...args: any[]) => Promise<any>>(
  target: Object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>
): TypedPropertyDescriptor<T> {
  const originalMethod = descriptor.value;
  
  if (!originalMethod) {
    throw new Error('measurePerformance can only be used on methods with implementation');
  }

  descriptor.value = async function(this: any, ...args: any[]) {
    const operationName = `${String(propertyKey)}_${Date.now()}`;
    
    // Start timing
    performanceTracker.startOperation(operationName);
    
    try {
      // Execute the original method
      const result = await originalMethod.apply(this, args);
      
      // End timing and return result
      performanceTracker.endOperation(operationName as string);
      return result;
    } catch (error) {
      // End timing and rethrow error
      performanceTracker.endOperation(operationName as string);
      throw error;
    }
  } as T;

  return descriptor;
}