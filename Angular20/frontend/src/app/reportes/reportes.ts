import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { FilaMasVendido, FilaStockModelo, Modelo, ReporteVentas } from '../core/models';
import { Icono } from '../shared/icono';

type Pestana = 'ventas' | 'stock' | 'vendidos';

interface GrupoStock {
  modelo: string;
  filas: FilaStockModelo[];
  unidades: number;
  valor: number;
  bajoMinimo: number;
}

// Fecha local del navegador en formato YYYY-MM-DD (lo que esperan los <input type="date"> y la API)
function formatear(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

@Component({
  selector: 'app-reportes',
  imports: [FormsModule, DecimalPipe, Icono],
  templateUrl: './reportes.html',
})
export class Reportes {
  private readonly api = inject(Api);

  protected readonly modelos = signal<Modelo[]>([]);
  protected readonly error = signal('');
  protected readonly ventas = signal<ReporteVentas | null>(null);
  protected readonly grupos = signal<GrupoStock[]>([]);
  protected readonly vendidos = signal<FilaMasVendido[]>([]);

  protected pestana: Pestana = 'ventas';
  protected desde = formatear(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected hasta = formatear(new Date());
  protected agrupar: 'dia' | 'semana' | 'mes' = 'dia';
  protected modeloId: number | null = null;

  constructor() {
    this.api.modelos().subscribe((m) => this.modelos.set(m));
    this.cargar();
  }

  protected elegir(p: Pestana) {
    this.pestana = p;
    this.cargar();
  }

  protected cargar() {
    this.error.set('');
    if (this.pestana !== 'stock' && (!this.desde || !this.hasta || this.desde > this.hasta)) {
      this.error.set('Elige un rango de fechas válido (la inicial no puede ser posterior a la final)');
      return;
    }
    const fallo = (e: { error?: { error?: string } }) =>
      this.error.set(e.error?.error ?? 'No se pudo generar el reporte');

    if (this.pestana === 'ventas') {
      this.api
        .reporteVentas(this.desde, this.hasta, this.agrupar)
        .subscribe({ next: (r) => this.ventas.set(r), error: fallo });
    } else if (this.pestana === 'stock') {
      this.api.reporteStock(this.modeloId).subscribe({
        next: (filas) => this.grupos.set(this.agruparStock(filas)),
        error: fallo,
      });
    } else {
      this.api
        .reporteMasVendidos(this.desde, this.hasta, this.modeloId)
        .subscribe({ next: (r) => this.vendidos.set(r.filas), error: fallo });
    }
  }

  private agruparStock(filas: FilaStockModelo[]): GrupoStock[] {
    const porModelo = new Map<string, GrupoStock>();
    for (const f of filas) {
      const g = porModelo.get(f.modelo) ?? {
        modelo: f.modelo,
        filas: [],
        unidades: 0,
        valor: 0,
        bajoMinimo: 0,
      };
      g.filas.push(f);
      g.unidades += f.stock;
      g.valor += f.stock * Number(f.precio);
      if (f.bajo_minimo) g.bajoMinimo++;
      porModelo.set(f.modelo, g);
    }
    return [...porModelo.values()];
  }

  protected etiquetaPeriodo(periodo: string): string {
    const [a, m, d] = periodo.split('-');
    if (this.agrupar === 'mes') return `${m}/${a}`;
    if (this.agrupar === 'semana') return `Semana del ${d}/${m}/${a}`;
    return `${d}/${m}/${a}`;
  }

  protected promedio(r: ReporteVentas): number {
    return r.resumen.ventas ? Number(r.resumen.total) / r.resumen.ventas : 0;
  }

  protected imprimir() {
    window.print();
  }
}
