/**
 * Interactive setup wizard for Flash Install
 * Provides guided configuration for new users
 */

import { stdin, stdout } from 'process';
import * as readline from 'readline';
import { logger } from './logger.js';
import { format } from './logger.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create readline interface for user input
const rl = readline.createInterface({
  input: stdin,
  output: stdout
});

/**
 * Configuration options for Flash Install
 */
export interface FlashInstallConfig {
  cacheDir?: string;
  concurrency?: number;
  timeout?: number;
  cloudCache?: boolean;
  cloudProvider?: 'aws' | 'gcp' | 'azure';
  cloudBucket?: string;
  verbose?: boolean;
  offline?: boolean;
  noDev?: boolean;
}

/**
 * Setup wizard for Flash Install
 */
export class SetupWizard {
  private config: FlashInstallConfig = {};

  /**
   * Run the interactive setup wizard
   * @returns Promise resolving to user's configuration choices
   */
  async run(): Promise<FlashInstallConfig> {
    logger.flash('Welcome to Flash Install Setup Wizard!');
    logger.info('This wizard will help you configure Flash Install for optimal performance.');
    logger.info('');

    // Ask for cache directory
    this.config.cacheDir = await this.askQuestion(
      `Cache directory (default: ${this.getDefaultCacheDir()}): `,
      this.getDefaultCacheDir()
    );

    // Ask for concurrency
    this.config.concurrency = parseInt(await this.askQuestion(
      `Download concurrency (default: 8): `,
      '8'
    ), 10);

    // Ask for timeout
    this.config.timeout = parseInt(await this.askQuestion(
      `Request timeout (ms, default: 30000): `,
      '30000'
    ), 10);

    // Ask about cloud cache
    const useCloudCache = await this.askYesNo('Enable cloud cache? (y/n): ', false);
    if (useCloudCache) {
      this.config.cloudCache = true;
      this.config.cloudProvider = await this.selectOption(
        'Choose cloud provider: ',
        ['aws', 'gcp', 'azure'] as const
      ) as 'aws' | 'gcp' | 'azure';
      
      this.config.cloudBucket = await this.askQuestion(
        'Cloud bucket name: ',
        ''
      );
    } else {
      this.config.cloudCache = false;
    }

    // Ask about verbose mode
    this.config.verbose = await this.askYesNo('Enable verbose logging? (y/n): ', false);

    logger.success('Setup complete!');
    logger.info('');
    logger.info('Your configuration:');
    this.printConfig();
    
    const confirm = await this.askYesNo('Save this configuration? (y/n): ', true);
    
    if (confirm) {
      await this.saveConfig();
      logger.success('Configuration saved successfully!');
    } else {
      logger.info('Configuration not saved. You can run this wizard again later.');
    }

    return this.config;
  }

  /**
   * Ask a yes/no question
   */
  private async askYesNo(question: string, defaultValue: boolean): Promise<boolean> {
    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    const answer = await this.askQuestion(`${question} (${defaultStr}): `, defaultValue ? 'y' : 'n');
    return /^(y|yes)$/i.test(answer.trim());
  }

  /**
   * Ask a question and get user input
   */
  private async askQuestion(question: string, defaultValue: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim() || defaultValue);
      });
    });
  }

  /**
   * Select an option from a list
   */
  private async selectOption<T extends readonly string[]>(
    question: string,
    options: T
  ): Promise<T[number]> {
    logger.info('Options:');
    options.forEach((option, index) => {
      logger.info(`  ${index + 1}. ${option}`);
    });
    
    let choice: string;
    do {
      choice = await this.askQuestion(`${question} (1-${options.length}): `, '1');
      const index = parseInt(choice, 10) - 1;
      if (index >= 0 && index < options.length) {
        return options[index];
      }
      logger.warn('Invalid selection. Please try again.');
    } while (true);
  }

  /**
   * Get the default cache directory
   */
  private getDefaultCacheDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.flash-install', 'cache');
  }

  /**
   * Print the current configuration
   */
  private printConfig(): void {
    logger.info(`  Cache directory: ${this.config.cacheDir}`);
    logger.info(`  Concurrency: ${this.config.concurrency}`);
    logger.info(`  Timeout: ${this.config.timeout}ms`);
    logger.info(`  Cloud cache: ${this.config.cloudCache ? 'enabled' : 'disabled'}`);
    if (this.config.cloudCache) {
      logger.info(`  Cloud provider: ${this.config.cloudProvider}`);
      logger.info(`  Cloud bucket: ${this.config.cloudBucket}`);
    }
    logger.info(`  Verbose logging: ${this.config.verbose ? 'enabled' : 'disabled'}`);
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    const configPath = path.join(os.homedir(), '.flash-install', 'config.json');
    
    // Ensure directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Write config file
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }
}

/**
 * Enhanced error with actionable suggestions
 */
export class SuggestibleError extends Error {
  suggestions: string[];
  category: string;

  constructor(
    message: string,
    category: string,
    suggestions: string[] = []
  ) {
    super(message);
    this.name = 'SuggestibleError';
    this.category = category;
    this.suggestions = suggestions;
  }

  /**
   * Log the error with suggestions
   */
  log(): void {
    logger.error(this.message);
    if (this.suggestions.length > 0) {
      logger.info(format.info('Suggestions to resolve this issue:'));
      this.suggestions.forEach(suggestion => {
        logger.info(`  • ${suggestion}`);
      });
    }
  }
}

/**
 * Enhanced error handler with better user guidance
 */
export class UserFriendlyErrorHandler {
  /**
   * Handle an error and provide actionable suggestions
   */
  static handle(error: Error | unknown): SuggestibleError {
    const message = error instanceof Error ? error.message : String(error);
    
    // Create suggestions based on the error message
    const suggestions = this.generateSuggestions(message, error);
    const category = this.categorizeError(message);
    
    const suggestibleError = new SuggestibleError(message, category, suggestions);
    suggestibleError.log();
    
    return suggestibleError;
  }

  /**
   * Categorize the error to determine appropriate suggestions
   */
  private static categorizeError(message: string): string {
    if (message.includes('ENOENT') || message.includes('file not found')) {
      return 'FILE_NOT_FOUND';
    } else if (message.includes('EACCES') || message.includes('permission')) {
      return 'PERMISSION_DENIED';
    } else if (message.includes('ENOTFOUND') || message.includes('network')) {
      return 'NETWORK_ERROR';
    } else if (message.includes('disk') || message.includes('space')) {
      return 'DISK_SPACE';
    } else if (message.includes('timeout')) {
      return 'TIMEOUT';
    } else {
      return 'UNKNOWN';
    }
  }

  /**
   * Generate actionable suggestions based on the error
   */
  private static generateSuggestions(message: string, originalError?: Error | unknown): string[] {
    const suggestions: string[] = [];

    if (message.includes('ENOENT') || message.includes('file not found')) {
      suggestions.push('Check that the specified file or directory exists');
      suggestions.push('Verify the path is correct and properly escaped');
      suggestions.push('Ensure you have the required permissions to access the file');
    } 
    else if (message.includes('EACCES') || message.includes('permission')) {
      suggestions.push('Run the command with appropriate permissions (e.g. sudo on Unix systems)');
      suggestions.push('Check file/directory permissions and adjust if necessary');
      suggestions.push('Verify that your user account has access to the required resources');
    } 
    else if (message.includes('ENOTFOUND') || message.includes('network')) {
      suggestions.push('Verify your internet connection is working');
      suggestions.push('Check your proxy or firewall settings');
      suggestions.push('Try using a different registry URL if applicable');
    } 
    else if (message.includes('disk') || message.includes('space')) {
      suggestions.push('Free up disk space on your system');
      suggestions.push('Change the cache directory to a location with more space');
      suggestions.push('Clean the existing cache with `flash clean` command');
    } 
    else if (message.includes('timeout')) {
      suggestions.push('Increase the timeout value in your configuration');
      suggestions.push('Check your network connection speed');
      suggestions.push('Try reducing the concurrency level to reduce network load');
    } 
    else {
      // General suggestions for unknown errors
      suggestions.push('Check the detailed error log for more information');
      suggestions.push('Verify your configuration settings are correct');
      suggestions.push('Consult the documentation or seek help from the community');
      suggestions.push('Try running the command again');
    }

    // Add a general suggestion about the setup wizard if appropriate
    if (!message.includes('setup') && !message.includes('config')) {
      suggestions.push('Run the setup wizard with `flash setup` to verify your configuration');
    }

    return suggestions;
  }
}

// Export default instance of the setup wizard
export const setupWizard = new SetupWizard();