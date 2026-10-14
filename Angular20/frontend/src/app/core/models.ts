export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  rol: 'administrador' | 'vendedor' | 'cliente';
}

// Repuesto tal como lo ve el cliente en el catálogo público
export interface ItemCatalogo {
  id: number;
  codigo: string;
  nombre: string;
  precio: string;
  stock: number;
  marca: string | null;
  categoria: string | null;
  modelos: Modelo[];
}

export type EstadoPedido = 'pendiente' | 'confirmado' | 'entregado' | 'cancelado';

export interface ItemPedido {
  repuesto_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
}

export interface Pedido {
  id: number;
  numero: string;
  estado: EstadoPedido;
  total: string;
  nota: string | null;
  venta_id: number | null;
  creado_en: string;
  cliente: string;
  cliente_telefono: string | null;
  cliente_documento: string | null;
  items?: ItemPedido[]; // solo viene en el detalle de un pedido
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
