import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

// Administrador o vendedor: ventas de mostrador y bandeja de pedidos
export const personalGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.autenticado()) return router.createUrlTree(['/login']);
  return auth.esPersonal() ? true : router.createUrlTree(['/']);
};

// Solo clientes: sus pedidos
export const clienteGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.autenticado()) return router.createUrlTree(['/login']);
  return auth.esCliente() ? true : router.createUrlTree(['/']);
};

// Página de inicio: el personal va directo a ventas; los demás ven el catálogo
export const inicioGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.esPersonal() ? inject(Router).createUrlTree(['/ventas']) : true;
};
