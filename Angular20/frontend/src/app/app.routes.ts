import { Routes } from '@angular/router';
import { adminGuard } from './core/admin-guard';
import { authGuard } from './core/auth-guard';
import { Login } from './login/login';
import { Repuestos } from './repuestos/repuestos';
import { Ventas } from './ventas/ventas';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'ventas', component: Ventas, canActivate: [authGuard] },
  { path: 'repuestos', component: Repuestos, canActivate: [adminGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'ventas' },
  { path: '**', redirectTo: 'ventas' },
];
