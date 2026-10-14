import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from './auth';
import {
  Comprobante,
  DatosRepuesto,
  FilaMasVendido,
  FilaStockModelo,
  Ingreso,
  ItemCatalogo,
  Modelo,
  Pedido,
  Proveedor,
  Repuesto,
  ReporteVentas,
  UsuarioAdmin,
} from './models';

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  modelos() {
    return this.http.get<Modelo[]>(`${API_URL}/modelos`);
  }

  buscarRepuestos(q: string, modeloId: number | null) {
    let params = new HttpParams();
    if (q.trim()) params = params.set('q', q.trim());
    if (modeloId) params = params.set('modelo_id', modeloId);
    return this.http.get<Repuesto[]>(`${API_URL}/repuestos`, { params });
  }

  // --- Catálogo público (sin sesión) ---
  catalogoModelos() {
    return this.http.get<Modelo[]>(`${API_URL}/catalogo/modelos`);
  }

  catalogo(q: string, modeloId: number | null) {
    let params = new HttpParams();
    if (q.trim()) params = params.set('q', q.trim());
    if (modeloId) params = params.set('modelo_id', modeloId);
    return this.http.get<ItemCatalogo[]>(`${API_URL}/catalogo`, { params });
  }

  // --- Pedidos en línea ---
  crearPedido(items: { repuesto_id: number; cantidad: number }[], nota: string) {
    return this.http.post<Pedido>(`${API_URL}/pedidos`, { items, nota });
  }

  pedidos(estado: string = '') {
    let params = new HttpParams();
    if (estado) params = params.set('estado', estado);
    return this.http.get<Pedido[]>(`${API_URL}/pedidos`, { params });
  }

  pedido(id: number) {
    return this.http.get<Pedido>(`${API_URL}/pedidos/${id}`);
  }

  accionPedido(id: number, accion: 'cancelar' | 'confirmar' | 'entregar') {
    return this.http.post<Pedido>(`${API_URL}/pedidos/${id}/${accion}`, {});
  }

  // --- Proveedores e ingresos de mercadería (administrador) ---
  proveedores(todos = false) {
    let params = new HttpParams();
    if (todos) params = params.set('todos', '1');
    return this.http.get<Proveedor[]>(`${API_URL}/proveedores`, { params });
  }

  crearProveedor(datos: Partial<Proveedor>) {
    return this.http.post<Proveedor>(`${API_URL}/proveedores`, datos);
  }

  editarProveedor(id: number, datos: Partial<Proveedor>) {
    return this.http.patch<Proveedor>(`${API_URL}/proveedores/${id}`, datos);
  }

  ingresos() {
    return this.http.get<Ingreso[]>(`${API_URL}/ingresos`);
  }

  ingreso(id: number) {
    return this.http.get<Ingreso>(`${API_URL}/ingresos/${id}`);
  }

  registrarIngreso(
    proveedorId: number,
    observacion: string,
    items: { repuesto_id: number; cantidad: number; costo_unit: number }[],
  ) {
    return this.http.post<Ingreso>(`${API_URL}/ingresos`, {
      proveedor_id: proveedorId,
      observacion,
      items,
    });
  }

  // --- Gestión de usuarios (administrador) ---
  usuarios() {
    return this.http.get<UsuarioAdmin[]>(`${API_URL}/usuarios`);
  }

  crearUsuario(datos: { nombre: string; usuario: string; password: string; rol: string }) {
    return this.http.post<UsuarioAdmin>(`${API_URL}/usuarios`, datos);
  }

  editarUsuario(
    id: number,
    datos: { nombre?: string; rol?: string; activo?: boolean; password?: string },
  ) {
    return this.http.patch<UsuarioAdmin>(`${API_URL}/usuarios/${id}`, datos);
  }

  // --- Reportes (administrador) ---
  reporteVentas(desde: string, hasta: string, agrupar: string) {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta).set('agrupar', agrupar);
    return this.http.get<ReporteVentas>(`${API_URL}/reportes/ventas`, { params });
  }

  reporteStock(modeloId: number | null) {
    let params = new HttpParams();
    if (modeloId) params = params.set('modelo_id', modeloId);
    return this.http.get<FilaStockModelo[]>(`${API_URL}/reportes/stock`, { params });
  }

  reporteMasVendidos(desde: string, hasta: string, modeloId: number | null) {
    let params = new HttpParams().set('desde', desde).set('hasta', hasta);
    if (modeloId) params = params.set('modelo_id', modeloId);
    return this.http.get<{ desde: string; hasta: string; filas: FilaMasVendido[] }>(
      `${API_URL}/reportes/mas-vendidos`,
      { params },
    );
  }

  marcas() {
    return this.http.get<Modelo[]>(`${API_URL}/marcas`);
  }

  categorias() {
    return this.http.get<Modelo[]>(`${API_URL}/categorias`);
  }

  crearMarca(nombre: string) {
    return this.http.post<Modelo>(`${API_URL}/marcas`, { nombre });
  }

  crearCategoria(nombre: string) {
    return this.http.post<Modelo>(`${API_URL}/categorias`, { nombre });
  }

  // El administrador ve también los repuestos dados de baja
  listarRepuestos(q: string) {
    let params = new HttpParams().set('todos', '1');
    if (q.trim()) params = params.set('q', q.trim());
    return this.http.get<Repuesto[]>(`${API_URL}/repuestos`, { params });
  }

  crearRepuesto(datos: DatosRepuesto) {
    return this.http.post<Repuesto>(`${API_URL}/repuestos`, datos);
  }

  editarRepuesto(id: number, datos: Partial<DatosRepuesto> & { activo?: boolean }) {
    return this.http.patch<Repuesto>(`${API_URL}/repuestos/${id}`, datos);
  }

  registrarVenta(items: { repuesto_id: number; cantidad: number }[]) {
    return this.http.post<Comprobante>(`${API_URL}/ventas`, { items });
  }
}
