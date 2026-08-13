/**
 * Next.js instrumentation — warms the role-permission cache on server start.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { refreshRolePermissionCache } = await import("@/lib/role-permission-cache");
    try {
      await refreshRolePermissionCache();
    } catch (err) {
      // Local build / missing DATABASE_URL — cache falls back to ROLE_PERMISSIONS in code.
      console.warn("[instrumentation] role-permission cache warm skipped:", err);
    }
  }
}
