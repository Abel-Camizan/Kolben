import { Routes } from '@angular/router';
import { adminGuard } from './core/admin-guard';
import { clienteGuard, inicioGuard, personalGuard } from './core/auth-guard';
import { Carrito } from './carrito/carrito';
import { Catalogo } from './catalogo/catalogo';
import { Ingresos } from './ingresos/ingresos';
import { Login } from './login/login';
import { MisPedidos } from './mis-pedidos/mis-pedidos';
import { Pedidos } from './pedidos/pedidos';
import { Proveedores } from './proveedores/proveedores';
import { Registro } from './registro/registro';
import { Repuestos } from './repuestos/repuestos';
import { Ventas } from './ventas/ventas';

export const routes: Routes = [
  // Públicas
  { path: 'login', component: Login },
  { path: 'registro', component: Registro },
  { path: 'catalogo', component: Catalogo },
  { path: 'carrito', component: Carrito },
  // Cliente
  { path: 'mis-pedidos', component: MisPedidos, canActivate: [clienteGuard] },
  // Personal (administrador y vendedor)
  { path: 'ventas', component: Ventas, canActivate: [personalGuard] },
  { path: 'pedidos', component: Pedidos, canActivate: [personalGuard] },
  // Solo administrador
  { path: 'repuestos', component: Repuestos, canActivate: [adminGuard] },
  { path: 'proveedores', component: Proveedores, canActivate: [adminGuard] },
  { path: 'ingresos', component: Ingresos, canActivate: [adminGuard] },
  // Inicio: el personal pasa directo a ventas; los demás ven el catálogo
  { path: '', pathMatch: 'full', component: Catalogo, canActivate: [inicioGuard] },
  { path: '**', redirectTo: '' },
];
