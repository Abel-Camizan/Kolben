import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Proveedor } from '../core/models';
import { Icono } from '../shared/icono';

interface Formulario {
  nombre: string;
  ruc: string;
  telefono: string;
  direccion: string;
}

const VACIO: Formulario = { nombre: '', ruc: '', telefono: '', direccion: '' };

@Component({
  selector: 'app-proveedores',
  imports: [FormsModule, Icono],
  templateUrl: './proveedores.html',
})
export class Proveedores {
  private readonly api = inject(Api);

  protected readonly lista = signal<Proveedor[]>([]);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly guardando = signal(false);

  protected editandoId: number | null = null;
  protected formulario: Formulario = { ...VACIO };
  protected mostrarFormulario = false;

  constructor() {
    this.cargar();
  }

  protected cargar() {
    this.api.proveedores(true).subscribe({
      next: (p) => this.lista.set(p),
      error: () => this.error.set('No se pudo cargar la lista de proveedores'),
    });
  }

  protected nuevo() {
    this.editandoId = null;
    this.formulario = { ...VACIO };
    this.limpiarMensajes();
    this.mostrarFormulario = true;
  }

  protected editar(p: Proveedor) {
    this.editandoId = p.id;
    this.formulario = {
      nombre: p.nombre,
      ruc: p.ruc ?? '',
      telefono: p.telefono ?? '',
      direccion: p.direccion ?? '',
    };
    this.limpiarMensajes();
    this.mostrarFormulario = true;
  }

  protected cancelar() {
    this.mostrarFormulario = false;
  }

  protected guardar() {
    if (!this.formulario.nombre.trim()) {
      this.error.set('El nombre es obligatorio');
      return;
    }
    this.limpiarMensajes();
    this.guardando.set(true);
    const peticion =
      this.editandoId === null
        ? this.api.crearProveedor(this.formulario)
        : this.api.editarProveedor(this.editandoId, this.formulario);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarFormulario = false;
        this.aviso.set(this.editandoId === null ? 'Proveedor creado' : 'Cambios guardados');
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e.error?.error ?? 'No se pudo guardar el proveedor');
      },
    });
  }

  protected cambiarEstado(p: Proveedor) {
    this.limpiarMensajes();
    this.api.editarProveedor(p.id, { activo: !p.activo }).subscribe({
      next: () => {
        this.aviso.set(p.activo ? 'Proveedor dado de baja' : 'Proveedor reactivado');
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
