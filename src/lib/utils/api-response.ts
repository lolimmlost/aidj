/**
 * Consolidated API Response Utilities
 *
 * This module provides standardized response helpers for API routes,
 * ensuring consistent error handling, response formats, and HTTP status codes.
 */

import { z } from 'zod';
import { ServiceError } from '../utils';
import { errorHandler, ErrorContext } from './error-handling';

// Standard JSON response headers
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  code: string;
  message: string;
  errors?: z.ZodIssue[] | unknown[];
  details?: Record<string, unknown>;
}

/**
 * Standard API success response format
 */
export interface ApiSuccessResponse<T = unknown> {
  data?: T;
  success?: boolean;
  message?: string;
}

/**
 * HTTP status code mapping for common error codes
 */
const ERROR_CODE_TO_STATUS: Record<string, number> = {
  // Authentication errors - 401
  UNAUTHORIZED: 401,
  AUTHENTICATION_ERROR: 401,

  // Authorization errors - 403
  FORBIDDEN: 403,

  // Validation errors - 400
  VALIDATION_ERROR: 400,
  INVALID_INPUT: 400,
  MISSING_REQUIRED_FIELD: 400,
  INVALID_SONG_IDS: 400,
  MISSING_SONG_IDS: 400,

  // Not found errors - 404
  NOT_FOUND: 404,
  RESOURCE_NOT_FOUND: 404,

  // Conflict errors - 409
  DUPLICATE_FEEDBACK: 409,
  DUPLICATE_PLAYLIST_NAME: 409,
  CONFLICT: 409,

  // Service unavailable errors - 503
  SERVICE_UNAVAILABLE: 503,
  NAVIDROME_NOT_CONFIGURED: 503,
  LIDARR_NOT_CONFIGURED: 503,
  LASTFM_NOT_CONFIGURED: 503,

  // Rate limit errors - 429
  RATE_LIMIT_ERROR: 429,

  // Default server errors - 500
  GENERAL_API_ERROR: 500,
  INTERNAL_ERROR: 500,
};

/**
 * Get HTTP status code for an error code
 */
export function getStatusForErrorCode(code: string): number {
  return ERROR_CODE_TO_STATUS[code] || 500;
}

/**
 * Create a JSON response with standard headers
 */
export function jsonResponse<T>(body: T, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * Create a success response with data
 */
export function successResponse<T>(data: T, status: number = 200): Response {
  return jsonResponse({ data }, status);
}

/**
 * Create an error response with standardized format
 */
export function errorResponse(
  code: string,
  message: string,
  options?: {
    status?: number;
    errors?: z.ZodIssue[] | unknown[];
    details?: Record<string, unknown>;
  }
): Response {
  const status = options?.status || getStatusForErrorCode(code);
  const body: ApiErrorResponse = { code, message };

  if (options?.errors) {
    body.errors = options.errors;
  }

  if (options?.details) {
    body.details = options.details;
  }

  return jsonResponse(body, status);
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): Response {
  return errorResponse('UNAUTHORIZED', message, { status: 401 });
}

/**
 * Create a validation error response from Zod errors
 */
export function validationErrorResponse(
  error: z.ZodError,
  message: string = 'Validation failed'
): Response {
  return errorResponse('VALIDATION_ERROR', message, {
    status: 400,
    errors: error.issues,
  });
}

/**
 * Create a not found response
 */
export function notFoundResponse(message: string = 'Resource not found'): Response {
  return errorResponse('NOT_FOUND', message, { status: 404 });
}

/**
 * Create a service unavailable response
 */
export function serviceUnavailableResponse(
  code: string,
  message: string
): Response {
  return errorResponse(code, message, { status: 503 });
}

/**
 * Handle errors and create appropriate API response
 * This is the main error handler for API routes
 */
export function handleApiError(
  error: unknown,
  options?: {
    defaultCode?: string;
    defaultMessage?: string;
    context?: Partial<ErrorContext>;
    logPrefix?: string;
  }
): Response {
  const {
    defaultCode = 'GENERAL_API_ERROR',
    defaultMessage = 'An error occurred',
    context,
    logPrefix = 'API Error',
  } = options || {};

  // Log the error
  console.error(`${logPrefix}:`, error);

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    return validationErrorResponse(error);
  }

  // Handle ServiceError
  if (error instanceof ServiceError) {
    // Use the error handler for tracking and categorization
    if (context) {
      errorHandler.handleError(error, context);
    }

    return errorResponse(
      error.code,
      error.message,
      {
        details: error.details,
      }
    );
  }

  // Handle generic Error
  if (error instanceof Error) {
    // Use the error handler for tracking
    if (context) {
      errorHandler.handleError(error, context);
    }

    return errorResponse(defaultCode, error.message || defaultMessage);
  }

  // Handle unknown error types
  return errorResponse(defaultCode, defaultMessage);
}

/**
 * Type-safe wrapper for route handlers that provides consistent error handling
 *
 * @example
 * ```typescript
 * export const POST = withErrorHandling(
 *   async ({ request }) => {
 *     // ... handler logic
 *     return successResponse(result);
 *   },
 *   {
 *     service: 'recommendations',
 *     operation: 'generate',
 *     defaultCode: 'RECOMMENDATION_ERROR',
 *     defaultMessage: 'Failed to generate recommendations',
 *   }
 * );
 * ```
 */
export function withErrorHandling<T extends { request: Request }>(
  handler: (params: T) => Promise<Response>,
  options?: {
    service?: string;
    operation?: string;
    defaultCode?: string;
    defaultMessage?: string;
  }
): (params: T) => Promise<Response> {
  return async (params: T): Promise<Response> => {
    try {
      return await handler(params);
    } catch (error) {
      return handleApiError(error, {
        defaultCode: options?.defaultCode,
        defaultMessage: options?.defaultMessage,
        context: {
          service: options?.service,
          operation: options?.operation,
        },
        logPrefix: options?.operation
          ? `${options.service || 'API'}/${options.operation}`
          : options?.service || 'API',
      });
    }
  };
}

/**
 * Combined auth check and error handling wrapper
 * Provides both authentication and error handling in one wrapper
 *
 * @example
 * ```typescript
 * export const POST = withAuthAndErrorHandling(
 *   async ({ request, session }) => {
 *     // session is guaranteed to be valid here
 *     const userId = session.user.id;
 *     // ... handler logic
 *     return successResponse(result);
 *   },
 *   {
 *     service: 'preferences',
 *     operation: 'update',
 *   }
 * );
 * ```
 */
export function withAuthAndErrorHandling<T extends { request: Request }>(
  handler: (params: T & { session: NonNullable<Awaited<ReturnType<typeof import('../auth/auth').auth.api.getSession>>> }) => Promise<Response>,
  options?: {
    service?: string;
    operation?: string;
    defaultCode?: string;
    defaultMessage?: string;
  }
): (params: T) => Promise<Response> {
  return async (params: T): Promise<Response> => {
    try {
      // Dynamically import auth to avoid circular dependencies
      const { auth } = await import('../auth/auth');

      const session = await auth.api.getSession({
        headers: params.request.headers,
        query: { disableCookieCache: true },
      });

      if (!session) {
        return unauthorizedResponse();
      }

      return await handler({ ...params, session } as T & { session: NonNullable<typeof session> });
    } catch (error) {
      return handleApiError(error, {
        defaultCode: options?.defaultCode,
        defaultMessage: options?.defaultMessage,
        context: {
          service: options?.service,
          operation: options?.operation,
        },
        logPrefix: options?.operation
          ? `${options.service || 'API'}/${options.operation}`
          : options?.service || 'API',
      });
    }
  };
}

/**
 * Helper to require specific request body fields
 */
export function requireBodyFields<T extends Record<string, unknown>>(
  body: unknown,
  requiredFields: (keyof T)[]
): { valid: true; data: T } | { valid: false; response: Response } {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      response: errorResponse('INVALID_INPUT', 'Request body is required'),
    };
  }

  const data = body as T;
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missingFields.push(String(field));
    }
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      response: errorResponse(
        'MISSING_REQUIRED_FIELD',
        `Missing required fields: ${missingFields.join(', ')}`,
        { status: 400 }
      ),
    };
  }

  return { valid: true, data };
}
