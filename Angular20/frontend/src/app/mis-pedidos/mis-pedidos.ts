import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Pedido } from '../core/models';
import { PedidoDetalle } from '../pedido-detalle/pedido-detalle';

@Component({
  selector: 'app-mis-pedidos',
  imports: [DatePipe, RouterLink, PedidoDetalle],
  templateUrl: './mis-pedidos.html',
})
export class MisPedidos {
  private readonly api = inject(Api);
  protected readonly recienCreado = inject(ActivatedRoute).snapshot.queryParamMap.has('nuevo');

  protected readonly pedidos = signal<Pedido[]>([]);
  protected readonly abierto = signal<Pedido | null>(null);
  protected readonly error = signal('');
  protected readonly cargando = signal(true);

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.api.pedidos().subscribe({
      next: (p) => {
        this.pedidos.set(p);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar tus pedidos');
        this.cargando.set(false);
      },
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

  protected cancelar(p: Pedido) {
    this.error.set('');
    this.api.accionPedido(p.id, 'cancelar').subscribe({
      next: () => {
        this.abierto.set(null);
        this.cargar();
      },
      error: (e) => this.error.set(e.error?.error ?? 'No se pudo cancelar el pedido'),
    });
  }
}
