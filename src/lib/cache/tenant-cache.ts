interface CacheItem<T> {
  value: T;
  workspaceId: string;
  expiresAt: number;
}

/**
 * Tenant-Isolated In-Memory Cache.
 * Strictly guarantees that cache keys are namespaced by workspace_id
 * to prevent cross-tenant data leaks and cache poisoning.
 */
class TenantCache {
  private store = new Map<string, CacheItem<unknown>>();

  /**
   * Generates an isolated, namespaced tenant cache key.
   * Format: `workspace:{workspaceId}:{category}:{key}`
   */
  public buildKey(workspaceId: string, category: string, key: string): string {
    if (!workspaceId || !workspaceId.trim()) {
      throw new Error(
        "TenantCache: workspaceId is strictly required for cache key generation",
      );
    }
    const cleanWs = workspaceId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanCat = category.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const cleanKey = key.trim().replace(/[^a-zA-Z0-9_-]/g, "");

    return `workspace:${cleanWs}:${cleanCat}:${cleanKey}`;
  }

  /**
   * Retrieves a cached value for the specified workspace.
   * Verifies workspace ownership and expiration.
   */
  public get<T>(workspaceId: string, category: string, key: string): T | null {
    const fullKey = this.buildKey(workspaceId, category, key);
    const item = this.store.get(fullKey);

    if (!item) return null;

    // Verify tenant ownership
    if (item.workspaceId !== workspaceId) {
      this.store.delete(fullKey);
      throw new Error(
        "TenantCache: Cross-tenant cache boundary violation detected",
      );
    }

    // Check expiration
    if (Date.now() > item.expiresAt) {
      this.store.delete(fullKey);
      return null;
    }

    return item.value as T;
  }

  /**
   * Sets a value in the tenant cache with a mandatory TTL.
   */
  public set<T>(
    workspaceId: string,
    category: string,
    key: string,
    value: T,
    ttlSeconds: number = 60,
  ): void {
    const fullKey = this.buildKey(workspaceId, category, key);
    const ttlMs = ttlSeconds <= 0 ? -1000 : ttlSeconds * 1000;

    this.store.set(fullKey, {
      value,
      workspaceId,
      expiresAt: Date.now() + ttlMs,
    });

    // Cleanup expired entries periodically if size exceeds threshold
    if (this.store.size > 2000) {
      const now = Date.now();
      for (const [k, v] of this.store.entries()) {
        if (v.expiresAt < now) {
          this.store.delete(k);
        }
      }
    }
  }

  /**
   * Invalidates all cached entries for a given workspace (or a specific category within it).
   */
  public invalidate(workspaceId: string, category?: string): void {
    if (!workspaceId) return;

    const prefix = category
      ? `workspace:${workspaceId}:${category}:`
      : `workspace:${workspaceId}:`;

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clears the entire store (for test suite isolation).
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * Returns current active entry count (for diagnostic tests).
   */
  public size(): number {
    return this.store.size;
  }
}

export const tenantCache = new TenantCache();
