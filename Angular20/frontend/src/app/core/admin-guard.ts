import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

// Solo el administrador entra; cualquier otro vuelve al inicio
export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.autenticado()) return router.createUrlTree(['/login']);
  return auth.esAdmin() ? true : router.createUrlTree(['/']);
};
