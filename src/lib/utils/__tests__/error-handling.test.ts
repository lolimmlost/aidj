import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorHandler, handleError, handleWithRetry, handleWithFallback, validateInput } from '../error-handling';
import { ServiceError } from '../../utils';

// Mock console methods

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = ErrorHandler.getInstance();
    vi.clearAllMocks();
  });

  describe('handleError', () => {
    it('should handle ServiceError correctly', () => {
      const serviceError = new ServiceError('TEST_ERROR', 'Test error message');
      const context = { service: 'test-service', operation: 'test-operation' };

      const result = errorHandler.handleError(serviceError, context);

      expect(result.code).toBe('TEST_ERROR');
      expect(result.message).toBe('Test error message');
      expect(result.severity).toBe('medium');
      expect(result.context.service).toBe('test-service');
      expect(result.context.operation).toBe('test-operation');
      expect(result.retryable).toBe(true);
      expect(result.suggestions).toBeDefined();
    });

    it('should handle Error objects', () => {
      const error = new Error('Generic error');
      const context = { service: 'test-service' };

      const result = errorHandler.handleError(error, context);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('Generic error');
      expect(result.severity).toBe('medium');
      expect(result.context.service).toBe('test-service');
      expect(result.retryable).toBe(true);
    });

    it('should handle unknown error types', () => {
      const error = 'string error';
      const context = { service: 'test-service' };

      const result = errorHandler.handleError(error, context);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('An unknown error occurred');
      expect(result.severity).toBe('high');
      expect(result.context.service).toBe('test-service');
      expect(result.retryable).toBe(true);
    });

    it('should categorize severity correctly', () => {
      const criticalError = new ServiceError('AUTHENTICATION_ERROR', 'Auth error');
      const highError = new ServiceError('LIDARR_CONFIG_ERROR', 'Config error');
      const mediumError = new ServiceError('NETWORK_ERROR', 'Network error');

      expect(errorHandler.handleError(criticalError).severity).toBe('critical');
      expect(errorHandler.handleError(highError).severity).toBe('high');
      expect(errorHandler.handleError(mediumError).severity).toBe('medium');
    });

    it('should determine retryability correctly', () => {
      const retryableError = new ServiceError('NETWORK_ERROR', 'Network error');
      const nonRetryableError = new ServiceError('AUTHENTICATION_ERROR', 'Auth error');

      expect(errorHandler.handleError(retryableError).retryable).toBe(true);
      expect(errorHandler.handleError(nonRetryableError).retryable).toBe(false);
    });

    it('should provide appropriate suggestions', () => {
      const lidarrError = new ServiceError('LIDARR_CONFIG_ERROR', 'Lidarr config error');
      const networkError = new ServiceError('NETWORK_ERROR', 'Network error');

      const lidarrSuggestions = errorHandler.handleError(lidarrError).suggestions;
      const networkSuggestions = errorHandler.handleError(networkError).suggestions;

      expect(lidarrSuggestions).toContain('Check your Lidarr configuration');
      expect(networkSuggestions).toContain('Check your internet connection');
    });
  });

  describe('handleWithRetry', () => {
    it('should retry failed operations', async () => {
      let attemptCount = 0;
      const operation = vi.fn()
        .mockImplementationOnce(() => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Failed');
          }
          return 'success';
        });

      const result = await errorHandler.handleWithRetry(operation, 3, 100);

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new ServiceError('AUTHENTICATION_ERROR', 'Auth error'));

      await expect(errorHandler.handleWithRetry(operation, 3, 100)).rejects.toThrow('Auth error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect max retries limit', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(errorHandler.handleWithRetry(operation, 2, 100)).rejects.toThrow('Always fails');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'));
      const startTime = Date.now();

      await expect(errorHandler.handleWithRetry(operation, 2, 100)).rejects.toThrow();
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 100ms (first retry) + 200ms (second retry with exponential backoff)
      expect(duration).toBeGreaterThanOrEqual(250);
    });
  });

  describe('handleWithFallback', () => {
    it('should use primary operation when successful', async () => {
      const primaryOperation = vi.fn().mockResolvedValue('primary-success');
      const fallbackOperation = vi.fn().mockResolvedValue('fallback-success');

      const result = await errorHandler.handleWithFallback(primaryOperation, fallbackOperation);

      expect(result).toBe('primary-success');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).not.toHaveBeenCalled();
    });

    it('should use fallback when primary fails', async () => {
      const primaryOperation = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackOperation = vi.fn().mockResolvedValue('fallback-success');

      const result = await errorHandler.handleWithFallback(primaryOperation, fallbackOperation);

      expect(result).toBe('fallback-success');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
    });

    it('should throw combined error when both operations fail', async () => {
      const primaryOperation = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackOperation = vi.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(errorHandler.handleWithFallback(primaryOperation, fallbackOperation))
        .rejects.toThrow('Primary operation failed: Primary failed. Fallback operation also failed: Fallback failed');
    });
  });

  describe('validateInput', () => {
    it('should validate required fields', () => {
      expect(() => errorHandler.validateInput(null, { required: true }, 'test-field')).toThrow('test-field is required');
      expect(() => errorHandler.validateInput(undefined, { required: true }, 'test-field')).toThrow('test-field is required');
      expect(() => errorHandler.validateInput('', { required: true }, 'test-field')).toThrow('test-field is required');
    });

    it('should validate type', () => {
      expect(() => errorHandler.validateInput('string', { type: 'number' }, 'test-field')).toThrow('test-field must be of type number');
      expect(() => errorHandler.validateInput(123, { type: 'string' }, 'test-field')).toThrow('test-field must be of type string');
    });

    it('should validate string length', () => {
      expect(() => errorHandler.validateInput('short', { minLength: 10 }, 'test-field')).toThrow('test-field must be at least 10 characters long');
      expect(() => errorHandler.validateInput('this-string-is-too-long', { maxLength: 10 }, 'test-field')).toThrow('test-field must be no more than 10 characters long');
    });

    it('should validate regex pattern', () => {
      expect(() => errorHandler.validateInput('invalid-email', { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }, 'test-field')).toThrow('test-field format is invalid');
      expect(() => errorHandler.validateInput('valid@email.com', { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }, 'test-field')).not.toThrow();
    });

    it('should validate custom rules', () => {
      expect(() => errorHandler.validateInput('test', { 
        custom: (value) => typeof value === 'string' && value.length > 5 
      }, 'test-field')).toThrow('test-field is invalid');

      expect(() => errorHandler.validateInput('valid-test', { 
        custom: (value) => typeof value === 'string' && value.length > 5 
      }, 'test-field')).not.toThrow();
    });

    it('should return custom error messages', () => {
      expect(() => errorHandler.validateInput('test', { 
        custom: () => 'Custom error message'
      }, 'test-field')).toThrow('Custom error message');
    });

    it('should pass validation when all rules are satisfied', () => {
      expect(() => errorHandler.validateInput('valid@email.com', {
        required: true,
        type: 'string',
        minLength: 5,
        maxLength: 50,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      }, 'test-field')).not.toThrow();
    });
  });

  describe('error statistics', () => {
    it('should track error counts', () => {
      errorHandler.handleError(new ServiceError('TEST_ERROR', 'Test error'), { service: 'test-service' });
      errorHandler.handleError(new ServiceError('TEST_ERROR', 'Test error'), { service: 'test-service' });
      errorHandler.handleError(new ServiceError('OTHER_ERROR', 'Other error'), { service: 'test-service' });

      const stats = errorHandler.getErrorStats();
      expect(stats['TEST_ERROR_test-service'].count).toBe(2);
      expect(stats['OTHER_ERROR_test-service'].count).toBe(1);
    });

    it('should calculate error rates', () => {
      // Simulate some errors
      errorHandler.handleError(new ServiceError('TEST_ERROR', 'Test error'), { service: 'test-service' });
      
      const stats = errorHandler.getErrorStats();
      expect(stats['TEST_ERROR_test-service']).toBeDefined();
      expect(stats['TEST_ERROR_test-service'].rate).toBeDefined();
    });

    it('should reset error statistics', () => {
      errorHandler.handleError(new ServiceError('TEST_ERROR', 'Test error'), { service: 'test-service' });
      errorHandler.resetErrorStats();

      const stats = errorHandler.getErrorStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ErrorHandler.getInstance();
      const instance2 = ErrorHandler.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleError should work with ErrorHandler', () => {
    const error = new ServiceError('TEST_ERROR', 'Test error');
    const result = handleError(error, { service: 'test' });

    expect(result.code).toBe('TEST_ERROR');
    expect(result.message).toBe('Test error');
  });

  it('handleWithRetry should work with ErrorHandler', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await handleWithRetry(operation, 3, 100);

    expect(result).toBe('success');
  });

  it('handleWithFallback should work with ErrorHandler', async () => {
    const primary = vi.fn().mockResolvedValue('primary');
    const fallback = vi.fn().mockResolvedValue('fallback');
    const result = await handleWithFallback(primary, fallback);

    expect(result).toBe('primary');
  });

  it('validateInput should work with ErrorHandler', () => {
    expect(() => validateInput('test', { required: true }, 'field')).not.toThrow();
    expect(() => validateInput(null, { required: true }, 'field')).toThrow('field is required');
  });
});