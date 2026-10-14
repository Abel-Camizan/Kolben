import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { Usuario } from './models';

export const API_URL = 'http://localhost:3000/api';

const CLAVE_SESION = 'kolben_sesion';

interface Sesion {
  token: string;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly sesion = signal<Sesion | null>(this.leerSesion());

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);

  get token(): string | null {
    return this.sesion()?.token ?? null;
  }

  login(usuario: string, password: string) {
    return this.http.post<Sesion>(`${API_URL}/auth/login`, { usuario, password }).pipe(
      tap((sesion) => {
        this.sesion.set(sesion);
        localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
      }),
    );
  }

  logout() {
    this.sesion.set(null);
    localStorage.removeItem(CLAVE_SESION);
    this.router.navigate(['/login']);
  }

  private leerSesion(): Sesion | null {
    try {
      const guardada = localStorage.getItem(CLAVE_SESION);
      return guardada ? (JSON.parse(guardada) as Sesion) : null;
    } catch {
      return null;
    }
  }
}
