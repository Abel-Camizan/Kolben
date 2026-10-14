import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-registro',
  imports: [FormsModule, RouterLink],
  templateUrl: './registro.html',
})
export class Registro {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly ruta = inject(ActivatedRoute);

  protected nombre = '';
  protected usuario = '';
  protected password = '';
  protected documento = '';
  protected telefono = '';
  protected readonly error = signal('');
  protected readonly cargando = signal(false);

  protected crearCuenta() {
    this.error.set('');
    this.cargando.set(true);
    this.auth
      .registrar({
        nombre: this.nombre,
        usuario: this.usuario,
        password: this.password,
        documento: this.documento || undefined,
        telefono: this.telefono || undefined,
      })
      .subscribe({
        next: () => {
          const volver = this.ruta.snapshot.queryParamMap.get('volver');
          this.router.navigateByUrl(volver && volver.startsWith('/') ? volver : '/catalogo');
        },
        error: (e) => {
          this.cargando.set(false);
          this.error.set(
            e.status === 0
              ? 'No se pudo conectar con el servidor'
              : (e.error?.error ?? 'No se pudo crear la cuenta'),
          );
        },
      });
  }
}
