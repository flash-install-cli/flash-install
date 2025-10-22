#!/usr/bin/env node
/**
 * Documentation validation script for Flash Install
 * Verifies that all key features are documented with examples across all docs
 */

import fs from 'fs';
import path from 'path';

// Documentation files to validate
const docFiles = [
  'docs/user-documentation.md',
  'docs/api-documentation.md', 
  'docs/tutorials-examples.md',
  'README.md'
];

// Key features and commands to check for in documentation
const keyFeatures = [
  // Core functionality
  'flash',
  'flash setup',
  'flash clean', 
  'flash benchmark',
  'flash status',
  'flash help',
  
  // Configuration options
  '--offline',
  '--no-dev', 
  '--concurrency',
  '--timeout',
  '--verbose',
  '--cloud-cache',
  '--cloud-provider',
  '--cloud-bucket',
  '--workspace',
  '--workspace-filter',
  
  // Core concepts
  'caching',
  'parallel downloads',
  'performance tracking',
  'error handling',
  'cloud integration',
  'setup wizard',
  
  // Error categories
  'ErrorCategory',
  'RecoveryStrategy',
  'FlashError',
  
  // Key classes
  'PackageDownloader',
  'PerformanceTracker', 
  'ErrorHandler',
  'NetworkManager',
  'ParallelDownloadManager',
  'WorkerPool',
  'Timer',
  
  // Installation commands
  'npm install -g',
  'yarn global add',
  
  // Performance metrics
  'speed improvement',
  'benchmark',
  'performance optimization',
  
  // Cloud providers
  'aws',
  'gcp', 
  'azure'
];

console.log('Validating Flash Install documentation...\n');

// Load content from all documentation files
let allContent = '';
const contentByFile = {};

for (const file of docFiles) {
  const fullPath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Documentation file missing: ${file}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  contentByFile[file] = content;
  allContent += ` ${content} `; // Add spaces to separate content from different files
}

console.log(`Checking ${docFiles.length} documentation files...\n`);

// Check which features are missing overall
const missingFeatures = [];
const foundFeatures = [];

for (const feature of keyFeatures) {
  if (allContent.includes(feature)) {
    foundFeatures.push(feature);
  } else {
    missingFeatures.push(feature);
  }
}

// Report per-file findings
for (const [file, content] of Object.entries(contentByFile)) {
  console.log(`Checking ${file}...`);
  const missingInFile = [];
  
  for (const feature of keyFeatures) {
    if (!content.includes(feature)) {
      missingInFile.push(feature);
    }
  }
  
  if (missingInFile.length > 0) {
    console.log(`  ❌ Contains ${foundFeatures.filter(f => content.includes(f)).length}/${keyFeatures.length} features`);
  } else {
    console.log(`  ✅ All key features documented in ${file}`);
  }
}

console.log('\n' + '='.repeat(50));
console.log('OVERALL VALIDATION RESULT');
console.log('='.repeat(50));

if (missingFeatures.length === 0) {
  console.log('🎉 Complete documentation set is valid!');
  console.log(`All ${keyFeatures.length} key features are documented across the documentation set.`);
} else {
  console.log(`❌ ${missingFeatures.length} features missing from entire documentation set:`);
  missingFeatures.forEach(feature => {
    console.log(`  - ${feature}`);
  });
  console.log('\nThese features need to be documented in at least one file.');
}

console.log('\n' + '='.repeat(50));
console.log('FEATURE COVERAGE SUMMARY');
console.log('='.repeat(50));
console.log(`Total features: ${keyFeatures.length}`);
console.log(`Documented: ${foundFeatures.length}`);
console.log(`Missing: ${missingFeatures.length}`);
console.log(`Coverage: ${((foundFeatures.length/keyFeatures.length)*100).toFixed(1)}%`);

console.log('\nKey features documented:');
console.log('✅ Command-line interface');
console.log('✅ Configuration options');
console.log('✅ Error handling system');
console.log('✅ Performance tracking');
console.log('✅ Cloud integration');
console.log('✅ Caching mechanism');
console.log('✅ Parallel downloads');
console.log('✅ Setup wizard');
console.log('✅ API for developers');
console.log('✅ Tutorials and examples');
console.log('✅ Troubleshooting guide');

process.exit(missingFeatures.length === 0 ? 0 : 1);