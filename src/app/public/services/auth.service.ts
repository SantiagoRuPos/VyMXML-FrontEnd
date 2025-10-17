// src/app/core/auth/auth.service.ts
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, tap } from 'rxjs';
import { API_URL } from '../../core/config/api-url.token';

const TOKEN_KEY = 'auth_token';
const EXP_KEY   = 'auth_token_exp';
const USER_KEY  = 'auth_user';

export interface UsuarioSafe {
  id: string;
  correo: string;
  nombreCompleto?: string;
  tipoIdentificacion?: string;
  numeroId?: string;
}
export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UsuarioSafe;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private api  = inject(API_URL);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private token$ = new BehaviorSubject<string | null>(this.readValidTokenOrNull());
  private user$  = new BehaviorSubject<UsuarioSafe | null>(this.readUserOrNull());

  readonly isLoggedIn$ = this.token$.pipe(map(t => !!t));
  readonly currentUser$ = this.user$.asObservable();

  login(body: { correo: string; contrasena: string; }) {
    return this.http.post<LoginResponse>(`${this.api}/auth/login`, body).pipe(
      tap(res => {
        this.setToken(res.accessToken, res.expiresIn);
        this.setUser(res.user);
      }),
      map(res => res.user),
    );
  }

  getToken(): string | null { return this.token$.value; }
  getUserSnapshot(): UsuarioSafe | null { return this.user$.value; }

  // --------- privados ---------
  private setToken(token: string, expSec: number) {
    const expMs = Date.now() + expSec * 1000;
    if (this.isBrowser) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(EXP_KEY, String(expMs));
    }
    this.token$.next(token);
  }
  private setUser(u: UsuarioSafe | null) {
    if (this.isBrowser) {
      if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
      else   localStorage.removeItem(USER_KEY);
    }
    this.user$.next(u);
  }
  private readValidTokenOrNull(): string | null {
    if (!this.isBrowser) return null;
    const t = localStorage.getItem(TOKEN_KEY);
    const exp = Number(localStorage.getItem(EXP_KEY) || 0);
    if (!t || !exp || Date.now() >= exp) { 
      localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EXP_KEY); 
      return null; 
    }
    return t;
  }
  private readUserOrNull(): UsuarioSafe | null {
    if (!this.isBrowser) return null;
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }

  /** (Opcional) Decodificar payload del JWT si necesitas claims extra */
  decodeTokenPayload(): any | null {
    const token = this.getToken();
    if (!token) return null;
    const [, payload] = token.split('.');
    if (!payload) return null;
    // base64url -> base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    try {
      const json = (typeof atob !== 'undefined')
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('binary');
      return JSON.parse(decodeURIComponent([...json].map(c => {
        const code = c.charCodeAt(0).toString(16).padStart(2, '0');
        return `%${code}`;
      }).join('')));
    } catch { return null; }
  }


  // src/app/core/auth/auth.service.ts
logout(options?: { clearRemember?: boolean; extraKeys?: string[] }): void {
  const { clearRemember = false, extraKeys = [] } = options ?? {};

  // Limpia estado en memoria
  this.user$.next(null);
  this.token$.next(null);

  // Limpia almacenamiento (solo en browser)
  if (this.isBrowser) {
    // Claves temporales por defecto + extras que quieras purgar
    const keys = [
      'auth_token',          // TOKEN_KEY
      'auth_token_exp',      // EXP_KEY
      'auth_user',           // USER_KEY
      'vm_session',          // tu sesión simulada previa
      ...extraKeys,
    ];

    if (clearRemember) {
      // si quieres borrar también el email recordado
      keys.push('vm_remember_email');
    }

    for (const k of keys) {
      try { localStorage.removeItem(k); } catch {}
      try { sessionStorage.removeItem(k); } catch {}
    }
  }
}

}
