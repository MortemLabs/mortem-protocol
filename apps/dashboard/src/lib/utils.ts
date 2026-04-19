// Shared UI utilities keep class composition and formatting consistent across dashboard components.
// Helpers in this file must stay dependency-light because they are used in both server and client components.
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) {
    return address
  }

  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}
