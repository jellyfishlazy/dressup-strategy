// Use standard resolution from the repository's npm workspace installation.
export async function importOpencc() {
  return import('opencc-js');
}
