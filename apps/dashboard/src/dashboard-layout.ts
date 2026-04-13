export function getGridColumns(count: number, density: "compact" | "comfortable"): number {
  if (count <= 1) {
    return 1;
  }
  if (count <= 2) {
    return 2;
  }
  if (count <= 4) {
    return 2;
  }
  if (count <= 6) {
    return density === "compact" ? 4 : 3;
  }
  return density === "compact" ? 5 : 4;
}
