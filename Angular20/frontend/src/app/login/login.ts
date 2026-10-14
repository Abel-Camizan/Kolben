import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly ruta = inject(ActivatedRoute);

  protected usuario = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly cargando = signal(false);

  protected entrar() {
    this.error.set('');
    this.cargando.set(true);
    this.auth.login(this.usuario, this.password).subscribe({
      next: () => {
        // El personal va a ventas; el cliente vuelve a donde estaba (p. ej. el carrito)
        const volver = this.ruta.snapshot.queryParamMap.get('volver');
        const destino = this.auth.esPersonal()
          ? '/ventas'
          : volver && volver.startsWith('/')
            ? volver
            : '/catalogo';
        this.router.navigateByUrl(destino);
      },
      error: (e) => {
        this.cargando.set(false);
        this.error.set(
          e.status === 0
            ? 'No se pudo conectar con el servidor'
            : (e.error?.error ?? 'No se pudo iniciar sesión'),
        );
      },
    });
  }
}
