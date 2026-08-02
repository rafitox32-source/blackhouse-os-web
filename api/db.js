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

// --- REFERIDOS (repartidores de tarjetas, migracion 029) ---
// La casa matriz es la empresa 1: la misma regla que soy_matriz() en la base (022).
// Ojo: NO alcanza con rol === 'dueno'. Cada uno de los talleres tiene su propio dueño,
// y las comisiones son plata de la casa, no de ellos.
const EMPRESA_MATRIZ = 1;

function esMatriz(userContext) {
  return !!userContext
    && userContext.rol === 'dueno'
    && Number(userContext.empresa_id) === EMPRESA_MATRIZ;
}

// Texto libre que llega de un formulario publico (el repartidor en la calle, el visitante
// que escanea): se recorta y se limita el largo. Nada que mande el cliente se guarda sin
// pasar por aca.
function textoLimpio(valor, maximo) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().slice(0, maximo);
  return limpio.length > 0 ? limpio : null;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Coordenada que llega del navegador (migracion 032): solo se acepta si es un numero real
// dentro de rango. Cualquier otra cosa vale null y la entrega se guarda sin ubicacion.
function coordenada(valor, tope) {
  const n = Number(valor);
  return (Number.isFinite(n) && n >= -tope && n <= tope) ? n : null;
}

// --- PRECIO DE LISTA DE LA ANUALIDAD (migracion 030) ---
// No hay tabla de precios en esta base: los S/400 viven en la documentacion comercial y
// aca. Es el unico lugar del codigo donde esta el precio, y de el sale el precio
// promocional que ve el cliente que llega con el codigo de un repartidor.
// Si cambia el precio comercial, se cambia ACA. Con 400 y 25% de descuento -> S/300.
const PRECIO_LISTA_ANUAL = 400;

// Redondea a centimos para no arrastrar decimales largos (25% de 400 = 300 exacto, pero
// un 33% de 400 daria 268.00000000000003 sin esto).
function precioConDescuento(descuentoPct) {
  const pct = Number(descuentoPct) || 0;
  return Math.round(PRECIO_LISTA_ANUAL * (100 - pct)) / 100;
}

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
    // Estas consultas se pueden hacer SIN iniciar sesión (Tracking y Resellers).
    // Lista blanca explicita de tabla+select exactos: nunca "*", para que un
    // cliente no autenticado no pueda pedir columnas nuevas sin que alguien
    // las apruebe aqui primero.
    const CONSULTAS_PUBLICAS = [
      { table: 'ordenes', select: 'modelo, estado' }, // Tracking legacy (links ya impresos antes del timeline)
      { table: 'ordenes', select: 'modelo, estado, modo_transmision, video_url' }, // Tracking basico (con video/en vivo, sin token)
      // Tracking extendido: requiere que el cliente mande tambien el token en "match"
      // (ver mas abajo, en la seccion "select"), asi que aunque el select traiga
      // saldo/evidencia, adivinar un "id" sin el token correcto no devuelve nada.
      { table: 'ordenes', select: 'modelo, estado, modo_transmision, video_url, empresa_id, fecha_cita, saldo, evidencia' },
      { table: 'empresas', select: 'nombre, telefono' }, // Nombre/telefono del taller para el tracking
      // Vitrina de "mientras esperas" en el tracking: el servidor SIEMPRE fuerza
      // categoria IN ('Accesorios','Micas') y stock>0 mas abajo (no se confia en
      // que el cliente lo pida asi), asi que esta lista blanca no habilita
      // scrapear el inventario completo (pantallas, etc.) de ningun taller.
      // El cliente filtra "Micas" a una sola fila que coincida con el modelo de
      // SU equipo (no se muestran las 100+ micas de otros modelos).
      { table: 'productos', select: 'id, nombre, precio, stock, categoria, modelo_compatible, foto_url' },
      { table: 'usuarios', select: 'nombre_completo, nickname, avatar, estado, pais' }, // Resellers
    ];
    const isPublicQuery = action === 'select' && CONSULTAS_PUBLICAS.some(c => c.table === table && c.select === select);
    // "pedido_accesorio" tambien es publico (cliente del tracking, sin login):
    // no se valida con JWT sino con el tracking_token exacto de esa orden,
    // verificado mas abajo en su propio bloque.
    // Los referidos tampoco usan JWT (migracion 029): "referidos_lista" y "referido_lead"
    // los toca un visitante sin cuenta que acaba de escanear la tarjeta, y las dos del
    // repartidor se validan con SU token uuid, igual que "pedido_accesorio" con el
    // tracking_token. Las del panel (referidos_panel, licencia_referido, comision_marcar)
    // NO estan aca a proposito: esas exigen JWT y ademas ser la casa matriz.
    const ACCIONES_REFERIDOS_SIN_JWT = ['referidos_lista', 'referido_lead', 'entrega_registrar', 'entregas_mias', 'entregas_cerca'];
    const esAccionPublica = isPublicQuery
      || action === 'pedido_accesorio'
      || ACCIONES_REFERIDOS_SIN_JWT.includes(action);
    let userContext = null;

    if (!esAccionPublica) {
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

    // --- PEDIDO DE ACCESORIOS (publico, tracking del cliente) ---
    // El cliente arma un pedido desde el tracking y queda "pendiente": NUNCA
    // toca costo/saldo de la orden por si solo, eso lo hace un humano del
    // taller desde el panel de escritorio (decision explicita, no automatica).
    // Nunca se confia en precio/nombre que mande el navegador: todo se vuelve
    // a consultar aqui con la llave maestra. El unico "acceso" que demuestra
    // el cliente es conocer el tracking_token exacto de ESA orden.
    if (action === 'pedido_accesorio') {
      const { orden_id, tracking_token, items } = req.body;
      if (!orden_id || !tracking_token || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Faltan datos del pedido.' });
      }

      const { data: orden, error: errOrden } = await supabase
        .from('ordenes')
        .select('id, empresa_id, modelo')
        .eq('id', orden_id)
        .eq('tracking_token', tracking_token)
        .single();
      if (errOrden || !orden) {
        return res.status(404).json({ error: 'Orden no encontrada o link inválido.' });
      }

      const idsPedidos = items.map(it => Number(it && it.producto_id)).filter(n => Number.isInteger(n) && n > 0);
      if (idsPedidos.length === 0) {
        return res.status(400).json({ error: 'Pedido vacío.' });
      }

      // Se re-consultan precio/stock/categoria reales: jamas lo que mande el cliente.
      const { data: productosReales, error: errProd } = await supabase
        .from('productos')
        .select('id, nombre, precio, stock, categoria')
        .in('id', idsPedidos)
        .eq('empresa_id', orden.empresa_id)
        .in('categoria', ['Accesorios', 'Micas'])
        .gt('stock', 0);
      if (errProd) return res.status(400).json({ error: errProd.message });

      const itemsFinales = [];
      let total = 0;
      for (const it of items) {
        const prod = (productosReales || []).find(p => p.id === Number(it.producto_id));
        if (!prod) continue; // ignora productos que no existan/no sean de esa empresa/categoria
        const cantidad = Math.min(Math.max(parseInt(it.cantidad, 10) || 0, 0), 20);
        if (cantidad <= 0) continue;
        itemsFinales.push({ producto_id: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad });
        total += prod.precio * cantidad;
      }

      if (itemsFinales.length === 0) {
        return res.status(400).json({ error: 'Ninguno de los productos pedidos está disponible.' });
      }

      const { data: pedido, error: errPedido } = await supabase
        .from('pedidos_accesorios')
        .insert([{ orden_id: orden.id, empresa_id: orden.empresa_id, items: itemsFinales, total }])
        .select()
        .single();
      if (errPedido) return res.status(400).json({ error: errPedido.message });

      // La notificacion ya NO va por el chat: el panel de escritorio consulta
      // pedidos_accesorios directamente (badge de campana, ver index.html).
      return res.status(200).json({ success: true, pedidoId: pedido.id, total, items: itemsFinales });
    }

    // --- REFERIDOS: lista para el paso "¿quién te dio la tarjeta?" (publica) ---
    // Solo id y nombre_publico. Ni el telefono, ni el codigo, ni el token personal: esta
    // lista la ve cualquiera que abra caracteristicas.html.
    if (action === 'referidos_lista') {
      const { data, error } = await supabase
        .from('repartidores')
        .select('id, nombre_publico, descuento_pct')
        .eq('activo', true)
        .order('nombre_publico', { ascending: true });
      if (error) return res.status(400).json({ error: error.message });

      // El precio promocional lo calcula el servidor: el navegador nunca decide cuanto
      // paga nadie, solo lo muestra.
      const lista = (data || []).map(r => ({
        id: r.id,
        nombre_publico: r.nombre_publico,
        precio_promo: precioConDescuento(r.descuento_pct),
      }));
      return res.status(200).json({ success: true, data: lista, precio_lista: PRECIO_LISTA_ANUAL });
    }

    // --- REFERIDOS: registrar el lead y devolver el codigo para el WhatsApp (publica) ---
    // El codigo viaja despues en el texto pre-llenado del mensaje. Ese es el truco que
    // hace que la atribucion sobreviva el salto a la app de WhatsApp, donde se pierden
    // cookies y sesiones.
    if (action === 'referido_lead') {
      const { repartidor_id, visitante } = req.body;
      const visitanteOk = (typeof visitante === 'string' && RE_UUID.test(visitante)) ? visitante : null;

      // "No recuerdo quién me la dio": la fila se guarda igual, sin repartidor. Despues
      // se puede completar a mano desde el panel, cuando el se lo pregunte por WhatsApp.
      if (repartidor_id === null || repartidor_id === undefined || repartidor_id === '') {
        const { error: errAnon } = await supabase
          .from('leads')
          .insert([{ repartidor_id: null, origen: 'tarjeta', visitante: visitanteOk }]);
        if (errAnon && errAnon.code !== '23505') {
          return res.status(400).json({ error: errAnon.message });
        }
        return res.status(200).json({ success: true, codigo: null, nombre: null });
      }

      const idRepartidor = Number(repartidor_id);
      if (!Number.isInteger(idRepartidor) || idRepartidor <= 0) {
        return res.status(400).json({ error: 'Repartidor inválido.' });
      }

      const { data: rep, error: errRep } = await supabase
        .from('repartidores')
        .select('id, codigo, nombre_publico, descuento_pct')
        .eq('id', idRepartidor)
        .eq('activo', true)
        .single();
      if (errRep || !rep) {
        return res.status(404).json({ error: 'Ese repartidor no existe o ya no está activo.' });
      }

      // El indice unico (visitante, repartidor_id) hace que tocar WhatsApp cinco veces
      // sea UN lead y no cinco. Un choque ahi no es un error: se sigue de largo.
      const { error: errLead } = await supabase
        .from('leads')
        .insert([{ repartidor_id: rep.id, origen: 'tarjeta', visitante: visitanteOk }]);
      if (errLead && errLead.code !== '23505') {
        return res.status(400).json({ error: errLead.message });
      }

      return res.status(200).json({
        success: true,
        codigo: rep.codigo,
        nombre: rep.nombre_publico,
        precio_lista: PRECIO_LISTA_ANUAL,
        precio_promo: precioConDescuento(rep.descuento_pct),
      });
    }

    // --- REFERIDOS: lo del repartidor, validado con SU token uuid (link personal) ---
    // Mismo patron que "pedido_accesorio": sin usuario ni contraseña, el unico "acceso"
    // que demuestra es conocer su token. Todo lo que devuelve esta acotado a SU id.
    if (action === 'entrega_registrar' || action === 'entregas_mias' || action === 'entregas_cerca') {
      const tokenRep = typeof req.body.token === 'string' ? req.body.token.trim() : '';
      if (!RE_UUID.test(tokenRep)) {
        return res.status(401).json({ error: 'Link inválido.' });
      }

      const { data: rep, error: errRep } = await supabase
        .from('repartidores')
        .select('id, nombre_publico, codigo, comision_pct, descuento_pct, activo')
        .eq('token', tokenRep)
        .single();
      if (errRep || !rep || !rep.activo) {
        return res.status(401).json({ error: 'Link inválido o repartidor desactivado.' });
      }

      if (action === 'entrega_registrar') {
        const taller = textoLimpio(req.body.taller_nombre, 120);
        if (!taller) {
          return res.status(400).json({ error: 'Falta el nombre del taller.' });
        }

        // Latitud y longitud van juntas o no van: una sola no ubica nada. Si el repartidor
        // no dio permiso de ubicación, la entrega se guarda igual — registrar el taller es
        // lo importante, la coordenada es una mejora.
        const lat = coordenada(req.body.lat, 90);
        const lng = coordenada(req.body.lng, 180);
        const hayPunto = lat !== null && lng !== null;
        const prec = Number(req.body.precision_m);

        const { data: creada, error: errIns } = await supabase
          .from('entregas')
          .insert([{
            repartidor_id: rep.id, // del token, nunca del cuerpo del pedido
            taller_nombre: taller,
            direccion: textoLimpio(req.body.direccion, 200),
            distrito: textoLimpio(req.body.distrito, 80),
            contacto: textoLimpio(req.body.contacto, 120),
            telefono: textoLimpio(req.body.telefono, 40),
            notas: textoLimpio(req.body.notas, 500),
            lat: hayPunto ? lat : null,
            lng: hayPunto ? lng : null,
            precision_m: (hayPunto && Number.isFinite(prec) && prec >= 0) ? Math.round(prec) : null,
          }])
          .select('id')
          .single();
        if (errIns) return res.status(400).json({ error: errIns.message });
        return res.status(200).json({ success: true, id: creada.id, con_ubicacion: hayPunto });
      }

      // --- Marcas cercanas, de TODOS los repartidores, para no repetir el mismo local ---
      if (action === 'entregas_cerca') {
        const lat = coordenada(req.body.lat, 90);
        const lng = coordenada(req.body.lng, 180);
        if (lat === null || lng === null) {
          return res.status(400).json({ error: 'Falta la ubicación desde dónde buscar.' });
        }
        const radio = Math.min(Math.max(Number(req.body.radio_m) || 1500, 100), 20000);

        // Caja de coordenadas alrededor del punto: un grado de latitud son ~111320 m, y en
        // longitud el ancho se achica con el coseno de la latitud. La distancia exacta se
        // calcula en el navegador sobre estas pocas filas (ver la 032: no hace falta PostGIS).
        const dLat = radio / 111320;
        const dLng = radio / (111320 * Math.max(Math.cos(lat * Math.PI / 180), 0.01));

        const { data, error } = await supabase
          .from('entregas')
          .select('id, repartidor_id, taller_nombre, distrito, lat, lng, creado_en')
          .not('lat', 'is', null)
          .gte('lat', lat - dLat).lte('lat', lat + dLat)
          .gte('lng', lng - dLng).lte('lng', lng + dLng)
          .order('creado_en', { ascending: false })
          .limit(300);
        if (error) return res.status(400).json({ error: error.message });

        // Lo que un repartidor ve de la marca de OTRO: dónde, qué taller y cuándo. NO el
        // contacto, NO el teléfono y NO de quién es. Alcanza para no repetir el local sin
        // entregarle a cada uno la agenda de clientes de los demás.
        const marcas = (data || []).map(e => ({
          taller_nombre: e.taller_nombre,
          distrito: e.distrito,
          lat: Number(e.lat),
          lng: Number(e.lng),
          creado_en: e.creado_en,
          mia: e.repartidor_id === rep.id,
        }));
        return res.status(200).json({ success: true, marcas, radio_m: radio });
      }

      // entregas_mias: sus ultimas entregas y sus numeros. Nada de otros repartidores.
      const [listado, totalEntregas, totalLeads, licenciasSuyas] = await Promise.all([
        supabase.from('entregas')
          .select('id, taller_nombre, distrito, direccion, contacto, telefono, lat, lng, creado_en')
          .eq('repartidor_id', rep.id).order('creado_en', { ascending: false }).limit(100),
        supabase.from('entregas').select('id', { count: 'exact', head: true }).eq('repartidor_id', rep.id),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('repartidor_id', rep.id),
        supabase.from('licencias').select('comision_monto, comision_estado').eq('repartidor_id', rep.id),
      ]);
      if (listado.error) return res.status(400).json({ error: listado.error.message });

      const filasLic = licenciasSuyas.data || [];
      const sumaPorEstado = (estado) => filasLic
        .filter(l => l.comision_estado === estado)
        .reduce((t, l) => t + Number(l.comision_monto || 0), 0);

      return res.status(200).json({
        success: true,
        repartidor: {
          nombre: rep.nombre_publico,
          codigo: rep.codigo,
          comision_pct: rep.comision_pct,
          precio_lista: PRECIO_LISTA_ANUAL,
          precio_promo: precioConDescuento(rep.descuento_pct),
        },
        entregas: listado.data || [],
        totales: {
          entregas: totalEntregas.count || 0,
          leads: totalLeads.count || 0,
          ventas: filasLic.length,
          comision_pendiente: sumaPorEstado('pendiente'),
          comision_pagada: sumaPorEstado('pagada'),
        },
      });
    }

    // --- REFERIDOS: panel de la casa matriz (exige JWT + ser la empresa 1) ---
    if (action === 'referidos_panel' || action === 'referido_guardar'
        || action === 'licencia_referido' || action === 'comision_marcar') {
      if (!esMatriz(userContext)) {
        return res.status(403).json({ error: 'Solo la casa matriz puede ver o tocar los referidos.' });
      }

      if (action === 'referido_guardar') {
        const nombre = textoLimpio(req.body.nombre, 120);
        const nombrePublico = textoLimpio(req.body.nombre_publico, 60) || nombre;
        const codigo = (textoLimpio(req.body.codigo, 16) || '').toUpperCase();
        const pct = Number(req.body.comision_pct);

        const campos = {
          telefono: textoLimpio(req.body.telefono, 40),
          zona: textoLimpio(req.body.zona, 80),
          activo: req.body.activo !== false,
        };
        if (nombre) campos.nombre = nombre;
        if (nombrePublico) campos.nombre_publico = nombrePublico;
        if (Number.isFinite(pct) && pct >= 0 && pct <= 100) campos.comision_pct = pct;

        // Descuento que consigue el cliente con su codigo (migracion 030). El tope de 90
        // lo repite la base con un CHECK: aca es para dar un error entendible antes.
        const desc = Number(req.body.descuento_pct);
        if (Number.isFinite(desc) && desc >= 0 && desc <= 90) campos.descuento_pct = desc;

        if (req.body.id) {
          // Al editar, el codigo no se toca: ya salio impreso en mensajes de WhatsApp y
          // esta apuntado en leads viejos. Cambiarlo rompe el rastro hacia atras.
          const { data, error } = await supabase
            .from('repartidores').update(campos).eq('id', Number(req.body.id)).select('id').single();
          if (error) return res.status(400).json({ error: error.message });
          return res.status(200).json({ success: true, id: data.id });
        }

        if (!campos.nombre) return res.status(400).json({ error: 'Falta el nombre.' });
        if (!/^[A-Z0-9]{2,16}$/.test(codigo)) {
          return res.status(400).json({ error: 'El código debe ser de 2 a 16 letras o números, sin espacios ni tildes.' });
        }
        const { data, error } = await supabase
          .from('repartidores').insert([{ ...campos, codigo }]).select('id, token').single();
        if (error) {
          if (error.code === '23505') return res.status(400).json({ error: `El código "${codigo}" ya está usado por otro repartidor.` });
          return res.status(400).json({ error: error.message });
        }
        return res.status(200).json({ success: true, id: data.id, token: data.token });
      }

      // La comision se paga UNA SOLA VEZ, en la primera venta de ese taller: las
      // renovaciones no generan comision (decision del dueño, 2026-08-02). No hace falta
      // codigo para impedirlo: renovar va por licencia_actualizar(), que solo mueve
      // empresas.fecha_de_vencimiento y nunca inserta en `licencias`, que es donde vive la
      // comision. El unico modo de pagar dos veces es emitir un codigo nuevo para una
      // renovacion y asignarle un repartidor a mano — por eso el panel lo avisa. Detectarlo
      // automaticamente no se puede: `licencias` no tiene ninguna columna que la ate a la
      // empresa que la usó.
      if (action === 'licencia_referido') {
        const licenciaId = Number(req.body.licencia_id);
        if (!Number.isInteger(licenciaId) || licenciaId <= 0) {
          return res.status(400).json({ error: 'Licencia inválida.' });
        }
        const monto = Number(req.body.venta_monto);
        if (!Number.isFinite(monto) || monto < 0) {
          return res.status(400).json({ error: 'Monto de venta inválido.' });
        }

        // Sin repartidor: la venta no le corresponde a nadie y vuelve a 'na'.
        if (!req.body.repartidor_id) {
          const { error } = await supabase.from('licencias').update({
            repartidor_id: null, venta_monto: monto,
            comision_monto: null, comision_estado: 'na', comision_pagada_en: null,
          }).eq('id', licenciaId);
          if (error) return res.status(400).json({ error: error.message });
          return res.status(200).json({ success: true, comision: 0 });
        }

        // El porcentaje sale del repartidor en la base, nunca de lo que mande el navegador.
        const { data: rep, error: errRep } = await supabase
          .from('repartidores').select('id, comision_pct').eq('id', Number(req.body.repartidor_id)).single();
        if (errRep || !rep) return res.status(404).json({ error: 'Repartidor no encontrado.' });

        // La comisión sale del PRECIO DE LISTA, NO de lo que se cobró (migracion 031). El
        // código de descuento es un beneficio para el consumidor, no un recorte para el
        // repartidor: una venta cerrada en S/300 con el código igual paga 30% de S/400.
        // `venta_monto` se sigue guardando porque es la plata que entró de verdad.
        const comision = Math.round(PRECIO_LISTA_ANUAL * Number(rep.comision_pct)) / 100;
        const { error } = await supabase.from('licencias').update({
          repartidor_id: rep.id,
          venta_monto: monto,
          comision_monto: comision,
          comision_estado: 'pendiente',
          comision_pagada_en: null,
        }).eq('id', licenciaId);
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ success: true, comision });
      }

      if (action === 'comision_marcar') {
        const licenciaId = Number(req.body.licencia_id);
        const estado = req.body.estado;
        if (!Number.isInteger(licenciaId) || licenciaId <= 0) {
          return res.status(400).json({ error: 'Licencia inválida.' });
        }
        if (estado !== 'pendiente' && estado !== 'pagada') {
          return res.status(400).json({ error: 'Estado inválido.' });
        }
        const { error } = await supabase.from('licencias').update({
          comision_estado: estado,
          comision_pagada_en: estado === 'pagada' ? new Date().toISOString() : null,
        }).eq('id', licenciaId).eq('comision_estado', estado === 'pagada' ? 'pendiente' : 'pagada');
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ success: true });
      }

      // referidos_panel: todo lo que necesita la pantalla, en un solo viaje.
      const [repartidores, entregas, leads, licencias] = await Promise.all([
        supabase.from('repartidores')
          .select('id, nombre, nombre_publico, telefono, zona, codigo, token, comision_pct, descuento_pct, activo, creado_en')
          .order('activo', { ascending: false }).order('nombre', { ascending: true }),
        supabase.from('entregas')
          .select('id, repartidor_id, taller_nombre, distrito, direccion, contacto, telefono, lat, lng, precision_m, creado_en')
          .order('creado_en', { ascending: false }).limit(500),
        supabase.from('leads')
          .select('id, repartidor_id, origen, creado_en')
          .order('creado_en', { ascending: false }).limit(500),
        supabase.from('licencias')
          .select('id, codigo, usada, meses_duracion, dias_duracion, created_at, repartidor_id, venta_monto, comision_monto, comision_estado, comision_pagada_en')
          .order('created_at', { ascending: false }).limit(500),
      ]);
      const fallo = [repartidores, entregas, leads, licencias].find(r => r.error);
      if (fallo) return res.status(400).json({ error: fallo.error.message });

      return res.status(200).json({
        success: true,
        precio_lista: PRECIO_LISTA_ANUAL,
        repartidores: (repartidores.data || []).map(r => ({
          ...r,
          precio_promo: precioConDescuento(r.descuento_pct),
        })),
        entregas: entregas.data || [],
        leads: leads.data || [],
        licencias: licencias.data || [],
      });
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
        } else if (table === 'productos') {
          // Vitrina publica "mientras esperas" (tracking del cliente): jamas se
          // confia en un "categoria"/"stock" que mande el cliente, se fuerza aqui
          // mismo. Incluye Micas ademas de Accesorios porque el cliente filtra
          // esa lista a una sola fila que coincida con el modelo de su equipo.
          query = query.in('categoria', ['Accesorios', 'Micas']).gt('stock', 0);
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
