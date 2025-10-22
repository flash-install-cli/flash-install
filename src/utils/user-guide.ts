/**
 * User guide and help system for Flash Install
 * Provides contextual help and guidance to users
 */

import { logger } from './logger.js';
import { format } from './logger.js';
import { logTable } from './logger.js';

/**
 * Command information structure
 */
interface CommandInfo {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  commonMistakes?: string[];
}

/**
 * Common issue and solution structure
 */
interface CommonIssue {
  symptom: string;
  cause: string;
  solution: string;
}

/**
 * User guide class providing help and guidance
 */
export class UserGuide {
  private commands: CommandInfo[] = [
    {
      name: 'flash',
      description: 'Install packages with Flash Install (drop-in replacement for npm install)',
      usage: 'flash [options]',
      examples: [
        'flash # Install all dependencies',
        'flash lodash # Install a specific package',
        'flash lodash --save-dev # Install as dev dependency',
        'flash --offline # Install from cache only',
        'flash --no-dev # Install production dependencies only'
      ]
    },
    {
      name: 'flash setup',
      description: 'Run the interactive setup wizard',
      usage: 'flash setup',
      examples: [
        'flash setup # Run the guided setup process'
      ]
    },
    {
      name: 'flash clean',
      description: 'Clean the package cache',
      usage: 'flash clean [options]',
      examples: [
        'flash clean # Clean the entire cache',
        'flash clean --dry-run # Show what would be cleaned without doing it'
      ]
    },
    {
      name: 'flash benchmark',
      description: 'Run a performance benchmark against npm',
      usage: 'flash benchmark',
      examples: [
        'flash benchmark # Compare Flash Install vs npm install performance'
      ]
    },
    {
      name: 'flash status',
      description: 'Show the status of Flash Install',
      usage: 'flash status',
      examples: [
        'flash status # Show cache status, network connectivity, etc.'
      ]
    }
  ];

  private commonIssues: CommonIssue[] = [
    {
      symptom: 'Permission denied errors',
      cause: 'Insufficient permissions to write to node_modules or cache directory',
      solution: 'Run with appropriate permissions (e.g., use sudo on Unix systems), or change the cache directory location in configuration.'
    },
    {
      symptom: 'Slow installation speeds',
      cause: 'Suboptimal configuration or network conditions',
      solution: 'Use the setup wizard to optimize settings like concurrency and timeout, or try installing during off-peak network hours.'
    },
    {
      symptom: 'Network timeout errors',
      cause: 'Request taking longer than configured timeout',
      solution: 'Increase the timeout value in your configuration, or reduce concurrency to decrease network load.'
    },
    {
      symptom: 'Cache not being used effectively',
      cause: 'Cache directory issues or corrupted cache entries',
      solution: 'Clean the cache with `flash clean` and reinstall, or verify cache directory permissions and space.'
    },
    {
      symptom: 'Module not found after installation',
      cause: 'Dependency not properly linked or cached',
      solution: 'Try running `flash` again, or clear the cache and reinstall. Verify the package name is correct.'
    }
  ];

  /**
   * Show the main help message
   */
  showHelp(command?: string): void {
    if (command) {
      this.showCommandHelp(command);
    } else {
      this.showGeneralHelp();
    }
  }

  /**
   * Show general help with all commands
   */
  showGeneralHelp(): void {
    logger.flash('⚡ Flash Install - Help Guide ⚡');
    logger.info('');
    logger.info('Flash Install is a fast, drop-in replacement for npm install with deterministic caching.');
    logger.info('');
    
    logger.info(format.info('Available Commands:'));
    logger.info('');
    
    // Show commands in a table format
    const commandData = this.commands.map(cmd => [
      format.bold(cmd.name),
      cmd.description
    ]);
    
    logTable(commandData);
    
    logger.info('');
    logger.info(format.info('For detailed help on a specific command, use:'));
    logger.info('  flash help <command>');
    logger.info('');
    logger.info(format.info('Additional resources:'));
    logger.info('  - Setup wizard: flash setup');
    logger.info('  - Common issues: flash help issues');
    logger.info('  - Performance tips: flash help performance');
    logger.info('');
  }

  /**
   * Show help for a specific command
   */
  showCommandHelp(command: string): void {
    const cmd = this.commands.find(c => c.name.includes(command));
    
    if (!cmd) {
      logger.error(`Command '${command}' not found.`);
      logger.info('Use `flash help` to see all available commands.');
      return;
    }
    
    logger.info(format.info(`Command: ${cmd.name}`));
    logger.info('');
    logger.info(`Description: ${cmd.description}`);
    logger.info('');
    logger.info(`Usage: ${cmd.usage}`);
    logger.info('');
    logger.info(format.info('Examples:'));
    
    cmd.examples.forEach(example => {
      logger.info(`  $ ${example}`);
    });
    
    if (cmd.commonMistakes && cmd.commonMistakes.length > 0) {
      logger.info('');
      logger.info(format.warn('Common Mistakes:'));
      cmd.commonMistakes.forEach(mistake => {
        logger.info(`  • ${mistake}`);
      });
    }
    
    logger.info('');
  }

  /**
   * Show common issues and solutions
   */
  showCommonIssues(): void {
    logger.info(format.info('Common Issues and Solutions'));
    logger.info('');
    
    this.commonIssues.forEach((issue, index) => {
      logger.info(format.bold(`${index + 1}. ${issue.symptom}`));
      logger.info(`   ${format.warn('Cause')}: ${issue.cause}`);
      logger.info(`   ${format.success('Solution')}: ${issue.solution}`);
      logger.info('');
    });
    
    logger.info(format.info('For more help:'));
    logger.info('  - Run the setup wizard: flash setup');
    logger.info('  - Report issues: https://github.com/flash-install-cli/flash-install/issues');
    logger.info('');
  }

  /**
   * Show performance tips
   */
  showPerformanceTips(): void {
    logger.info(format.info('Performance Optimization Tips'));
    logger.info('');
    
    const tips = [
      {
        title: 'Optimize Concurrency',
        description: 'Adjust the number of concurrent downloads based on your system and network. Start with 8 and adjust as needed.'
      },
      {
        title: 'Use Cache Effectively',
        description: 'Flash Install uses a smart caching system. The first installation of a package will be slower, but subsequent installations will be extremely fast.'
      },
      {
        title: 'Configure Network Settings',
        description: 'Set appropriate timeout values and consider using cloud caching for team environments.'
      },
      {
        title: 'Offline Mode',
        description: 'Use `--offline` flag to install from cache only when network connectivity is limited.'
      },
      {
        title: 'Production Installs',
        description: 'Use `--no-dev` flag to skip devDependencies for faster production builds.'
      }
    ];
    
    tips.forEach((tip, index) => {
      logger.info(format.bold(`${index + 1}. ${tip.title}`));
      logger.info(`   ${tip.description}`);
      logger.info('');
    });
    
    logger.info('Run the setup wizard to optimize these settings: flash setup');
    logger.info('');
  }

  /**
   * Show troubleshooting guide
   */
  showTroubleshooting(): void {
    logger.info(format.info('Troubleshooting Guide'));
    logger.info('');
    
    const steps = [
      {
        step: '1. Verify Installation',
        action: 'Run `flash --version` to confirm Flash Install is properly installed'
      },
      {
        step: '2. Check Network',
        action: 'Ensure your internet connection is working and firewall/proxy settings are correct'
      },
      {
        step: '3. Verify Cache',
        action: 'Use `flash status` to check cache status and run `flash clean` if needed'
      },
      {
        step: '4. Validate Configuration',
        action: 'Run the setup wizard with `flash setup` to review and optimize settings'
      },
      {
        step: '5. Test with Simple Package',
        action: 'Try installing a simple package like `lodash` to isolate the issue'
      },
      {
        step: '6. Check Logs',
        action: 'Enable verbose logging with `--verbose` flag to gather more information'
      }
    ];
    
    steps.forEach(stepInfo => {
      logger.info(`${format.bold(stepInfo.step)}`);
      logger.info(`   ${stepInfo.action}`);
      logger.info('');
    });
    
    logger.info('For further assistance:');
    logger.info('  - Review common issues: flash help issues');
    logger.info('  - Create an issue: https://github.com/flash-install-cli/flash-install/issues');
    logger.info('');
  }

  /**
   * Show quick start guide
   */
  showQuickStart(): void {
    logger.flash('⚡ Flash Install - Quick Start Guide ⚡');
    logger.info('');
    
    const steps = [
      {
        step: '1. Run Setup',
        action: 'Run the interactive setup wizard to configure Flash Install for your system',
        command: 'flash setup'
      },
      {
        step: '2. Install Packages',
        action: 'Use Flash Install as a drop-in replacement for npm install',
        command: 'flash'  // or 'npm install'
      },
      {
        step: '3. Experience Speed',
        action: 'Notice the significant performance improvements over traditional npm install'
      },
      {
        step: '4. Optimize Settings',
        action: 'Fine-tune settings based on your specific needs and environment',
        command: 'flash setup'
      }
    ];
    
    steps.forEach(stepInfo => {
      logger.info(format.bold(stepInfo.step));
      logger.info(`   ${stepInfo.action}`);
      if (stepInfo.command) {
        logger.info(`   $ ${stepInfo.command}`);
      }
      logger.info('');
    });
    
    logger.info('For more information, visit: https://flash-install.dev/docs');
    logger.info('');
  }
}

// Export the user guide instance
export const userGuide = new UserGuide();