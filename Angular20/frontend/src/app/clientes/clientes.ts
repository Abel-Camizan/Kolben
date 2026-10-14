import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Cliente, ClienteDetalle } from '../core/models';

interface Formulario {
  nombre: string;
  documento: string;
  telefono: string;
  direccion: string;
}

const VACIO: Formulario = { nombre: '', documento: '', telefono: '', direccion: '' };

@Component({
  selector: 'app-clientes',
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './clientes.html',
})
export class Clientes {
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);

  protected readonly lista = signal<Cliente[]>([]);
  protected readonly detalle = signal<ClienteDetalle | null>(null);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly guardando = signal(false);

  protected texto = '';
  protected editandoId: number | null = null;
  protected formulario: Formulario = { ...VACIO };
  protected mostrarFormulario = false;
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cargar();
  }

  protected buscarConRetraso() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 300);
  }

  protected cargar() {
    // El administrador también ve los clientes dados de baja
    this.api.clientes(this.texto, this.auth.esAdmin()).subscribe({
      next: (c) => this.lista.set(c),
      error: () => this.error.set('No se pudo cargar la lista de clientes'),
    });
  }

  protected nuevo() {
    this.editandoId = null;
    this.formulario = { ...VACIO };
    this.limpiarMensajes();
    this.mostrarFormulario = true;
  }

  protected editar(c: Cliente) {
    this.editandoId = c.id;
    this.formulario = {
      nombre: c.nombre,
      documento: c.documento ?? '',
      telefono: c.telefono ?? '',
      direccion: c.direccion ?? '',
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
    const editando = this.editandoId;
    const peticion =
      editando === null
        ? this.api.crearCliente(this.formulario)
        : this.api.editarCliente(editando, this.formulario);

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarFormulario = false;
        this.aviso.set(editando === null ? 'Cliente registrado' : 'Cambios guardados');
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e.error?.error ?? 'No se pudo guardar el cliente');
      },
    });
  }

  protected cambiarEstado(c: Cliente) {
    this.limpiarMensajes();
    this.api.editarCliente(c.id, { activo: !c.activo }).subscribe({
      next: () => {
        this.aviso.set(c.activo ? 'Cliente dado de baja' : 'Cliente reactivado');
        this.cargar();
      },
      error: (e) => this.error.set(e.error?.error ?? 'No se pudo cambiar el estado'),
    });
  }

  protected verHistorial(c: Cliente) {
    if (this.detalle()?.id === c.id) {
      this.detalle.set(null);
      return;
    }
    this.api.cliente(c.id).subscribe({
      next: (d) => this.detalle.set(d),
      error: () => this.error.set('No se pudo cargar el historial'),
    });
  }

  private limpiarMensajes() {
    this.error.set('');
    this.aviso.set('');
  }
}
