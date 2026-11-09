import presets from '../../data/staff-role-presets.json';
export const permissions = presets.SUPERADMIN.permissions as readonly string[];
export type Grant = { permission: string; branchId: string | null };
export function allows(grants: Grant[], permission: string, branchId?: string | null) {
 return grants.some(g=>g.permission===permission&&(g.branchId===null||branchId!==undefined&&branchId!==null&&g.branchId===branchId));
}
export function scopedBranches(grants: Grant[],permission: string): string[] | null {
 if(grants.some(g=>g.permission===permission&&g.branchId===null))return null;
 return [...new Set(grants.filter(g=>g.permission===permission&&g.branchId!==null).map(g=>g.branchId!))];
}
