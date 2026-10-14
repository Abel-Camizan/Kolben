import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Pedido } from '../core/models';
import { PedidoDetalle } from '../pedido-detalle/pedido-detalle';

@Component({
  selector: 'app-pedidos',
  imports: [DatePipe, FormsModule, PedidoDetalle],
  templateUrl: './pedidos.html',
})
export class Pedidos {
  private readonly api = inject(Api);

  protected readonly pedidos = signal<Pedido[]>([]);
  protected readonly abierto = signal<Pedido | null>(null);
  protected readonly error = signal('');
  protected readonly aviso = signal('');

  protected estado = 'pendiente';

  constructor() {
    this.cargar();
  }

  protected cargar() {
    this.api.pedidos(this.estado).subscribe({
      next: (p) => this.pedidos.set(p),
      error: () => this.error.set('No se pudieron cargar los pedidos'),
    });
  }

  protected ver(p: Pedido) {
    if (this.abierto()?.id === p.id) {
      this.abierto.set(null);
      return;
    }
    this.api.pedido(p.id).subscribe({
      next: (detalle) => this.abierto.set(detalle),
      error: () => this.error.set('No se pudo cargar el detalle'),
    });
  }

  protected accion(p: Pedido, accion: 'confirmar' | 'entregar' | 'cancelar') {
    this.error.set('');
    this.aviso.set('');
    this.api.accionPedido(p.id, accion).subscribe({
      next: (r) => {
        const texto = { confirmar: 'confirmado (stock descontado)', entregar: 'entregado', cancelar: 'cancelado' };
        this.aviso.set(`Pedido ${r.numero} ${texto[accion]}`);
        this.abierto.set(null);
        this.cargar();
      },
      error: (e) => {
        const problemas: { nombre?: string; motivo: string; disponible?: number }[] =
          e.error?.problemas ?? [];
        this.error.set(
          problemas.length
            ? 'No hay stock suficiente: ' +
                problemas
                  .map((x) => `${x.nombre ?? 'Repuesto'}` + (x.disponible !== undefined ? ` (disponible: ${x.disponible})` : ` (${x.motivo})`))
                  .join(' · ')
            : (e.error?.error ?? 'No se pudo completar la acción'),
        );
      },
    });
  }
}
