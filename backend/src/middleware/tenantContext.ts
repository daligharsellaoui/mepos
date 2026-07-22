import { Request, Response, NextFunction } from 'express';

/**
 * Tenant Context Middleware
 *
 * Extracts tenant_id from the authenticated user's JWT token and injects it
 * into the request object as req.tenantId. This middleware MUST be placed
 * AFTER the auth middleware (jwtAuthMiddleware or authMiddleware).
 *
 * Usage:
 *   app.use('/api/v1/protected', jwtAuthMiddleware, tenantContextMiddleware, router);
 *
 * The tenant_id is used by all downstream services to scope queries to the
 * correct tenant, ensuring complete data isolation in multi-tenant mode.
 *
 * For platform_admin users (who are NOT tied to a tenant), tenantId will be null.
 * Platform admin endpoints should handle this case explicitly.
 */

// Extend Express Request to include tenantId
declare global {
  namespace Express {
    interface Request {
      tenantId?: number | null;
      user?: {
        id: number;
        username: string;
        role: string;
        tenantId?: number;
      };
    }
  }
}

/**
 * Middleware: extracts tenant_id from JWT payload and attaches to request.
 *
 * If the JWT contains a tenantId field, it is used directly.
 * If the user is a platform_admin, tenantId is set to null.
 * If no tenantId is found (legacy token), tenantId defaults to 1
 * (the default tenant) for backward compatibility.
 */
export function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;

  if (!user) {
    // API key authentication doesn't set req.user.
    // In this case, skip tenant context — API key requests are
    // machine-to-machine (agents, simulator) and will be scoped
    // at the service level using the agent's registered tenant_id.
    req.tenantId = 1; // Default tenant for API key requests
    return next();
  }

  // Platform admins are not scoped to a tenant
  if (user.role === 'platform_admin') {
    req.tenantId = null;
    return next();
  }

  // Extract tenant_id from JWT payload
  if (user.tenantId) {
    req.tenantId = user.tenantId;
  } else {
    // Backward compatibility: legacy tokens without tenantId
    // Default to tenant 1 (the default tenant created during migration)
    req.tenantId = 1;
  }

  next();
}

/**
 * Helper: get the current tenant ID from request.
 * Throws if called outside a tenant-scoped context.
 */
export function getTenantId(req: Request): number {
  if (req.tenantId === undefined || req.tenantId === null) {
    throw new Error(
      'Tenant context not available. Ensure tenantContextMiddleware is applied.'
    );
  }
  return req.tenantId;
}

/**
 * Helper: get the current tenant ID, returning a default value if unavailable.
 * Useful for optional tenant scoping (e.g., public endpoints).
 */
export function getTenantIdOrFallback(
  req: Request,
  fallback: number = 1
): number {
  return req.tenantId ?? fallback;
}

/**
 * Helper: check if the current user is a platform admin.
 */
export function isPlatformAdmin(req: Request): boolean {
  return req.user?.role === 'platform_admin';
}
