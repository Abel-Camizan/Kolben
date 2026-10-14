import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Carrito } from '../core/carrito';
import { ItemCatalogo, Modelo } from '../core/models';
import { Icono } from '../shared/icono';

@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, Icono],
  templateUrl: './catalogo.html',
})
export class Catalogo {
  private readonly api = inject(Api);
  protected readonly carrito = inject(Carrito);
  protected readonly auth = inject(Auth);

  protected readonly modelos = signal<Modelo[]>([]);
  protected readonly resultados = signal<ItemCatalogo[]>([]);
  protected readonly error = signal('');

  protected texto = '';
  protected modeloId: number | null = null;
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.api.catalogoModelos().subscribe((m) => this.modelos.set(m));
    this.buscar();
  }

  protected buscarConRetraso() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.buscar(), 300);
  }

  protected elegirModelo(id: number | null) {
    this.modeloId = id;
    this.buscar();
  }

  protected buscar() {
    this.error.set('');
    this.api.catalogo(this.texto, this.modeloId).subscribe({
      next: (r) => this.resultados.set(r),
      error: () => this.error.set('No se pudo cargar el catálogo'),
    });
  }
}
