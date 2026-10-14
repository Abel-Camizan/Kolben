import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from './auth';
import { Comprobante, Modelo, Repuesto } from './models';

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

  registrarVenta(items: { repuesto_id: number; cantidad: number }[]) {
    return this.http.post<Comprobante>(`${API_URL}/ventas`, { items });
  }
}
