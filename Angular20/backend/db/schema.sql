-- Esquema de Kolben (PostgreSQL)
-- Se puede ejecutar varias veces: usa IF NOT EXISTS.

-- M1. Usuarios y seguridad
CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    usuario         VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    rol             VARCHAR(20)  NOT NULL CHECK (rol IN ('administrador', 'vendedor', 'cliente')),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- M2. Repuestos e inventario
CREATE TABLE IF NOT EXISTS marcas (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS modelos_moto (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL UNIQUE   -- TVS King Deluxe, TVS Duramax, Bajaj Torito
);

CREATE TABLE IF NOT EXISTS categorias (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS repuestos (
    id            SERIAL PRIMARY KEY,
    codigo        VARCHAR(40)   NOT NULL UNIQUE,
    nombre        VARCHAR(120)  NOT NULL,
    marca_id      INT           REFERENCES marcas(id),
    categoria_id  INT           REFERENCES categorias(id),
    precio        NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
    stock         INT           NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo  INT           NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    activo        BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Compatibilidad: un repuesto puede servir para varios modelos de moto
CREATE TABLE IF NOT EXISTS repuesto_modelo (
    repuesto_id  INT NOT NULL REFERENCES repuestos(id)    ON DELETE CASCADE,
    modelo_id    INT NOT NULL REFERENCES modelos_moto(id) ON DELETE CASCADE,
    PRIMARY KEY (repuesto_id, modelo_id)
);

-- M3. Proveedores e ingreso de mercadería
CREATE TABLE IF NOT EXISTS proveedores (
    id        SERIAL PRIMARY KEY,
    nombre    VARCHAR(120) NOT NULL,
    ruc       VARCHAR(11)  UNIQUE,
    telefono  VARCHAR(20),
    direccion VARCHAR(200),
    activo    BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ingresos (
    id            SERIAL PRIMARY KEY,
    proveedor_id  INT         NOT NULL REFERENCES proveedores(id),
    usuario_id    INT         NOT NULL REFERENCES usuarios(id),
    fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observacion   VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS detalle_ingreso (
    id            SERIAL PRIMARY KEY,
    ingreso_id    INT           NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
    repuesto_id   INT           NOT NULL REFERENCES repuestos(id),
    cantidad      INT           NOT NULL CHECK (cantidad > 0),
    costo_unit    NUMERIC(10,2) NOT NULL CHECK (costo_unit >= 0)
);

-- M4. Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id         SERIAL PRIMARY KEY,
    nombre     VARCHAR(120) NOT NULL,
    documento  VARCHAR(15)  UNIQUE,      -- DNI o RUC
    telefono   VARCHAR(20),
    direccion  VARCHAR(200),
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- M5. Ventas
CREATE TABLE IF NOT EXISTS ventas (
    id           SERIAL PRIMARY KEY,
    numero       VARCHAR(20)   UNIQUE,   -- número del comprobante interno
    cliente_id   INT           REFERENCES clientes(id),  -- opcional
    usuario_id   INT           NOT NULL REFERENCES usuarios(id),
    fecha        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    total        NUMERIC(10,2) NOT NULL CHECK (total >= 0)
);

CREATE TABLE IF NOT EXISTS detalle_venta (
    id               SERIAL PRIMARY KEY,
    venta_id         INT           NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    repuesto_id      INT           NOT NULL REFERENCES repuestos(id),
    cantidad         INT           NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0)
);

-- Pedidos en línea (RF05): el cliente arma el pedido y el personal lo confirma.
-- Al confirmar se genera la venta y se descuenta el stock.
CREATE TABLE IF NOT EXISTS pedidos (
    id             SERIAL PRIMARY KEY,
    numero         VARCHAR(20)   UNIQUE,
    usuario_id     INT           NOT NULL REFERENCES usuarios(id),   -- el cliente que pide
    estado         VARCHAR(15)   NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'confirmado', 'entregado', 'cancelado')),
    total          NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    nota           VARCHAR(200),
    venta_id       INT           REFERENCES ventas(id),              -- se llena al confirmar
    creado_en      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
    id               SERIAL PRIMARY KEY,
    pedido_id        INT           NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    repuesto_id      INT           NOT NULL REFERENCES repuestos(id),
    cantidad         INT           NOT NULL CHECK (cantidad > 0),
    precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0)
);

-- Migración para bases creadas antes de los pedidos (se puede repetir sin problema):
-- permite el rol cliente y vincula cada usuario cliente con su ficha en la tabla clientes.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
    CHECK (rol IN ('administrador', 'vendedor', 'cliente'));
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cliente_id INT REFERENCES clientes(id);

-- Índices para las búsquedas más frecuentes
CREATE INDEX IF NOT EXISTS idx_repuestos_nombre  ON repuestos (LOWER(nombre));
CREATE INDEX IF NOT EXISTS idx_ventas_fecha      ON ventas (fecha);
CREATE INDEX IF NOT EXISTS idx_detalle_venta_rep ON detalle_venta (repuesto_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario   ON pedidos (usuario_id, estado);

-- Datos base: los tres modelos atendidos
INSERT INTO modelos_moto (nombre) VALUES
    ('TVS King Deluxe'), ('TVS Duramax'), ('Bajaj Torito')
ON CONFLICT (nombre) DO NOTHING;
