/**
 * CLI help command for Flash Install
 * Provides contextual help and guidance to users
 */

import { Command } from 'commander';
import { userGuide } from './utils/user-guide.js';

export const helpCommand = new Command()
  .name('help')
  .description('Show help information and user guidance')
  .argument('[topic]', 'specific topic to get help with (e.g., issues, performance, commands)')
  .action((topic) => {
    switch (topic) {
      case 'issues':
        userGuide.showCommonIssues();
        break;
      case 'performance':
        userGuide.showPerformanceTips();
        break;
      case 'troubleshooting':
        userGuide.showTroubleshooting();
        break;
      case 'quickstart':
      case 'quick-start':
        userGuide.showQuickStart();
        break;
      case undefined:
        userGuide.showGeneralHelp();
        break;
      default:
        userGuide.showCommandHelp(topic);
        break;
    }
  });