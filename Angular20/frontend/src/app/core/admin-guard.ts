import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

// Solo el administrador entra; cualquier otro rol vuelve a ventas
export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  if (!auth.autenticado()) return inject(Router).createUrlTree(['/login']);
  return auth.usuario()?.rol === 'administrador' ? true : inject(Router).createUrlTree(['/ventas']);
};
