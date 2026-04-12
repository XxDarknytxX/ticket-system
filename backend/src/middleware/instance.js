/**
 * Instance middleware — reads instance name from URL path prefix.
 *
 * URL patterns:
 *   /api/...          → "production" instance
 *   /test/api/...     → "test" instance
 *   /{name}/api/...   → "{name}" instance
 *
 * Attaches:
 *   req.instancePool  — MySQL pool for the resolved instance DB
 *   req.instanceName  — string name of the instance (e.g. "production", "test")
 *   req.sharedPool    — MySQL pool for the shared DB (database_instances, super_admins)
 */
export function instanceMiddleware(poolManager) {
  return async (req, res, next) => {
    try {
      // Instance name is set by the Express route param :instance
      // or defaults to "production"
      const instanceName = req.params.instance || "production";

      // Verify instance exists
      const info = await poolManager.getInstanceInfo(instanceName);
      if (!info) {
        return res.status(404).json({ error: `Instance '${instanceName}' not found` });
      }

      req.instanceName = instanceName;
      req.instancePool = await poolManager.getInstancePool(instanceName);
      req.sharedPool = await poolManager.getSharedPool();
      next();
    } catch (err) {
      console.error("Instance middleware error:", err.message);
      return res.status(500).json({ error: "Failed to resolve database instance" });
    }
  };
}
