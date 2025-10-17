import { InjectionToken } from '@angular/core';

export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => {
    const fromMeta = (import.meta as any).env?.NG_APP_API_URL;
    const fromProc = typeof process !== 'undefined' ? (process as any).env?.NG_APP_API_URL : undefined;
    const fromWin  = typeof window  !== 'undefined' ? (window as any).env?.API_URL : undefined;
    return fromMeta ?? fromProc ?? fromWin ?? 'http://localhost:6824';
  }
});
