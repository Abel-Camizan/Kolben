import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { UsuarioAdmin } from '../core/models';
import { Icono } from '../shared/icono';

interface Formulario {
  nombre: string;
  usuario: string;
  password: string;
  rol: 'administrador' | 'vendedor';
}

const VACIO: Formulario = { nombre: '', usuario: '', password: '', rol: 'vendedor' };

@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, DatePipe, Icono],
  templateUrl: './usuarios.html',
})
export class Usuarios {
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);

  protected readonly todos = signal<UsuarioAdmin[]>([]);
  protected readonly error = signal('');
  protected readonly aviso = signal('');
  protected readonly guardando = signal(false);

  protected verClientes = false;
  protected editando: UsuarioAdmin | null = null;
  protected formulario: Formulario = { ...VACIO };
  protected mostrarFormulario = false;

  constructor() {
    this.cargar();
  }

  // Por defecto solo se muestra al personal; los clientes se registran solos
  protected visibles(): UsuarioAdmin[] {
    return this.todos().filter((u) => (u.rol === 'cliente') === this.verClientes);
  }

  protected esYo(u: UsuarioAdmin): boolean {
    return u.id === this.auth.usuario()?.id;
  }

  protected cargar() {
    this.api.usuarios().subscribe({
      next: (u) => this.todos.set(u),
      error: () => this.error.set('No se pudo cargar la lista de usuarios'),
    });
  }

  protected nuevo() {
    this.editando = null;
    this.formulario = { ...VACIO };
    this.limpiarMensajes();
    this.mostrarFormulario = true;
  }

  protected editar(u: UsuarioAdmin) {
    this.editando = u;
    this.formulario = {
      nombre: u.nombre,
      usuario: u.usuario,
      password: '',
      rol: u.rol === 'administrador' ? 'administrador' : 'vendedor',
    };
    this.limpiarMensajes();
    this.mostrarFormulario = true;
  }

  protected cancelar() {
    this.mostrarFormulario = false;
  }

  protected guardar() {
    const f = this.formulario;
    if (!f.nombre.trim()) {
      this.error.set('El nombre es obligatorio');
      return;
    }
    if (!this.editando && (f.usuario.trim().length < 3 || f.password.length < 6)) {
      this.error.set('Usuario de al menos 3 caracteres y contraseña de al menos 6');
      return;
    }
    if (this.editando && f.password && f.password.length < 6) {
      this.error.set('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    this.limpiarMensajes();
    this.guardando.set(true);

    const editando = this.editando;
    const peticion = editando
      ? this.api.editarUsuario(editando.id, {
          nombre: f.nombre.trim(),
          // El rol de un cliente no se toca desde aquí
          ...(editando.rol !== 'cliente' && { rol: f.rol }),
          ...(f.password && { password: f.password }),
        })
      : this.api.crearUsuario({
          nombre: f.nombre.trim(),
          usuario: f.usuario.trim(),
          password: f.password,
          rol: f.rol,
        });

    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.mostrarFormulario = false;
        this.aviso.set(editando ? 'Cambios guardados' : 'Usuario creado');
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e.error?.error ?? 'No se pudo guardar el usuario');
      },
    });
  }

  protected cambiarEstado(u: UsuarioAdmin) {
    this.limpiarMensajes();
    this.api.editarUsuario(u.id, { activo: !u.activo }).subscribe({
      next: () => {
        this.aviso.set(u.activo ? 'Cuenta desactivada' : 'Cuenta reactivada');
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
