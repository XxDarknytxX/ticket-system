/**
 * Instance middleware — attaches the correct instance pool to req.instancePool.
 * req.pool remains the shared pool (users, settings, teams, audit_logs).
 *
 * Must run AFTER requireAuth so req.user is available.
 */
export function instanceMiddleware(poolManager) {
  return async (req, _res, next) => {
    try {
      req.instancePool = await poolManager.getActiveInstancePool();
      next();
    } catch (err) {
      console.error("Instance middleware error:", err.message);
      // Fall back to shared pool so the app doesn't crash
      req.instancePool = await poolManager.getSharedPool();
      next();
    }
  };
}
