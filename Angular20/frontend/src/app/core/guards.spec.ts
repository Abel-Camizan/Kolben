import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { adminGuard } from './admin-guard';
import { Auth } from './auth';
import { clienteGuard, inicioGuard, personalGuard } from './auth-guard';

// Auth simulado: solo cambia el usuario de la sesión
function conUsuario(rol: 'administrador' | 'vendedor' | 'cliente' | null) {
  const usuario = signal(rol ? { id: 1, nombre: 'T', usuario: 't', rol } : null);
  const auth = {
    autenticado: () => usuario() !== null,
    esCliente: () => usuario()?.rol === 'cliente',
    esAdmin: () => usuario()?.rol === 'administrador',
    esPersonal: () => usuario() !== null && usuario()?.rol !== 'cliente',
  };
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: Auth, useValue: auth }] });
}

// Ejecuta un guard y devuelve true o la ruta a la que redirige
function ejecutar(guard: typeof adminGuard): true | string {
  const r = TestBed.runInInjectionContext(() => guard({} as never, {} as never)) as boolean | UrlTree;
  return r === true ? true : TestBed.inject(Router).serializeUrl(r as UrlTree);
}

describe('Guards de rutas', () => {
  it('adminGuard: solo el administrador entra', () => {
    conUsuario('administrador');
    expect(ejecutar(adminGuard)).toBe(true);
  });

  it('adminGuard: vendedor y cliente vuelven al inicio; sin sesión va al login', () => {
    conUsuario('vendedor');
    expect(ejecutar(adminGuard)).toBe('/');
    TestBed.resetTestingModule();
    conUsuario('cliente');
    expect(ejecutar(adminGuard)).toBe('/');
    TestBed.resetTestingModule();
    conUsuario(null);
    expect(ejecutar(adminGuard)).toBe('/login');
  });

  it('personalGuard: administrador y vendedor pasan; cliente no; sin sesión va al login', () => {
    for (const rol of ['administrador', 'vendedor'] as const) {
      conUsuario(rol);
      expect(ejecutar(personalGuard)).toBe(true);
      TestBed.resetTestingModule();
    }
    conUsuario('cliente');
    expect(ejecutar(personalGuard)).toBe('/');
    TestBed.resetTestingModule();
    conUsuario(null);
    expect(ejecutar(personalGuard)).toBe('/login');
  });

  it('clienteGuard: solo clientes; el personal vuelve al inicio; sin sesión va al login', () => {
    conUsuario('cliente');
    expect(ejecutar(clienteGuard)).toBe(true);
    TestBed.resetTestingModule();
    conUsuario('vendedor');
    expect(ejecutar(clienteGuard)).toBe('/');
    TestBed.resetTestingModule();
    conUsuario(null);
    expect(ejecutar(clienteGuard)).toBe('/login');
  });

  it('inicioGuard: el personal va directo a ventas; visitantes y clientes ven el catálogo', () => {
    conUsuario('vendedor');
    expect(ejecutar(inicioGuard)).toBe('/ventas');
    TestBed.resetTestingModule();
    conUsuario('cliente');
    expect(ejecutar(inicioGuard)).toBe(true);
    TestBed.resetTestingModule();
    conUsuario(null);
    expect(ejecutar(inicioGuard)).toBe(true);
  });
});
