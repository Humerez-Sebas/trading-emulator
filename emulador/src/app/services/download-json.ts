/**
 * Triggers a browser download of `payload` as pretty-printed JSON. Shared by the
 * `.playbook.json` and `.lessons.json` exports (RFC-015/016 §3); the callers keep
 * a thin instance method of the same name so specs can spy on it.
 */
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
