import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Ingreso, Proveedor, Repuesto } from '../core/models';

interface Linea {
  repuesto: Repuesto;
  cantidad: number;
  costo: number;
}

@Component({
  selector: 'app-ingresos',
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './ingresos.html',
})
export class Ingresos {
  private readonly api = inject(Api);

  protected readonly proveedores = signal<Proveedor[]>([]);
  protected readonly repuestos = signal<Repuesto[]>([]);
  protected readonly historial = signal<Ingreso[]>([]);
  protected readonly abierto = signal<Ingreso | null>(null);
  protected readonly lineas = signal<Linea[]>([]);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly enviando = signal(false);

  protected proveedorId: number | null = null;
  protected observacion = '';

  // Datos de la línea que se está por agregar
  protected repuestoId: number | null = null;
  protected cantidad: number | null = null;
  protected costo: number | null = null;

  protected readonly total = computed(() =>
    this.lineas().reduce((suma, l) => suma + l.cantidad * l.costo, 0),
  );

  constructor() {
    this.api.proveedores().subscribe((p) => this.proveedores.set(p));
    this.api.listarRepuestos('').subscribe((r) => this.repuestos.set(r.filter((x) => x.activo)));
    this.cargarHistorial();
  }

  private cargarHistorial() {
    this.api.ingresos().subscribe({
      next: (h) => this.historial.set(h),
      error: () => this.error.set('No se pudo cargar el historial'),
    });
  }

  protected agregarLinea() {
    const repuesto = this.repuestos().find((r) => r.id === this.repuestoId);
    if (!repuesto || !this.cantidad || this.cantidad < 1 || this.costo === null || this.costo < 0) {
      this.error.set('Elige un repuesto e indica cantidad (mínimo 1) y costo unitario');
      return;
    }
    this.error.set('');
    const cantidad = Math.floor(this.cantidad);
    const costo = this.costo;
    const existente = this.lineas().find((l) => l.repuesto.id === repuesto.id);
    this.lineas.set(
      existente
        ? this.lineas().map((l) =>
            l.repuesto.id === repuesto.id ? { ...l, cantidad: l.cantidad + cantidad, costo } : l,
          )
        : [...this.lineas(), { repuesto, cantidad, costo }],
    );
    this.repuestoId = null;
    this.cantidad = null;
    this.costo = null;
  }

  protected quitar(id: number) {
    this.lineas.update((ls) => ls.filter((l) => l.repuesto.id !== id));
  }

  protected registrar() {
    if (this.proveedorId === null) {
      this.error.set('Elige un proveedor');
      return;
    }
    this.error.set('');
    this.aviso.set('');
    this.enviando.set(true);
    const items = this.lineas().map((l) => ({
      repuesto_id: l.repuesto.id,
      cantidad: l.cantidad,
      costo_unit: l.costo,
    }));
    this.api.registrarIngreso(this.proveedorId, this.observacion, items).subscribe({
      next: () => {
        this.enviando.set(false);
        this.aviso.set('Ingreso registrado: el stock ya se actualizó');
        this.lineas.set([]);
        this.observacion = '';
        this.proveedorId = null;
        this.cargarHistorial();
        // El stock cambió: refresca la lista de repuestos
        this.api.listarRepuestos('').subscribe((r) => this.repuestos.set(r.filter((x) => x.activo)));
      },
      error: (e) => {
        this.enviando.set(false);
        this.error.set(e.error?.error ?? 'No se pudo registrar el ingreso');
      },
    });
  }

  protected ver(i: Ingreso) {
    if (this.abierto()?.id === i.id) {
      this.abierto.set(null);
      return;
    }
    this.api.ingreso(i.id).subscribe({
      next: (detalle) => this.abierto.set(detalle),
      error: () => this.error.set('No se pudo cargar el detalle'),
    });
  }
}
