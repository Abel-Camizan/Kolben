import { Routes } from '@angular/router';
import { authGuard } from './core/auth-guard';
import { Login } from './login/login';
import { Ventas } from './ventas/ventas';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'ventas', component: Ventas, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'ventas' },
  { path: '**', redirectTo: 'ventas' },
];
