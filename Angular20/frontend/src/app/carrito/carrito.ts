import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Carrito as CarritoServicio } from '../core/carrito';

@Component({
  selector: 'app-carrito',
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './carrito.html',
})
export class Carrito {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly carrito = inject(CarritoServicio);
  protected readonly auth = inject(Auth);

  protected readonly error = signal('');
  protected readonly enviando = signal(false);
  protected nota = '';

  protected generarPedido() {
    this.error.set('');
    this.enviando.set(true);
    const items = this.carrito
      .lineas()
      .map((l) => ({ repuesto_id: l.repuesto.id, cantidad: l.cantidad }));

    this.api.crearPedido(items, this.nota).subscribe({
      next: () => {
        this.carrito.vaciar();
        this.router.navigate(['/mis-pedidos'], { queryParams: { nuevo: 1 } });
      },
      error: (e) => {
        this.enviando.set(false);
        const problemas: { nombre?: string; motivo: string; disponible?: number }[] =
          e.error?.problemas ?? [];
        this.error.set(
          problemas.length
            ? problemas
                .map(
                  (p) =>
                    `${p.nombre ?? 'Repuesto'}: ${p.motivo}` +
                    (p.disponible !== undefined ? ` (disponible: ${p.disponible})` : ''),
                )
                .join(' · ')
            : (e.error?.error ?? 'No se pudo generar el pedido'),
        );
      },
    });
  }
}
