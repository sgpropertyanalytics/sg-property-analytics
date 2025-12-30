export function getPercentile(arr, p) {
  const index = Math.ceil((p / 100) * arr.length) - 1;
  return arr[Math.max(0, index)];
}
