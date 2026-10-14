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
  activo: boolean;
  marca_id: number | null;
  marca: string | null;
  categoria_id: number | null;
  categoria: string | null;
  modelos: Modelo[];
}

// Lo que se envía al crear o editar un repuesto
export interface DatosRepuesto {
  codigo: string;
  nombre: string;
  marca_id: number | null;
  categoria_id: number | null;
  precio: number;
  stock: number;
  stock_minimo: number;
  modelos: number[];
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
