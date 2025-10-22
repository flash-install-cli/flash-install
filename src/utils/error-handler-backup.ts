/**
 * Comprehensive error handling system for flash-install
 */
import { logger } from './logger.js';

/**
 * Error categories for better error handling
 */
export enum ErrorCategory {
  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DISK_SPACE = 'DISK_SPACE',
  FILE_SYSTEM = 'FILE_SYSTEM',
  
  // Network errors
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION = 'NETWORK_CONNECTION',
  NETWORK_DNS = 'NETWORK_DNS',
  NETWORK = 'NETWORK',
  
  // Cloud provider errors
  CLOUD_AUTHENTICATION = 'CLOUD_AUTHENTICATION',
  CLOUD_PERMISSION = 'CLOUD_PERMISSION',
  CLOUD_RESOURCE = 'CLOUD_RESOURCE',
  CLOUD_QUOTA = 'CLOUD_QUOTA',
  CLOUD = 'CLOUD',
  
  // Package errors
  PACKAGE_NOT_FOUND = 'PACKAGE_NOT_FOUND',
  PACKAGE_INVALID = 'PACKAGE_INVALID',
  PACKAGE_VERSION = 'PACKAGE_VERSION',
  PACKAGE = 'PACKAGE',
  
  // Configuration errors
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG = 'CONFIG',
  
  // Dependency errors
  DEPENDENCY_CONFLICT = 'DEPENDENCY_CONFLICT',
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING',
  DEPENDENCY = 'DEPENDENCY',
  
  // Process errors
  PROCESS_TIMEOUT = 'PROCESS_TIMEOUT',
  PROCESS_CRASH = 'PROCESS_CRASH',
  PROCESS = 'PROCESS',
  
  // Memory errors
  MEMORY_LIMIT = 'MEMORY_LIMIT',
  MEMORY_LEAK = 'MEMORY_LEAK',
  MEMORY = 'MEMORY',
  
  // Unknown errors
  UNKNOWN = 'UNKNOWN'
}

/**
 * Error recovery strategy
 */
export enum RecoveryStrategy {
  // No recovery possible, fail immediately
  FAIL = 'FAIL',
  
  // Retry the operation
  RETRY = 'RETRY',
  
  // Use an alternative approach
  ALTERNATIVE = 'ALTERNATIVE',
  
  // Continue with degraded functionality
  CONTINUE_DEGRADED = 'CONTINUE_DEGRADED',
  
  // Ignore the error and continue
  IGNORE = 'IGNORE'
}

/**
 * Flash install error with enhanced information
 */
export class FlashError extends Error {
  /**
   * Error category
   */
  category: ErrorCategory;
  
  /**
   * Original error
   */
  originalError?: Error | unknown;
  
  /**
   * Recovery strategy
   */
  recoveryStrategy: RecoveryStrategy;
  
  /**
   * Maximum number of retries
   */
  maxRetries?: number;
  
  /**
   * Current retry count
   */
  retryCount?: number;
  
  /**
   * Whether the error is recoverable
   */
  recoverable: boolean;
  
  /**
   * Additional context for the error
   */
  context?: Record<string, any>;
  
  /**
   * Create a new FlashError
   * @param message Error message
   * @param category Error category
   * @param originalError Original error
   * @param recoveryStrategy Recovery strategy
   * @param options Additional options
   */
  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    originalError?: Error | unknown,
    recoveryStrategy: RecoveryStrategy = RecoveryStrategy.FAIL,
    options?: {
      maxRetries?: number;
      retryCount?: number;
      recoverable?: boolean;
      context?: Record<string, any>;
    }
  ) {
    super(message);
    this.name = 'FlashError';
    this.category = category;
    this.originalError = originalError;
    this.recoveryStrategy = recoveryStrategy;
    this.maxRetries = options?.maxRetries;
    this.retryCount = options?.retryCount;
    this.recoverable = options?.recoverable ?? false;
    this.context = options?.context;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FlashError);
    }
  }
  
  /**
   * Get the original error message
   */
  getOriginalMessage(): string {
    if (this.originalError instanceof Error) {
      return this.originalError.message;
    } else if (this.originalError) {
      return String(this.originalError);
    }
    return '';
  }
  
  /**
   * Get the original error stack
   */
  getOriginalStack(): string {
    if (this.originalError instanceof Error) {
      return this.originalError.stack || '';
    }
    return '';
  }
  
  /**
   * Get a detailed error report
   */
  getDetailedReport(): string {
    const parts = [
      `FlashError: ${this.message}`,
      `Category: ${this.category}`,
      `Recovery Strategy: ${this.recoveryStrategy}`,
      `Recoverable: ${this.recoverable}`
    ];
    
    if (this.retryCount !== undefined && this.maxRetries !== undefined) {
      parts.push(`Retry: ${this.retryCount}/${this.maxRetries}`);
    }
    
    if (this.originalError instanceof Error) {
      parts.push(`Original Error: ${this.originalError.message}`);
      if (this.originalError.stack) {
        parts.push(`Original Stack: ${this.originalError.stack}`);
      }
    } else if (this.originalError) {
      parts.push(`Original Error: ${String(this.originalError)}`);
    }
    
    if (this.context) {
      parts.push(`Context: ${JSON.stringify(this.context, null, 2)}`);
    }
    
    return parts.join('\n');
  }
  
  /**
   * Log the error with appropriate level
   */
  log(): void {
    switch (this.recoveryStrategy) {
      case RecoveryStrategy.FAIL:
        logger.error(this.message);
        if (this.originalError) {
          logger.debug(this.getDetailedReport());
        }
        break;
        
      case RecoveryStrategy.RETRY:
        if (this.retryCount !== undefined && this.maxRetries !== undefined) {
          logger.warn(`${this.message} (Retry ${this.retryCount}/${this.maxRetries})`);
        } else {
          logger.warn(this.message);
        }
        break;
        
      case RecoveryStrategy.ALTERNATIVE:
        logger.warn(`${this.message} (Using alternative approach)`);
        break;
        
      case RecoveryStrategy.CONTINUE_DEGRADED:
        logger.warn(`${this.message} (Continuing with degraded functionality)`);
        break;
        
      case RecoveryStrategy.IGNORE:
        logger.debug(this.message);
        break;
        
      default:
        logger.error(this.message);
    }
  }
}

/**
 * Error handler for flash-install
 */
export class ErrorHandler {
  /**
   * Categorize an error based on its message and type
   * @param error Error to categorize
   * @returns Error category
   */
  static categorizeError(error: Error | unknown): ErrorCategory {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // File system errors
    if (errorMessage.includes('ENOENT')) {
      return ErrorCategory.FILE_NOT_FOUND;
    } else if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
      return ErrorCategory.PERMISSION_DENIED;
    } else if (errorMessage.includes('ENOSPC')) {
      return ErrorCategory.DISK_SPACE;
    } else if (
      errorMessage.includes('EEXIST') || 
      errorMessage.includes('EISDIR') || 
      errorMessage.includes('ENOTDIR') ||
      errorMessage.includes('EMFILE') ||
      errorMessage.includes('ENFILE')
    ) {
      return ErrorCategory.FILE_SYSTEM;
    }
    
    // Network errors
    else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      return ErrorCategory.NETWORK_TIMEOUT;
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ECONNRESET')) {
      return ErrorCategory.NETWORK_CONNECTION;
    } else if (errorMessage.includes('ENOTFOUND')) {
      return ErrorCategory.NETWORK_DNS;
    } else if (
      errorMessage.includes('ENETUNREACH') || 
      errorMessage.includes('EHOSTUNREACH') ||
      errorMessage.includes('network')
    ) {
      return ErrorCategory.NETWORK;
    }
    
    // Cloud provider errors
    else if (
      errorMessage.includes('authentication') || 
      errorMessage.includes('auth') || 
      errorMessage.includes('login') ||
      errorMessage.includes('credentials') ||
      errorMessage.includes('token')
    ) {
      return ErrorCategory.CLOUD_AUTHENTICATION;
    } else if (
      errorMessage.includes('permission') || 
      errorMessage.includes('access denied') || 
      errorMessage.includes('forbidden') ||
      errorMessage.includes('not authorized')
    ) {
      return ErrorCategory.CLOUD_PERMISSION;
    } else if (
      errorMessage.includes('not found') || 
      errorMessage.includes('404') || 
      errorMessage.includes('does not exist')
    ) {
      return ErrorCategory.CLOUD_RESOURCE;
    } else if (
      errorMessage.includes('quota') || 
      errorMessage.includes('limit') || 
      errorMessage.includes('exceeded')
    ) {
      return ErrorCategory.CLOUD_QUOTA;
    } else if (
      errorMessage.includes('cloud') || 
      errorMessage.includes('provider') || 
      errorMessage.includes('s3') ||
      errorMessage.includes('azure') ||
      errorMessage.includes('gcp')
    ) {
      return ErrorCategory.CLOUD;
    }
    
    // Package errors
    else if (
      errorMessage.includes('package not found') || 
      errorMessage.includes('could not find package')
    ) {
      return ErrorCategory.PACKAGE_NOT_FOUND;
    } else if (
      errorMessage.includes('invalid package') || 
      errorMessage.includes('corrupt package') ||
      errorMessage.includes('malformed package')
    ) {
      return ErrorCategory.PACKAGE_INVALID;
    } else if (
      errorMessage.includes('version') || 
      errorMessage.includes('semver')
    ) {
      return ErrorCategory.PACKAGE_VERSION;
    } else if (errorMessage.includes('package')) {
      return ErrorCategory.PACKAGE;
    }
    
    // Configuration errors
    else if (
      errorMessage.includes('invalid config') || 
      errorMessage.includes('invalid configuration')
    ) {
      return ErrorCategory.CONFIG_INVALID;
    } else if (
      errorMessage.includes('missing config') || 
      errorMessage.includes('config not found')
    ) {
      return ErrorCategory.CONFIG_MISSING;
    } else if (errorMessage.includes('config')) {
      return ErrorCategory.CONFIG;
    }
    
    // Dependency errors
    else if (errorMessage.includes('conflict')) {
      return ErrorCategory.DEPENDENCY_CONFLICT;
    } else if (errorMessage.includes('missing dependency')) {
      return ErrorCategory.DEPENDENCY_MISSING;
    } else if (errorMessage.includes('dependency')) {
      return ErrorCategory.DEPENDENCY;
    }
    
    // Process errors
    else if (
      errorMessage.includes('process timeout') || 
      errorMessage.includes('timed out')
    ) {
      return ErrorCategory.PROCESS_TIMEOUT;
    } else if (
      errorMessage.includes('process crashed') || 
      errorMessage.includes('exited with code')
    ) {
      return ErrorCategory.PROCESS_CRASH;
    } else if (errorMessage.includes('process')) {
      return ErrorCategory.PROCESS;
    }
    
    // Memory errors
    else if (
      errorMessage.includes('memory limit') || 
      errorMessage.includes('out of memory')
    ) {
      return ErrorCategory.MEMORY_LIMIT;
    } else if (errorMessage.includes('memory leak')) {
      return ErrorCategory.MEMORY_LEAK;
    } else if (errorMessage.includes('memory')) {
      return ErrorCategory.MEMORY;
    }
    
    // Default to unknown
    return ErrorCategory.UNKNOWN;
  }
  
  /**
   * Determine the recovery strategy for an error
   * @param category Error category
   * @returns Recovery strategy
   */
  static determineRecoveryStrategy(category: ErrorCategory): RecoveryStrategy {
    switch (category) {
      // Retryable errors
      case ErrorCategory.NETWORK_TIMEOUT:
      case ErrorCategory.NETWORK_CONNECTION:
      case ErrorCategory.NETWORK_DNS:
      case ErrorCategory.NETWORK:
      case ErrorCategory.CLOUD_RESOURCE:
      case ErrorCategory.PROCESS_TIMEOUT:
        return RecoveryStrategy.RETRY;
      
      // Errors that can use alternative approaches
      case ErrorCategory.CLOUD_AUTHENTICATION:
      case ErrorCategory.CLOUD_PERMISSION:
      case ErrorCategory.CLOUD_QUOTA:
      case ErrorCategory.CLOUD:
      case ErrorCategory.PACKAGE_NOT_FOUND:
        return RecoveryStrategy.ALTERNATIVE;
      
      // Errors that can continue with degraded functionality
      case ErrorCategory.CONFIG_INVALID:
      case ErrorCategory.CONFIG_MISSING:
      case ErrorCategory.CONFIG:
        return RecoveryStrategy.CONTINUE_DEGRADED;
      
      // Fatal errors
      case ErrorCategory.FILE_NOT_FOUND:
      case ErrorCategory.PERMISSION_DENIED:
      case ErrorCategory.DISK_SPACE:
      case ErrorCategory.FILE_SYSTEM:
      case ErrorCategory.PACKAGE_INVALID:
      case ErrorCategory.PACKAGE_VERSION:
      case ErrorCategory.PACKAGE:
      case ErrorCategory.DEPENDENCY_CONFLICT:
      case ErrorCategory.DEPENDENCY_MISSING:
      case ErrorCategory.DEPENDENCY:
      case ErrorCategory.PROCESS_CRASH:
      case ErrorCategory.PROCESS:
      case ErrorCategory.MEMORY_LIMIT:
      case ErrorCategory.MEMORY_LEAK:
      case ErrorCategory.MEMORY:
      case ErrorCategory.UNKNOWN:
        return RecoveryStrategy.FAIL;
      
      default:
        return RecoveryStrategy.FAIL;
    }
  }
  
  /**
   * Handle an error and return a FlashError
   * @param error Error to handle
   * @param context Additional context
   * @param options Additional options
   * @returns FlashError
   */
  static handleError(
    error: Error | unknown,
    context?: Record<string, any>,
    options?: {
      maxRetries?: number;
      retryCount?: number;
      category?: ErrorCategory;
      recoveryStrategy?: RecoveryStrategy;
      recoverable?: boolean;
    }
  ): FlashError {
    // Get error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Determine category
    const category = options?.category || this.categorizeError(error);
    
    // Determine recovery strategy
    const recoveryStrategy = options?.recoveryStrategy || this.determineRecoveryStrategy(category);
    
    // Create FlashError
    const flashError = new FlashError(
      errorMessage,
      category,
      error,
      recoveryStrategy,
      {
        maxRetries: options?.maxRetries,
        retryCount: options?.retryCount,
        recoverable: options?.recoverable ?? (recoveryStrategy !== RecoveryStrategy.FAIL),
        context
      }
    );
    
    // Log the error
    flashError.log();
    
    return flashError;
  }
  
  /**
   * Wrap a function with error handling
   * @param fn Function to wrap
   * @param context Additional context
   * @param options Additional options
   * @returns Wrapped function
   */
  static async withErrorHandling<T>(
    fn: () => Promise<T>,
    context?: Record<string, any>,
    options?: {
      maxRetries?: number;
      onError?: (error: FlashError) => void | Promise<void>;
      onRetry?: (error: FlashError, attempt: number) => void | Promise<void>;
      retryDelay?: number;
    }
  ): Promise<T> {
    const maxRetries = options?.maxRetries || 3;
    const retryDelay = options?.retryDelay || 1000;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        // Handle the error
        const flashError = this.handleError(error, context, {
          maxRetries,
          retryCount: attempt,
        });
        
        // Call onError callback
        if (options?.onError) {
          await options.onError(flashError);
        }
        
        // If we've reached max retries or the error is not retryable, rethrow
        if (
          attempt === maxRetries || 
          flashError.recoveryStrategy !== RecoveryStrategy.RETRY
        ) {
          throw flashError;
        }
        
        // Call onRetry callback
        if (options?.onRetry) {
          await options.onRetry(flashError, attempt);
        }
        
        // Wait before retrying with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // This should never be reached due to the throw in the catch block
    throw new Error('Unexpected error in withErrorHandling');
  }
}
