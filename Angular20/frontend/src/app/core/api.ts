import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from './auth';
import { Comprobante, DatosRepuesto, Modelo, Repuesto } from './models';

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
