import { Injectable, computed, signal } from '@angular/core';
import { ItemCatalogo } from './models';

export interface LineaCarrito {
  repuesto: ItemCatalogo;
  cantidad: number;
}

const CLAVE_CARRITO = 'kolben_carrito';

// Carrito de compras del cliente. Se guarda en el navegador para que no se pierda
// al recargar la página o al ir a iniciar sesión.
@Injectable({ providedIn: 'root' })
export class Carrito {
  readonly lineas = signal<LineaCarrito[]>(this.leer());

  readonly cantidadTotal = computed(() => this.lineas().reduce((s, l) => s + l.cantidad, 0));
  readonly total = computed(() =>
    this.lineas().reduce((s, l) => s + Number(l.repuesto.precio) * l.cantidad, 0),
  );

  cantidadDe(id: number): number {
    return this.lineas().find((l) => l.repuesto.id === id)?.cantidad ?? 0;
  }

  agregar(r: ItemCatalogo) {
    const actual = this.cantidadDe(r.id);
    if (actual === 0) {
      if (r.stock > 0) this.cambiar([...this.lineas(), { repuesto: r, cantidad: 1 }]);
    } else {
      this.cambiarCantidad(r.id, actual + 1);
    }
  }

  cambiarCantidad(id: number, valor: number) {
    const cantidad = Math.floor(Number(valor));
    this.cambiar(
      this.lineas().map((l) =>
        l.repuesto.id === id
          ? { ...l, cantidad: Math.min(Math.max(cantidad || 1, 1), l.repuesto.stock) }
          : l,
      ),
    );
  }

  quitar(id: number) {
    this.cambiar(this.lineas().filter((l) => l.repuesto.id !== id));
  }

  vaciar() {
    this.cambiar([]);
  }

  subtotal(l: LineaCarrito): number {
    return Number(l.repuesto.precio) * l.cantidad;
  }

  private cambiar(lineas: LineaCarrito[]) {
    this.lineas.set(lineas);
    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(lineas));
    } catch {
      // Sin almacenamiento disponible: el carrito sigue funcionando mientras la página esté abierta
    }
  }

  private leer(): LineaCarrito[] {
    try {
      const guardado = localStorage.getItem(CLAVE_CARRITO);
      return guardado ? (JSON.parse(guardado) as LineaCarrito[]) : [];
    } catch {
      return [];
    }
  }
}
