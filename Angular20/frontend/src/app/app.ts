import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { Carrito } from './core/carrito';
import { Icono } from './shared/icono';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icono],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(Auth);
  protected readonly carrito = inject(Carrito);

  // Menú lateral desplegable en pantallas pequeñas
  protected readonly menuAbierto = signal(false);

  protected iniciales(nombre: string): string {
    return nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }
}
