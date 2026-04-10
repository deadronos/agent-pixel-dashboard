export function toggleSelectedGroupId(currentGroupId: string | null, nextGroupId: string): string | null {
  return currentGroupId === nextGroupId ? null : nextGroupId;
}
