import * as os from 'os';
import * as path from 'path';
import { CIDetection, CIPerformanceMode } from '../types.js';

/**
 * Detect CI environment and provide optimization recommendations
 */
export function detectCI(): CIDetection {
  // Common CI environment variables to check
  const ciEnvVars = {
    'CI': ['true', '1', 'yes'],
    'CONTINUOUS_INTEGRATION': ['true', '1', 'yes'],
    'BUILD_NUMBER': ['any'],
    'CI_BUILD_ID': ['any'],
  };

  // Check for standard CI indicators
  let isCI = false;
  let provider = 'unknown';

  // Check general CI indicators
  for (const [varName, values] of Object.entries(ciEnvVars)) {
    const envValue = process.env[varName];
    if (envValue && (values.includes('any') || values.includes(envValue.toLowerCase()))) {
      isCI = true;
      break;
    }
  }

  // Detect specific CI providers
  if (isCI) {
    // GitHub Actions
    if (process.env.GITHUB_ACTIONS === 'true') {
      provider = 'github-actions';
    }
    // GitLab CI
    else if (process.env.CI && process.env.GITLAB_CI) {
      provider = 'gitlab-ci';
    }
    // Jenkins
    else if (process.env.JENKINS_HOME || process.env.JENKINS_URL) {
      provider = 'jenkins';
    }
    // CircleCI
    else if (process.env.CIRCLECI) {
      provider = 'circleci';
    }
    // Travis CI
    else if (process.env.TRAVIS || process.env.TRAVIS_ARCHITECTURE) {
      provider = 'travis-ci';
    }
    // AppVeyor
    else if (process.env.APPVEYOR) {
      provider = 'appveyor';
    }
    // Azure DevOps
    else if (process.env.TF_BUILD || process.env.TFS_HTTP_USER_AGENT) {
      provider = 'azure-pipelines';
    }
    // Bitbucket Pipelines
    else if (process.env.BITBUCKET_BUILD_NUMBER) {
      provider = 'bitbucket-pipelines';
    }
  }

  // Extract provider-specific information
  const detection = getProviderSpecificInfo(provider);

  // Determine if CI optimization should be recommended
  const recommended = isCI &&
    (detection.provider === 'github-actions' ||
     detection.provider === 'gitlab-ci' ||
     detection.provider === 'circleci' ||
     detection.provider === 'azure-pipelines');

  return {
    isCI: isCI,
    provider: provider,
    ...detection,
    recommendCIOptimized: recommended
  };
}

/**
 * Extract provider-specific information
 */
function getProviderSpecificInfo(provider: string): Partial<CIDetection> {
  switch (provider) {
    case 'github-actions':
      return {
        provider: 'github-actions',
        buildId: process.env.GITHUB_RUN_ID || process.env.GITHUB_SHA,
        repo: process.env.GITHUB_REPOSITORY,
        branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME,
        tag: process.env.GITHUB_REF?.startsWith('refs/tags/') || false,
        prNumber: process.env.GITHUB_EVENT_NAME === 'pull_request'
          ? parseInt(process.env.GITHUB_REF?.split('/')[2] || '0')
          : undefined
      };

    case 'gitlab-ci':
      return {
        provider: 'gitlab-ci',
        buildId: process.env.CI_JOB_ID || process.env.CI_COMMIT_SHA,
        repo: process.env.CI_PROJECT_NAME || process.env.CI_PROJECT_PATH,
        branch: process.env.CI_COMMIT_REF_NAME,
        tag: process.env.CI_COMMIT_TAG !== undefined
      };

    case 'circleci':
      return {
        provider: 'circleci',
        buildId: process.env.CIRCLE_WORKFLOW_JOB_ID || process.env.CIRCLE_BUILD_NUM,
        repo: process.env.CIRCLE_PROJECT_USERNAME + '/' + process.env.CIRCLE_PROJECT_REPONAME,
        branch: process.env.CIRCLE_BRANCH || process.env.CIRCLE_TAG,
        tag: process.env.CIRCLE_TAG !== undefined
      };

    case 'azure-pipelines':
      return {
        provider: 'azure-pipelines',
        buildId: process.env.BUILD_BUILDID,
        repo: process.env.BUILD_REPOSITORY_NAME,
        branch: process.env.BUILD_SOURCEBRANCHNAME,
        prNumber: process.env.SYSTEM_PULLREQUEST_PULLREQUESTNUMBER
          ? parseInt(process.env.SYSTEM_PULLREQUEST_PULLREQUESTNUMBER)
          : undefined
      };

    case 'jenkins':
      return {
        provider: 'jenkins',
        buildId: process.env.BUILD_ID || process.env.BUILD_NUMBER,
        repo: process.env.JOB_NAME?.split('/')[0] || '',
        branch: process.env.BRANCH_NAME || process.env.GIT_BRANCH
      };

    default:
      return { provider, isCI: false };
  }
}

/**
 * Get CI-optimized performance configuration
 */
export function getCIPerformanceMode(ciDetection: CIDetection): CIPerformanceMode {
  // Base CI configuration
  const baseConfig: CIPerformanceMode = {
    aggressiveCaching: true,
    maxConcurrency: 8,
    minimalLogging: true,
    disableTelemetry: true,
    profilingEnabled: false
  };

  // Provider-specific optimizations
  switch (ciDetection.provider) {
    case 'github-actions':
      return {
        ...baseConfig,
        maxConcurrency: Math.min(12, os.cpus().length * 2), // GitHub runners are powerful
        minimalLogging: false, // GitHub Actions shows logs well
        disableTelemetry: false // Could be useful for analytics
      };

    case 'gitlab-ci':
    case 'circleci':
      return {
        ...baseConfig,
        maxConcurrency: Math.min(16, os.cpus().length * 2), // Often dedicated hardware
        profilingEnabled: true // Good candidates for benchmarking
      };

    case 'azure-pipelines':
      return {
        ...baseConfig,
        maxConcurrency: Math.min(6, os.cpus().length), // More conservative
        disableTelemetry: true // Enterprise environments may prefer privacy
      };

    case 'bitbucket-pipelines':
      return baseConfig; // Use defaults

    default:
      return {
        ...baseConfig,
        maxConcurrency: Math.min(4, os.cpus().length), // Conservative defaults
      };
  }
}

/**
 * Suggest cache strategies based on CI environment and repository info
 */
export function suggestCacheStrategy(ciDetection: CIDetection, repoPath: string = '') {
  const strategies = [];

  // Base cache configuration
  const baseConfig = {
    localCache: {
      enabled: true,
      maxSize: '5GB' // Generous for CI
    },
    cloudCache: {
      enabled: true,
      syncToLocal: true
    }
  };

  switch (ciDetection.provider) {
    case 'github-actions':
      strategies.push({
        ...baseConfig,
        githubActions: {
          cacheEnabled: true,
          restoreKeys: [
            `node-cache-${ciDetection.branch}-`,
            'node-cache-'
          ]
        }
      });
      break;

    case 'gitlab-ci':
      strategies.push({
        ...baseConfig,
        gitlabConfig: {
          cacheEnabled: true,
          fallbackKeys: ['master-', 'main-']
        }
      });
      break;

    default:
      strategies.push(baseConfig);
  }

  return strategies[0];
}

/**
 * Get CI-specific environment variables
 */
export function getCIEnvironmentInfo() {
  return {
    memoryMB: Math.floor(os.totalmem() / 1024 / 1024),
    cpuCount: os.cpus().length,
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    ciProvider: detectCI().provider,
    environmentVars: {
      HAS_DOCKER: process.env.DOCKER_HOST || process.env.DOCKER_TLS ? 'true' : 'false',
      HAS_SSH_KEYS: process.env.SSH_PRIVATE_KEY ? 'true' : 'false',
      IN_DOCKER_CONTAINER: process.env.npm_config_container ? 'true' : 'false'
    }
  };
}

/**
 * Check if this installation is suitable for CI optimizations
 */
export function isCISuitable(): boolean {
  const ciDetection = detectCI();

  // Always enable CI optimizations when in CI
  if (ciDetection.isCI) {
    return true;
  }

  // For development, only enable if explicitly requested
  const hasCIArgs = process.argv.some(arg =>
    arg === '--ci' ||
    arg === '--ci-mode' ||
    arg.startsWith('--ci=')
  );

  return hasCIArgs;
}