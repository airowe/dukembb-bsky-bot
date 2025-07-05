// Utility to decode HTML entities in tweet text using html-entities package
import { decode } from 'html-entities';

export function htmlDecode(text: string): string {
  if (!text) return '';
  return decode(text);
}

