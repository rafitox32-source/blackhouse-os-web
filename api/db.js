const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Inicializamos cliente con la llave maestra oculta
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Secreto para firmar/verificar JWT. Si algun dia falta SUPABASE_KEY, NO hay
// fallback publico: se corta en seco (ver checkeo mas abajo) en vez de abrir
// una puerta trasera con un secreto adivinable.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_KEY;

// --- COLUMNAS SENSIBLES: nunca visibles para roles que no sean "dueno",
// sin importar lo que el cliente pida en "select"/"data". Vendedores y
// tecnicos no deben ver costos de compra ni precio mayorista.
const COLUMNAS_OCULTAS_NO_DUENO = {
  productos: ['costo', 'costo_caycel', 'costo_samtec', 'costo_cyberphone', 'costo_amobile', 'precio_mayor', 'costo_por_confirmar'],
};

// --- MATRIZ DE PERMISOS: que tabla/accion puede tocar cada rol no-dueno.
// "dueno" no esta en el mapa a proposito: tiene acceso a cualquier tabla
// (siempre acotado por empresa_id, ese limite no cambia). Para
// vendedor/tecnico, si la tabla no aparece aqui, la peticion se rechaza.
const PERMISOS_POR_ROL = {
  vendedor: {
    // Las ventas normales van por RPC (registrar_venta_movil), no por insert/update directo.
    // 'insert' se agrega solo para "Vender Otros": un producto que no esta en el catalogo se
    // da de alta al vuelo (sin costo, ver COLUMNAS_OCULTAS_NO_DUENO mas abajo, que ya le
    // borra cualquier columna de costo a este rol) y despues se vende igual que cualquier
    // otro producto, por la misma RPC de siempre.
    productos: ['select', 'insert'],
    // Solo lectura: necesita el RUC/razon social/direccion de SU PROPIA
    // empresa para imprimir el encabezado de la boleta. Sigue acotado por
    // empresa (ver columnaEmpresaDe() mas abajo), no hay fuga entre
    // empresas distintas.
    empresas: ['select'],
    // Grupos de compatibilidad (micas/pantallas que comparten pieza y stock entre
    // varios modelos). Solo lectura: se usan para que la busqueda de productos
    // tambien encuentre por modelo "hermano" (ver TABLAS_HIJAS_SIN_EMPRESA_ID
    // mas abajo para como se acota grupos_compatibilidad_modelos por empresa).
    grupos_compatibilidad: ['select'],
    grupos_compatibilidad_modelos: ['select'],
    // Solo lectura: el "Cierre de Caja" del panel movil lista las boletas del
    // dia (de SU empresa, el filtro por empresa_id se fuerza mas abajo).
    // Las facturas se CREAN via RPC (generar_boleta_movil), nunca por insert.
    facturas: ['select'],
  },
  tecnico: {
    productos: ['select'],
    ordenes: ['select', 'insert'],
    grupos_compatibilidad: ['select'],
    grupos_compatibilidad_modelos: ['select'],
  },
};

// --- RPCs PERMITIDAS: llamadas a funciones de Postgres explicitamente
// habilitadas. No se permite ejecutar cualquier funcion arbitraria.
const RPCS_PERMITIDAS = {
  registrar_venta_movil: { roles: ['dueno', 'vendedor'] },
  // Genera un comprobante informativo (boleta) para una venta movil. OJO:
  // esto NO es una boleta electronica con validez tributaria ante SUNAT (para
  // eso hay que ser emisor electronico registrado, con certificado digital y
  // transmision via un OSE/PSE o el portal de SUNAT, un proyecto de
  // integracion legal/gubernamental aparte). Es un recibo con el formato y
  // los datos que SUNAT pide ver en un comprobante, pensado para mandarselo
  // al cliente por WhatsApp, no para declarar impuestos.
  generar_boleta_movil: { roles: ['dueno', 'vendedor'] },
};

// --- COLUMNA QUE ATA CADA TABLA A LA EMPRESA DEL TOKEN ---
// Casi todas las tablas tienen una columna "empresa_id". La tabla "empresas"
// es la excepcion: la fila ES la empresa, asi que se ata por su propio "id".
// Sin este mapeo, forzar ".eq('empresa_id', ...)" sobre "empresas" fallaria
// (esa tabla no tiene esa columna) en cuanto alguien pidiera "select" sobre
// ella.
function columnaEmpresaDe(tabla) {
  return tabla === 'empresas' ? 'id' : 'empresa_id';
}

// --- TABLAS HIJAS SIN COLUMNA empresa_id PROPIA ---
// grupos_compatibilidad_modelos no tiene empresa_id (solo grupo_id, marca,
// modelo, modelo_normalizado): su empresa se determina indirectamente via
// grupos_compatibilidad.empresa_id. NO podemos confiar en que el cliente
// mande un "match: { grupo_id: X }" honesto (un vendedor de la empresa 6
// podria pedir un grupo_id que en realidad es de la empresa 1 con solo
// adivinar un numero pequeño). Por eso, para estas tablas, el servidor
// resuelve primero QUE grupo_id pertenecen a la empresa del token, y fuerza
// el filtro con esos IDs — igual de estricto que ".eq('empresa_id', ...)"
// para las demas tablas, solo que en dos pasos.
const TABLAS_HIJAS_SIN_EMPRESA_ID = {
  grupos_compatibilidad_modelos: { tablaPadre: 'grupos_compatibilidad', columnaFK: 'grupo_id' },
};

function tienePermiso(rol, tabla, accion) {
  if (rol === 'dueno') return true;
  const permisosTabla = PERMISOS_POR_ROL[rol] && PERMISOS_POR_ROL[rol][tabla];
  return Array.isArray(permisosTabla) && permisosTabla.includes(accion);
}

// Reduce "alias:columna" a "columna" (PostgREST permite renombrar columnas
// con un alias, lo cual antes se colaba por el filtro de columnas ocultas).
// Cualquier parentesis (recurso embebido, ej. "productos(costo)") se
// considera sospechoso y se rechaza de plano para roles no-dueno.
function normalizarColumna(col) {
  const c = col.trim();
  if (c.includes('(') || c.includes(')')) return null;
  const idx = c.indexOf(':');
  return (idx !== -1 ? c.slice(idx + 1) : c).trim();
}

function selectSeguro(tabla, selectPedido, rol) {
  const ocultas = COLUMNAS_OCULTAS_NO_DUENO[tabla];
  if (!ocultas || rol === 'dueno') return selectPedido || '*';
  if (!selectPedido || selectPedido.trim() === '*') {
    // Sin columnas explicitas: no hay forma segura de saber el esquema
    // completo aqui, asi que se rechaza en vez de arriesgar una fuga.
    return null;
  }
  const columnas = selectPedido.split(',').map(c => normalizarColumna(c));
  if (columnas.some(c => c === null)) return { bloqueada: '(recurso embebido no permitido)' };
  const bloqueada = columnas.find(c => ocultas.includes(c));
  if (bloqueada) return { bloqueada };
  return selectPedido;
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!JWT_SECRET) {
    console.error('FALTA JWT_SECRET/SUPABASE_KEY en las variables de entorno.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta' });
  }

  try {
    const { action, table, data, match, select, order, limit, fn, params } = req.body;

    // --- PROTECCIÓN DE RUTAS PÚBLICAS ---
    // Estas consultas se pueden hacer SIN iniciar sesión (Tracking y Resellers)
    const isPublicQuery =
      (action === 'select' && table === 'ordenes' && select === 'modelo, estado') || // Tracking
      (action === 'select' && table === 'usuarios' && select === 'nombre_completo, nickname, avatar, estado, pais'); // Resellers

    let userContext = null;

    if (!isPublicQuery) {
      // Si NO es pública, exigimos el token JWT del usuario
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado. Falta token.' });
      }

      const token = authHeader.split(' ')[1];
      try {
        userContext = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
      }
    }

    // --- RPC: llamadas a funciones de Postgres pre-aprobadas ---
    if (action === 'rpc') {
      if (!userContext) return res.status(401).json({ error: 'No autorizado' });
      const permisoRpc = RPCS_PERMITIDAS[fn];
      if (!permisoRpc || !permisoRpc.roles.includes(userContext.rol)) {
        return res.status(403).json({ error: `No tienes permiso para ejecutar "${fn}"` });
      }
      // empresa_id siempre lo pone el servidor, nunca el cliente
      const resultado = await supabase.rpc(fn, { ...(params || {}), p_empresa_id: userContext.empresa_id });
      if (resultado.error) {
        return res.status(400).json({ error: resultado.error.message });
      }
      return res.status(200).json({ success: true, data: resultado.data });
    }

    // --- MATRIZ DE PERMISOS: bloquear tablas/acciones no autorizadas ---
    if (userContext && !tienePermiso(userContext.rol, table, action)) {
      return res.status(403).json({ error: `Tu rol no tiene permiso para "${action}" sobre "${table}".` });
    }

    // --- EJECUCIÓN DE CONSULTAS A SUPABASE (CON LLAVE MAESTRA) ---
    let query = supabase.from(table);

    switch (action) {
      case 'select': {
        const rolActual = userContext ? userContext.rol : null;
        const resultadoSelect = selectSeguro(table, select, rolActual);
        if (resultadoSelect === null) {
          return res.status(400).json({ error: `Para la tabla "${table}" debes pedir columnas explicitas en "select" (no "*").` });
        }
        if (resultadoSelect && resultadoSelect.bloqueada) {
          return res.status(403).json({ error: `No tienes permiso para leer la columna "${resultadoSelect.bloqueada}".` });
        }
        query = query.select(resultadoSelect);

        // --- SEGURIDAD BACKEND: FORZAR FILTRO POR EMPRESA ---
        // Toda consulta autenticada queda atada a la empresa del token, sin
        // importar lo que mande el frontend. Esta es la frontera real de
        // aislamiento multi-empresa. (columnaEmpresaDe: "id" para la propia
        // tabla "empresas", "empresa_id" para el resto)
        const colEmpresaSelect = columnaEmpresaDe(table);
        const tablaHija = TABLAS_HIJAS_SIN_EMPRESA_ID[table];

        if (tablaHija && userContext) {
          // Tabla sin empresa_id propia (ver TABLAS_HIJAS_SIN_EMPRESA_ID): resolver
          // primero que IDs de la tabla padre pertenecen a esta empresa, y forzar
          // el filtro con esos IDs en vez de confiar en un "match" del cliente.
          const { data: idsPadre, error: errPadre } = await supabase
            .from(tablaHija.tablaPadre)
            .select('id')
            .eq('empresa_id', userContext.empresa_id);
          if (errPadre) {
            return res.status(400).json({ error: errPadre.message });
          }
          const idsPermitidos = (idsPadre || []).map(r => r.id);
          // Si la empresa no tiene ningun registro padre, forzamos un ID imposible
          // para que el resultado sea vacio (no filtrar NO es una opcion segura).
          query = query.in(tablaHija.columnaFK, idsPermitidos.length > 0 ? idsPermitidos : [-1]);
        } else if (userContext) {
          query = query.eq(colEmpresaSelect, userContext.empresa_id);
        }

        if (match) {
          // Aplicar filtros exactos (omitiendo la columna de empresa si ya fue forzada,
          // y omitiendo la FK de una tabla hija porque ya se forzó arriba con la lista
          // de IDs permitidos — no se confía en el valor que mande el cliente).
          for (const key in match) {
            if (tablaHija && key === tablaHija.columnaFK) continue;
            if (key !== colEmpresaSelect || !userContext) {
              query = query.eq(key, match[key]);
            }
          }
        }
        // Filtros de rango opcionales (>= y <=), mismo patron defensivo que
        // "match": nunca pueden pisar el filtro de empresa forzado arriba.
        if (req.body.gte) {
          for (const key in req.body.gte) {
            if (key !== colEmpresaSelect) query = query.gte(key, req.body.gte[key]);
          }
        }
        if (req.body.lte) {
          for (const key in req.body.lte) {
            if (key !== colEmpresaSelect) query = query.lte(key, req.body.lte[key]);
          }
        }
        if (order) {
          query = query.order(order.column, { ascending: order.ascending });
        }
        if (limit) {
          query = query.limit(limit);
        }
        if (req.body.single) {
          query = query.single();
        }
        break;
      }

      case 'insert': {
        // Solo usuarios logueados pueden insertar
        if (!userContext) return res.status(401).json({ error: 'No autorizado para insertar' });
        const colEmpresaInsert = columnaEmpresaDe(table);
        const datosInsert = { ...data, [colEmpresaInsert]: userContext.empresa_id }; // nunca confiar en el empresa_id del cliente
        if (userContext.rol !== 'dueno' && COLUMNAS_OCULTAS_NO_DUENO[table]) {
          for (const col of COLUMNAS_OCULTAS_NO_DUENO[table]) delete datosInsert[col];
        }
        query = query.insert(datosInsert).select();
        break;
      }

      case 'update': {
        // Solo usuarios logueados pueden actualizar
        if (!userContext) return res.status(401).json({ error: 'No autorizado para actualizar' });
        if (!match || Object.keys(match).length === 0) {
          // Sin match, un update afectaria TODA la tabla de la empresa.
          return res.status(400).json({ error: 'Un "update" requiere un "match" (ej. {id: ...}) que identifique la fila.' });
        }
        const colEmpresaUpdate = columnaEmpresaDe(table);
        const datosUpdate = { ...data };
        delete datosUpdate[colEmpresaUpdate]; // no se permite mover un registro a otra empresa
        if (userContext.rol !== 'dueno' && COLUMNAS_OCULTAS_NO_DUENO[table]) {
          for (const col of COLUMNAS_OCULTAS_NO_DUENO[table]) delete datosUpdate[col];
        }
        query = query.update(datosUpdate).eq(colEmpresaUpdate, userContext.empresa_id);
        for (const key in match) {
          if (key !== colEmpresaUpdate) query = query.eq(key, match[key]);
        }
        query = query.select();
        break;
      }

      default:
        return res.status(400).json({ error: 'Acción no soportada' });
    }

    // Esperar la respuesta de Supabase
    const result = await query;

    if (result.error) {
      console.error("Error de Supabase:", result.error);
      return res.status(400).json({ error: result.error.message });
    }

    return res.status(200).json({ success: true, data: result.data });

  } catch (error) {
    console.error("Error en API DB:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
