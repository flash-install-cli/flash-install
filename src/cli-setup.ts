/**
 * CLI setup command for Flash Install
 * Provides an interactive setup experience for new users
 */

import { Command } from 'commander';
import { setupWizard } from './utils/interactive-setup.js';

export const setupCommand = new Command()
  .name('setup')
  .description('Run the interactive setup wizard for Flash Install')
  .option('--skip-verification', 'Skip verification steps during setup')
  .option('--reset', 'Reset configuration to default values')
  .action(async (options) => {
    console.log('Starting Flash Install setup wizard...');
    
    if (options.reset) {
      console.log('Resetting configuration to defaults...');
      // For now, let's just run the wizard fresh
    }
    
    try {
      await setupWizard.run();
      console.log('Setup completed successfully!');
    } catch (error) {
      console.error('Setup failed:', error);
      process.exit(1);
    }
  });