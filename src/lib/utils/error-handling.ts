import { ServiceError } from '../utils';

// Add service property to ErrorDetails interface
export interface ErrorDetails {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: ErrorContext;
  originalError?: Error;
  retryable: boolean;
  suggestions: string[];
  service?: string; // Add this property
}

/**
 * Enhanced error handling utilities for edge cases and comprehensive error scenarios
 */

export interface ErrorContext {
  service?: string;
  operation?: string;
  userId?: string;
  timestamp: string;
  userAgent?: string;
  url?: string;
  stack?: string;
}

export interface ErrorDetails {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: ErrorContext;
  originalError?: Error;
  retryable: boolean;
  suggestions: string[];
}

/**
 * Comprehensive error handler for edge cases
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCounts: Map<string, number> = new Map();
  private errorTimestamps: Map<string, number[]> = new Map();

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle and categorize errors with comprehensive context
   */
  handleError(error: unknown, context: Partial<ErrorContext> = {}): ErrorDetails {
    const errorDetails = this.createErrorDetails(error, context);
    
    // Log error for monitoring
    this.logError(errorDetails);
    
    // Update error statistics
    this.updateErrorStats(errorDetails);
    
    // Check for error patterns
    this.checkErrorPatterns(errorDetails);
    
    return errorDetails;
  }

  /**
   * Create comprehensive error details
   */
  private createErrorDetails(error: unknown, context: Partial<ErrorContext>): ErrorDetails {
    const timestamp = new Date().toISOString();
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const url = typeof window !== 'undefined' ? window.location.href : 'unknown';

    const fullContext: ErrorContext = {
      timestamp,
      userAgent,
      url,
      ...context,
    };

    if (error instanceof ServiceError) {
      return {
        code: error.code,
        message: error.message,
        severity: this.categorizeSeverity(error.code),
        context: fullContext,
        originalError: error,
        retryable: this.isRetryable(error.code),
        suggestions: this.getSuggestionsForError(error.code),
        service: context.service,
      };
    }

    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        severity: 'medium',
        context: fullContext,
        originalError: error,
        retryable: true,
        suggestions: [
          'Please try again later',
          'Check your internet connection',
          'Contact support if the problem persists',
        ],
        service: context.service,
      };
    }

    // Handle non-Error objects
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      severity: 'high',
      context: fullContext,
      retryable: true,
      suggestions: [
        'Please try again later',
        'Check your internet connection',
        'Contact support if the problem persists',
      ],
      service: context.service,
    };

    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      severity: 'high',
      context: fullContext,
      retryable: true,
      suggestions: [
        'Please try again later',
        'Check your internet connection',
        'Contact support if the problem persists',
      ],
    };
  }

  /**
   * Categorize error severity
   */
  private categorizeSeverity(code: string): ErrorDetails['severity'] {
    const criticalErrors = [
      'AUTHENTICATION_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'RATE_LIMIT_ERROR',
      'SERVICE_UNAVAILABLE',
    ];

    const highErrors = [
      'LIDARR_CONFIG_ERROR',
      'NAVIDROME_CONFIG_ERROR',
      'ENCRYPTION_ERROR',
      'DECRYPTION_ERROR',
      'VALIDATION_ERROR',
    ];

    if (criticalErrors.includes(code)) {
      return 'critical';
    }

    if (highErrors.includes(code)) {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(code: string): boolean {
    const nonRetryableErrors = [
      'AUTHENTICATION_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'VALIDATION_ERROR',
      'NOT_FOUND',
    ];

    return !nonRetryableErrors.includes(code);
  }

  /**
   * Get suggestions for specific error codes
   */
  private getSuggestionsForError(code: string): string[] {
    const suggestions: Record<string, string[]> = {
      'LIDARR_CONFIG_ERROR': [
        'Check your Lidarr configuration',
        'Verify Lidarr URL and API key',
        'Ensure Lidarr service is running',
      ],
      'NAVIDROME_CONFIG_ERROR': [
        'Check your Navidrome configuration',
        'Verify Navidrome credentials',
        'Ensure Navidrome service is running',
      ],
      'NETWORK_ERROR': [
        'Check your internet connection',
        'Try again in a moment',
        'Check if services are accessible',
      ],
      'TIMEOUT_ERROR': [
        'Try again with a better connection',
        'Reduce the number of concurrent requests',
        'Check service response times',
      ],
      'RATE_LIMIT_ERROR': [
        'Wait before making more requests',
        'Reduce request frequency',
        'Implement request throttling',
      ],
      'AUTHENTICATION_ERROR': [
        'Check your credentials',
        'Re-authenticate if necessary',
        'Contact support if issues persist',
      ],
      'SERVICE_UNAVAILABLE': [
        'Try again later',
        'Check service status',
        'Contact service provider',
      ],
    };

    return suggestions[code] || [
      'Please try again later',
      'Check your internet connection',
      'Contact support if the problem persists',
    ];
  }

  /**
   * Log error for monitoring and debugging
   */
  private logError(errorDetails: ErrorDetails): void {
    // In a production environment, this would send to a logging service
    console.error('Error occurred:', {
      code: errorDetails.code,
      message: errorDetails.message,
      severity: errorDetails.severity,
      context: errorDetails.context,
      suggestions: errorDetails.suggestions,
    });

    // Log to console with different levels based on severity
    if (errorDetails.severity === 'critical') {
      console.error(`[CRITICAL] ${errorDetails.code}: ${errorDetails.message}`);
    } else if (errorDetails.severity === 'high') {
      console.error(`[HIGH] ${errorDetails.code}: ${errorDetails.message}`);
    } else if (errorDetails.severity === 'medium') {
      console.warn(`[MEDIUM] ${errorDetails.code}: ${errorDetails.message}`);
    } else {
      console.info(`[LOW] ${errorDetails.code}: ${errorDetails.message}`);
    }
  }

  /**
   * Update error statistics for pattern detection
   */
  private updateErrorStats(errorDetails: ErrorDetails): void {
    const key = `${errorDetails.code}_${errorDetails.service || 'unknown'}`;
    
    // Update error count
    const currentCount = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, currentCount + 1);

    // Update error timestamps
    const timestamps = this.errorTimestamps.get(key) || [];
    timestamps.push(Date.now());
    
    // Keep only last 100 timestamps
    if (timestamps.length > 100) {
      timestamps.shift();
    }
    
    this.errorTimestamps.set(key, timestamps);
  }

  /**
   * Check for error patterns and alert if needed
   */
  private checkErrorPatterns(errorDetails: ErrorDetails): void {
    const key = `${errorDetails.code}_${errorDetails.service || 'unknown'}`;
    const count = this.errorCounts.get(key) || 0;
    const timestamps = this.errorTimestamps.get(key) || [];

    // Check for rapid error bursts
    if (timestamps.length >= 5) {
      const recentTimestamps = timestamps.slice(-5);
      const timeSpan = recentTimestamps[recentTimestamps.length - 1] - recentTimestamps[0];
      
      if (timeSpan < 60000) { // 5 errors in less than 60 seconds
        console.warn(`Error burst detected: ${count} errors in ${timeSpan}ms for ${key}`);
        // In production, this would trigger an alert
      }
    }

    // Check for high error rates
    if (count >= 10) {
      console.warn(`High error rate detected: ${count} errors for ${key}`);
      // In production, this would trigger an alert
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Record<string, { count: number; rate: number }> {
    const stats: Record<string, { count: number; rate: number }> = {};
    const now = Date.now();

    for (const [key, timestamps] of this.errorTimestamps.entries()) {
      const count = timestamps.length;
      
      // Calculate rate (errors per minute)
      const recentTimestamps = timestamps.filter(timestamp => now - timestamp < 60000);
      const rate = recentTimestamps.length;

      stats[key] = { count, rate };
    }

    return stats;
  }

  /**
   * Reset error statistics
   */
  resetErrorStats(): void {
    this.errorCounts.clear();
    this.errorTimestamps.clear();
  }

  /**
   * Handle network-related errors with retry logic
   */
  async handleWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const errorDetails = this.handleError(lastError, {
          ...context,
          operation: context?.operation || 'retry-operation',
        });

        // Don't retry non-retryable errors
        if (!errorDetails.retryable) {
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    throw lastError ?? new Error('Retry failed with no error');
  }

  /**
   * Handle graceful degradation when services are unavailable
   */
  async handleWithFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    try {
      return await primaryOperation();
    } catch (error) {
      const errorDetails = this.handleError(error, {
        ...context,
        operation: context?.operation || 'fallback-operation',
      });

      console.warn(`Primary operation failed, using fallback: ${errorDetails.message}`);

      try {
        return await fallbackOperation();
      } catch (fallbackError) {
        const fallbackErrorDetails = this.handleError(fallbackError, {
          ...context,
          operation: context?.operation ? `${context.operation}-fallback` : 'fallback-operation',
        });

        // Combine error information
        throw new ServiceError('ALL_OPERATIONS_FAILED', 
          `Primary operation failed: ${errorDetails.message}. Fallback operation also failed: ${fallbackErrorDetails.message}`
        );
      }
    }
  }

  /**
   * Validate input with comprehensive error handling
   */
  validateInput(
    input: unknown,
    rules: {
      required?: boolean;
      type?: string;
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
      custom?: (value: unknown) => boolean | string;
    },
    fieldName: string
  ): void {
    const errors: string[] = [];

    if (rules.required && (input === undefined || input === null || input === '')) {
      errors.push(`${fieldName} is required`);
    }

    if (input !== undefined && input !== null && input !== '') {
      if (rules.type && typeof input !== rules.type) {
        errors.push(`${fieldName} must be of type ${rules.type}`);
      }

      if (rules.minLength && typeof input === 'string' && input.length < rules.minLength) {
        errors.push(`${fieldName} must be at least ${rules.minLength} characters long`);
      }

      if (rules.maxLength && typeof input === 'string' && input.length > rules.maxLength) {
        errors.push(`${fieldName} must be no more than ${rules.maxLength} characters long`);
      }

      if (rules.pattern && typeof input === 'string' && !rules.pattern.test(input)) {
        errors.push(`${fieldName} format is invalid`);
      }

      if (rules.custom) {
        const customResult = rules.custom(input);
        if (typeof customResult === 'string') {
          errors.push(customResult);
        } else if (!customResult) {
          errors.push(`${fieldName} is invalid`);
        }
      }
    }

    if (errors.length > 0) {
      throw new ServiceError('VALIDATION_ERROR', errors.join(', '));
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();

// Export convenience functions
export const handleError = (error: unknown, context?: Partial<ErrorContext>) => 
  errorHandler.handleError(error, context);

export const handleWithRetry = <T>(
  operation: () => Promise<T>,
  maxRetries?: number,
  delay?: number,
  context?: Partial<ErrorContext>
) => 
  errorHandler.handleWithRetry(operation, maxRetries, delay, context);

export const handleWithFallback = <T>(
  primaryOperation: () => Promise<T>,
  fallbackOperation: () => Promise<T>,
  context?: Partial<ErrorContext>
) => 
  errorHandler.handleWithFallback(primaryOperation, fallbackOperation, context);

export const validateInput = (
  input: unknown,
  rules: Parameters<ErrorHandler['validateInput']>[1],
  fieldName: string
) => 
  errorHandler.validateInput(input, rules, fieldName);