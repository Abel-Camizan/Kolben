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

export interface DatosRegistro {
  nombre: string;
  usuario: string;
  password: string;
  documento?: string;
  telefono?: string;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly sesion = signal<Sesion | null>(this.leerSesion());

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly esCliente = computed(() => this.usuario()?.rol === 'cliente');
  readonly esAdmin = computed(() => this.usuario()?.rol === 'administrador');
  // Administrador o vendedor: los que atienden el mostrador y los pedidos
  readonly esPersonal = computed(() => this.autenticado() && !this.esCliente());

  get token(): string | null {
    return this.sesion()?.token ?? null;
  }

  login(usuario: string, password: string) {
    return this.http
      .post<Sesion>(`${API_URL}/auth/login`, { usuario, password })
      .pipe(tap((sesion) => this.guardar(sesion)));
  }

  // Registro público: crea una cuenta de cliente y deja la sesión iniciada
  registrar(datos: DatosRegistro) {
    return this.http
      .post<Sesion>(`${API_URL}/auth/registro`, datos)
      .pipe(tap((sesion) => this.guardar(sesion)));
  }

  logout() {
    this.sesion.set(null);
    localStorage.removeItem(CLAVE_SESION);
    this.router.navigate(['/login']);
  }

  private guardar(sesion: Sesion) {
    this.sesion.set(sesion);
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
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
