import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Modelo, Repuesto } from '../core/models';

interface Formulario {
  codigo: string;
  nombre: string;
  marca_id: number | null;
  categoria_id: number | null;
  precio: number | null;
  stock: number;
  stock_minimo: number;
  modelos: number[];
}

const VACIO: Formulario = {
  codigo: '',
  nombre: '',
  marca_id: null,
  categoria_id: null,
  precio: null,
  stock: 0,
  stock_minimo: 0,
  modelos: [],
};

@Component({
  selector: 'app-repuestos',
  imports: [FormsModule],
  templateUrl: './repuestos.html',
})
export class Repuestos {
  private readonly api = inject(Api);

  protected readonly lista = signal<Repuesto[]>([]);
  protected readonly marcas = signal<Modelo[]>([]);
  protected readonly categorias = signal<Modelo[]>([]);
  protected readonly modelos = signal<Modelo[]>([]);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly guardando = signal(false);

  protected texto = '';
  protected editandoId: number | null = null;
  protected formulario: Formulario = { ...VACIO, modelos: [] };
  protected mostrarFormulario = false;
  protected nuevaMarca = '';
  protected nuevaCategoria = '';
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.api.marcas().subscribe((m) => this.marcas.set(m));
    this.api.categorias().subscribe((c) => this.categorias.set(c));
    this.api.modelos().subscribe((m) => this.modelos.set(m));
    this.cargar();
  }

  protected buscarConRetraso() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 300);
  }

  protected cargar() {
    this.api.listarRepuestos(this.texto).subscribe({
      next: (r) => this.lista.set(r),
      error: () => this.error.set('No se pudo cargar el catálogo'),
    });
  }

  protected nuevo() {
    this.editandoId = null;
    this.formulario = { ...VACIO, modelos: [] };
    this.limpiarMensajes();
    this.mostrarFormulario = true;
  }

  protected editar(r: Repuesto) {
    this.editandoId = r.id;
    this.formulario = {
      codigo: r.codigo,
      nombre: r.nombre,
      marca_id: r.marca_id,
      categoria_id: r.categoria_id,
      precio: Number(r.precio),
      stock: r.stock,
      stock_minimo: r.stock_minimo,
      modelos: r.modelos.map((m) => m.id),
    };
    this.limpiarMensajes();
    this.mostrarFormulario = true;
  }

  protected cancelar() {
    this.mostrarFormulario = false;
  }

  protected tieneModelo(id: number): boolean {
    return this.formulario.modelos.includes(id);
  }

  protected alternarModelo(id: number, marcado: boolean) {
    const sin = this.formulario.modelos.filter((m) => m !== id);
    this.formulario.modelos = marcado ? [...sin, id] : sin;
  }

  protected agregarMarca() {
    const nombre = this.nuevaMarca.trim();
    if (!nombre) return;
    this.api.crearMarca(nombre).subscribe({
      next: (m) => {
        this.marcas.update((l) => [...l, m].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        this.formulario.marca_id = m.id;
        this.nuevaMarca = '';
      },
      error: (e) => this.error.set(e.error?.error ?? 'No se pudo crear la marca'),
    });
  }

  protected agregarCategoria() {
    const nombre = this.nuevaCategoria.trim();
    if (!nombre) return;
    this.api.crearCategoria(nombre).subscribe({
      next: (c) => {
        this.categorias.update((l) => [...l, c].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        this.formulario.categoria_id = c.id;
        this.nuevaCategoria = '';
      },
      error: (e) => this.error.set(e.error?.error ?? 'No se pudo crear la categoría'),
    });
  }

  protected guardar() {
    const f = this.formulario;
    if (!f.codigo.trim() || !f.nombre.trim() || f.precio === null) {
      this.error.set('Código, nombre y precio son obligatorios');
      return;
    }
    this.limpiarMensajes();
    this.guardando.set(true);
    const datos = { ...f, precio: f.precio };
    const peticion =
      this.editandoId === null
        ? this.api.crearRepuesto(datos)
        : this.api.editarRepuesto(this.editandoId, datos);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarFormulario = false;
        this.aviso.set(this.editandoId === null ? 'Repuesto creado' : 'Cambios guardados');
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e.error?.error ?? 'No se pudo guardar el repuesto');
      },
    });
  }

  protected cambiarEstado(r: Repuesto) {
    this.limpiarMensajes();
    this.api.editarRepuesto(r.id, { activo: !r.activo }).subscribe({
      next: () => {
        this.aviso.set(r.activo ? 'Repuesto dado de baja' : 'Repuesto reactivado');
        this.cargar();
      },
      error: (e) => this.error.set(e.error?.error ?? 'No se pudo cambiar el estado'),
    });
  }

  private limpiarMensajes() {
    this.error.set('');
    this.aviso.set('');
  }
}
