const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Inicializamos cliente con la llave maestra oculta
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

  try {
    const { action, table, data, match, select, order, limit } = req.body;

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
        userContext = jwt.verify(token, process.env.SUPABASE_KEY || 'default-secret');
      } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
      }
    }

    // --- COLUMNAS SENSIBLES: nunca visibles para roles que no sean "dueno",
    // sin importar lo que el cliente pida en "select". Esto es intencional:
    // vendedores/tecnicos no deben ver costos de compra ni precio mayorista.
    const COLUMNAS_OCULTAS_NO_DUENO = {
      productos: ['costo', 'costo_caycel', 'costo_samtec', 'costo_cyberphone', 'costo_amobile', 'precio_mayor', 'costo_por_confirmar'],
    };

    function selectSeguro(tabla, selectPedido, rol) {
      const ocultas = COLUMNAS_OCULTAS_NO_DUENO[tabla];
      if (!ocultas || rol === 'dueno') return selectPedido || '*';
      if (!selectPedido || selectPedido.trim() === '*') {
        // Sin columnas explicitas: no hay forma segura de saber el esquema
        // completo aqui, asi que se rechaza en vez de arriesgar una fuga.
        return null;
      }
      const columnas = selectPedido.split(',').map(c => c.trim());
      const bloqueada = columnas.find(c => ocultas.includes(c));
      if (bloqueada) return { bloqueada };
      return selectPedido;
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

        // --- SEGURIDAD BACKEND: FORZAR FILTRO POR EMPRESA_ID ---
        // Toda consulta autenticada queda atada a la empresa del token, sin
        // importar lo que mande el frontend. Esta es la frontera real de
        // aislamiento multi-empresa (antes esto tambien filtraba por
        // "usuario" para roles no-dueno, lo cual rompia lecturas de
        // catalogos compartidos como "productos" u "ordenes" para
        // vendedor/tecnico).
        if (userContext) {
           query = query.eq('empresa_id', userContext.empresa_id);
        }

        if (match) {
          // Aplicar filtros exactos (omitiendo empresa_id si ya fue forzado)
          for (const key in match) {
            if (key !== 'empresa_id' || !userContext) {
              query = query.eq(key, match[key]);
            }
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
        const datosInsert = { ...data, empresa_id: userContext.empresa_id }; // nunca confiar en el empresa_id del cliente
        if (userContext.rol !== 'dueno' && COLUMNAS_OCULTAS_NO_DUENO[table]) {
          for (const col of COLUMNAS_OCULTAS_NO_DUENO[table]) delete datosInsert[col];
        }
        query = query.insert(datosInsert).select();
        break;
      }

      case 'update': {
        // Solo usuarios logueados pueden actualizar
        if (!userContext) return res.status(401).json({ error: 'No autorizado para actualizar' });
        const datosUpdate = { ...data };
        delete datosUpdate.empresa_id; // no se permite mover un registro a otra empresa
        if (userContext.rol !== 'dueno' && COLUMNAS_OCULTAS_NO_DUENO[table]) {
          for (const col of COLUMNAS_OCULTAS_NO_DUENO[table]) delete datosUpdate[col];
        }
        query = query.update(datosUpdate).eq('empresa_id', userContext.empresa_id);
        if (match) {
          for (const key in match) {
            if (key !== 'empresa_id') query = query.eq(key, match[key]);
          }
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
