export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  rol: 'administrador' | 'vendedor';
}

export interface Modelo {
  id: number;
  nombre: string;
}

export interface Repuesto {
  id: number;
  codigo: string;
  nombre: string;
  precio: string; // PostgreSQL entrega los decimales como texto: usar Number()
  stock: number;
  stock_minimo: number;
  marca: string | null;
  categoria: string | null;
  modelos: Modelo[];
}

export interface ItemComprobante {
  repuesto_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
}

export interface Comprobante {
  id: number;
  numero: string;
  fecha: string;
  total: string;
  vendedor: string;
  cliente: string | null;
  items: ItemComprobante[];
}
