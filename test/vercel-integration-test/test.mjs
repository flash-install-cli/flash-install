/**
 * Test script for flash-install Vercel integration
 * 
 * This script simulates the Vercel build environment and tests the flash-install plugin.
 */

// Use ES modules
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file path in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock Vercel utils
const mockUtils = {
  log: {
    info: (message) => console.log(`[INFO] ${message}`),
    success: (message) => console.log(`[SUCCESS] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`),
    warn: (message) => console.warn(`[WARNING] ${message}`)
  },
  runCommand: (command, options) => {
    console.log(`[COMMAND] ${command}`);
    return execSync(command, {
      ...options,
      stdio: 'inherit'
    });
  }
};

// Import the plugin
const pluginPath = path.resolve(__dirname, '../../integrations/vercel/flash-install-vercel-plugin.js');
if (!fs.existsSync(pluginPath)) {
  console.error(`Plugin not found at ${pluginPath}`);
  process.exit(1);
}

// Test the plugin
async function testPlugin() {
  console.log('Testing flash-install Vercel plugin...');
  
  try {
    // Import the plugin dynamically
    const pluginModule = await import(`file:///${pluginPath.replace(/\\/g, '/')}`);
    const plugin = pluginModule.default;
    
    // Initialize the plugin
    const setupResult = plugin.setup({ utils: mockUtils });
    
    if (!setupResult) {
      console.error('Plugin setup failed');
      process.exit(1);
    }
    
    console.log('Plugin setup successful');
    
    // Test beforeInstall hook
    try {
      console.log('\nTesting beforeInstall hook...');
      const beforeInstallResult = await setupResult.beforeInstall({
        workPath: process.cwd(),
        installCommand: 'npm install',
        utils: mockUtils,
        meta: {
          settings: {
            enableCache: true,
            cacheCompression: true,
            concurrency: 4,
            fallbackToNpm: true
          }
        }
      });
      
      console.log('beforeInstall result:', beforeInstallResult);
    } catch (error) {
      console.error('beforeInstall hook failed:', error);
    }
    
    // Test afterInstall hook
    try {
      console.log('\nTesting afterInstall hook...');
      await setupResult.afterInstall({
        workPath: process.cwd(),
        utils: mockUtils
      });
    } catch (error) {
      console.error('afterInstall hook failed:', error);
    }
    
    // Test beforeBuild hook
    try {
      console.log('\nTesting beforeBuild hook...');
      await setupResult.beforeBuild({
        workPath: process.cwd(),
        utils: mockUtils
      });
    } catch (error) {
      console.error('beforeBuild hook failed:', error);
    }
    
    // Test afterBuild hook
    try {
      console.log('\nTesting afterBuild hook...');
      await setupResult.afterBuild({
        workPath: process.cwd(),
        utils: mockUtils
      });
    } catch (error) {
      console.error('afterBuild hook failed:', error);
    }
    
    console.log('\nAll tests completed!');
  } catch (error) {
    console.error('Failed to import plugin:', error);
    process.exit(1);
  }
}

// Run the tests
testPlugin().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
