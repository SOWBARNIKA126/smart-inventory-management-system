export type AppRole = "ADMIN" | "MANAGER" | "STAFF";
export type Permission = "dashboard" | "catalog:read" | "catalog:write" | "inventory:read" | "inventory:write" | "inventory:adjust" | "orders" | "billing" | "sales" | "forecasting" | "alerts" | "suppliers" | "reports" | "users" | "settings";

const staffPermissions = new Set<Permission>(["dashboard", "catalog:read", "inventory:read", "inventory:write", "orders", "billing"]);
export function hasPermission(role: AppRole, permission: Permission): boolean {
  if (role === "ADMIN") return true;
  if (role === "MANAGER") return permission !== "users" && permission !== "settings";
  return staffPermissions.has(permission);
}
