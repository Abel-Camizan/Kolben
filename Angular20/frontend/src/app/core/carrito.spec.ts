import { TestBed } from '@angular/core/testing';
import { Carrito } from './carrito';
import { ItemCatalogo } from './models';

function repuesto(id: number, precio: string, stock: number): ItemCatalogo {
  return { id, codigo: `R${id}`, nombre: `Repuesto ${id}`, precio, stock, marca: null, categoria: null, modelos: [] };
}

describe('Carrito', () => {
  let carrito: Carrito;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    carrito = TestBed.inject(Carrito);
  });

  it('empieza vacío', () => {
    expect(carrito.lineas()).toEqual([]);
    expect(carrito.cantidadTotal()).toBe(0);
    expect(carrito.total()).toBe(0);
  });

  it('agrega un repuesto y suma al volver a agregarlo', () => {
    const r = repuesto(1, '10.00', 5);
    carrito.agregar(r);
    carrito.agregar(r);
    expect(carrito.cantidadDe(1)).toBe(2);
    expect(carrito.lineas().length).toBe(1);
  });

  it('no agrega repuestos agotados', () => {
    carrito.agregar(repuesto(1, '10.00', 0));
    expect(carrito.lineas().length).toBe(0);
  });

  it('no deja superar el stock disponible', () => {
    const r = repuesto(1, '10.00', 2);
    carrito.agregar(r);
    carrito.agregar(r);
    carrito.agregar(r);
    expect(carrito.cantidadDe(1)).toBe(2);
    carrito.cambiarCantidad(1, 99);
    expect(carrito.cantidadDe(1)).toBe(2);
  });

  it('corrige cantidades inválidas (0, negativas, texto, decimales)', () => {
    carrito.agregar(repuesto(1, '10.00', 10));
    carrito.cambiarCantidad(1, 0);
    expect(carrito.cantidadDe(1)).toBe(1);
    carrito.cambiarCantidad(1, -4);
    expect(carrito.cantidadDe(1)).toBe(1);
    carrito.cambiarCantidad(1, Number.NaN);
    expect(carrito.cantidadDe(1)).toBe(1);
    carrito.cambiarCantidad(1, 3.9);
    expect(carrito.cantidadDe(1)).toBe(3);
  });

  it('calcula el total y las unidades', () => {
    carrito.agregar(repuesto(1, '12.30', 10));
    carrito.agregar(repuesto(1, '12.30', 10));
    carrito.agregar(repuesto(2, '8.75', 10));
    expect(carrito.cantidadTotal()).toBe(3);
    expect(carrito.total()).toBeCloseTo(33.35, 2);
    expect(carrito.subtotal(carrito.lineas()[0])).toBeCloseTo(24.6, 2);
  });

  it('quita una línea y vacía todo', () => {
    carrito.agregar(repuesto(1, '1.00', 5));
    carrito.agregar(repuesto(2, '1.00', 5));
    carrito.quitar(1);
    expect(carrito.cantidadDe(1)).toBe(0);
    expect(carrito.cantidadDe(2)).toBe(1);
    carrito.vaciar();
    expect(carrito.lineas()).toEqual([]);
  });

  it('se conserva al recargar la página (localStorage)', () => {
    carrito.agregar(repuesto(7, '5.00', 5));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const otro = TestBed.inject(Carrito);
    expect(otro.cantidadDe(7)).toBe(1);
  });

  it('ignora un carrito guardado corrupto sin romperse', () => {
    localStorage.setItem('kolben_carrito', '{no es json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(Carrito).lineas()).toEqual([]);
  });
});
