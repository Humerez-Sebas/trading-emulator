/**
 * Converts a hex color string to an rgba() CSS value.
 * Accepts 6-digit hex with or without the leading '#'.
 */
export function hexToRgba(hex: string, alpha: number): string {
    const v = hex.replace('#', '');
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
