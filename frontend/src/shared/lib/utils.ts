import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Объединяет условные class names и разрешает конфликты Tailwind utilities.
 *
 * @param inputs Строки и условные значения в формате, поддерживаемом `clsx`.
 * @returns Нормализованная строка классов, где более поздний Tailwind utility
 * переопределяет конфликтующий ранний.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
