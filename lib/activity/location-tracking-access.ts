import { canViewLocationTracking } from "@/lib/permissions";

export { canViewLocationTracking };

export function sessionCanViewLocationTracking(session: {
  user: { role: string; specialPermissions?: string[] };
}): boolean {
  return canViewLocationTracking(session.user.role, session.user.specialPermissions);
}
