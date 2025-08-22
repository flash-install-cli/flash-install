/**
 * Flash Install Vercel Integration Plugin
 * 
 * This plugin integrates flash-install with Vercel's build environment
 * to provide faster dependency installation in Vercel deployments.
 */

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

class FlashInstallVercelPlugin {
  constructor() {
    this.name = 'flash-install-vercel-plugin';
    this.version = '1.0.0';
  }

  /**
   * Setup the plugin with Vercel utils
   */
  setup({ utils }) {
    this.utils = utils;
    
    return {
      beforeInstall: this.beforeInstall.bind(this),
      afterInstall: this.afterInstall.bind(this),
      beforeBuild: this.beforeBuild.bind(this),
      afterBuild: this.afterBuild.bind(this)
    };
  }

  /**
   * Hook that runs before package installation
   */
  async beforeInstall({ workPath, installCommand, meta, utils }) {
    this.utils.log.info('🚀 Flash Install Vercel Plugin: Starting optimized installation');
    
    const settings = meta?.settings || {};
    const {
      enableCache = true,
      cacheCompression = true,
      concurrency = 4,
      fallbackToNpm = true
    } = settings;

    // Check if flash-install is available
    const flashInstallPath = this.findFlashInstallPath(workPath);
    
    if (!flashInstallPath && fallbackToNpm) {
      this.utils.log.warn('⚠️  Flash Install not found, falling back to npm');
      return { shouldContinue: true };
    }

    if (!flashInstallPath) {
      throw new Error('Flash Install not found and fallback disabled');
    }

    // Check for existing snapshots
    const snapshotPath = path.join(workPath, '.flashpack');
    if (fs.existsSync(snapshotPath)) {
      this.utils.log.info('📦 Found existing snapshot, attempting fast restore');
      
      try {
        // Use flash-install restore command
        const restoreCommand = `"${flashInstallPath}" restore`;
        utils.runCommand(restoreCommand, { cwd: workPath });
        
        this.utils.log.success('✅ Successfully restored from snapshot');
        return { shouldContinue: false, skipInstall: true };
      } catch (error) {
        this.utils.log.warn('⚠️  Snapshot restore failed, proceeding with normal install');
      }
    }

    // Configure flash-install options
    let flashCommand = `"${flashInstallPath}" install`;
    
    if (enableCache) {
      flashCommand += ' --cache';
    }
    
    if (cacheCompression) {
      flashCommand += ' --compress';
    }
    
    if (concurrency > 1) {
      flashCommand += ` --concurrency ${concurrency}`;
    }

    this.utils.log.info(`🔧 Using flash-install command: ${flashCommand}`);
    
    // Replace the install command
    return {
      shouldContinue: true,
      installCommand: flashCommand
    };
  }

  /**
   * Hook that runs after package installation
   */
  async afterInstall({ workPath, utils }) {
    this.utils.log.info('📦 Flash Install Vercel Plugin: Post-installation cleanup');
    
    // Create snapshot for future builds
    const flashInstallPath = this.findFlashInstallPath(workPath);
    
    if (flashInstallPath) {
      try {
        const snapshotCommand = `"${flashInstallPath}" snapshot`;
        utils.runCommand(snapshotCommand, { cwd: workPath });
        this.utils.log.success('✅ Created snapshot for future builds');
      } catch (error) {
        this.utils.log.warn('⚠️  Failed to create snapshot:', error.message);
      }
    }
  }

  /**
   * Hook that runs before build
   */
  async beforeBuild({ workPath, utils }) {
    this.utils.log.info('🏗️  Flash Install Vercel Plugin: Pre-build optimization');
    
    // Verify node_modules integrity
    const nodeModulesPath = path.join(workPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      this.utils.log.warn('⚠️  node_modules not found, dependencies may not be installed');
    } else {
      this.utils.log.success('✅ node_modules verified');
    }
  }

  /**
   * Hook that runs after build
   */
  async afterBuild({ workPath, utils }) {
    this.utils.log.info('📊 Flash Install Vercel Plugin: Build completed');
    
    // Log cache statistics if available
    const cacheStatsPath = path.join(workPath, '.flash-cache-stats.json');
    if (fs.existsSync(cacheStatsPath)) {
      try {
        const stats = JSON.parse(fs.readFileSync(cacheStatsPath, 'utf8'));
        this.utils.log.info(`📈 Cache hit rate: ${stats.hitRate || 'N/A'}`);
        this.utils.log.info(`⚡ Time saved: ${stats.timeSaved || 'N/A'}`);
      } catch (error) {
        this.utils.log.warn('⚠️  Could not read cache statistics');
      }
    }
  }

  /**
   * Find flash-install executable path
   */
  findFlashInstallPath(workPath) {
    // Check common locations
    const possiblePaths = [
      path.join(workPath, 'node_modules/.bin/flash-install'),
      path.join(workPath, 'node_modules/.bin/flash'),
      '/usr/local/bin/flash-install',
      '/usr/local/bin/flash'
    ];

    for (const flashPath of possiblePaths) {
      if (fs.existsSync(flashPath)) {
        return flashPath;
      }
    }

    // Try which/where command
    try {
      const result = execSync('which flash-install || where flash-install', { 
        encoding: 'utf8', 
        stdio: 'pipe' 
      });
      return result.trim();
    } catch (error) {
      // Command not found
    }

    return null;
  }
}

// Export the plugin
export default new FlashInstallVercelPlugin();