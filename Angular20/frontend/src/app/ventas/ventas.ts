import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Comprobante, Modelo, Repuesto } from '../core/models';

interface LineaCarrito {
  repuesto: Repuesto;
  cantidad: number;
}

@Component({
  selector: 'app-ventas',
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './ventas.html',
})
export class Ventas {
  private readonly api = inject(Api);

  protected readonly modelos = signal<Modelo[]>([]);
  protected readonly resultados = signal<Repuesto[]>([]);
  protected readonly carrito = signal<LineaCarrito[]>([]);
  protected readonly comprobante = signal<Comprobante | null>(null);
  protected readonly error = signal('');
  protected readonly enviando = signal(false);

  protected texto = '';
  protected modeloId: number | null = null;
  private temporizador?: ReturnType<typeof setTimeout>;

  protected readonly total = computed(() =>
    this.carrito().reduce((suma, l) => suma + Number(l.repuesto.precio) * l.cantidad, 0),
  );

  constructor() {
    this.api.modelos().subscribe((m) => this.modelos.set(m));
    this.buscar();
  }

  // Espera un instante al escribir para no consultar en cada tecla
  protected buscarConRetraso() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.buscar(), 300);
  }

  protected buscar() {
    this.api.buscarRepuestos(this.texto, this.modeloId).subscribe({
      next: (r) => this.resultados.set(r),
      error: () => this.error.set('No se pudo consultar el catálogo'),
    });
  }

  protected subtotal(l: LineaCarrito): number {
    return Number(l.repuesto.precio) * l.cantidad;
  }

  protected enCarrito(r: Repuesto): number {
    return this.carrito().find((l) => l.repuesto.id === r.id)?.cantidad ?? 0;
  }

  protected agregar(r: Repuesto) {
    this.error.set('');
    const lineas = this.carrito();
    const existente = lineas.find((l) => l.repuesto.id === r.id);
    if (existente) {
      this.cambiarCantidad(r.id, existente.cantidad + 1);
    } else if (r.stock > 0) {
      this.carrito.set([...lineas, { repuesto: r, cantidad: 1 }]);
    }
  }

  protected cambiarCantidad(id: number, valor: number) {
    const cantidad = Math.floor(Number(valor));
    this.carrito.update((lineas) =>
      lineas.map((l) =>
        l.repuesto.id === id
          ? { ...l, cantidad: Math.min(Math.max(cantidad || 1, 1), l.repuesto.stock) }
          : l,
      ),
    );
  }

  protected quitar(id: number) {
    this.carrito.update((lineas) => lineas.filter((l) => l.repuesto.id !== id));
  }

  protected registrar() {
    this.error.set('');
    this.enviando.set(true);
    const items = this.carrito().map((l) => ({ repuesto_id: l.repuesto.id, cantidad: l.cantidad }));
    this.api.registrarVenta(items).subscribe({
      next: (c) => {
        this.enviando.set(false);
        this.comprobante.set(c);
        this.carrito.set([]);
        this.buscar(); // refresca el stock
      },
      error: (e) => {
        this.enviando.set(false);
        const problemas: { nombre?: string; motivo: string; disponible?: number }[] =
          e.error?.problemas ?? [];
        this.error.set(
          problemas.length
            ? problemas
                .map((p) => `${p.nombre ?? 'Repuesto'}: ${p.motivo}` + (p.disponible !== undefined ? ` (disponible: ${p.disponible})` : ''))
                .join(' · ')
            : (e.error?.error ?? 'No se pudo registrar la venta'),
        );
        this.buscar();
      },
    });
  }

  protected nuevaVenta() {
    this.comprobante.set(null);
  }

  protected imprimir() {
    window.print();
  }
}
