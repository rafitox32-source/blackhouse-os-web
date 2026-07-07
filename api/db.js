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

    // --- EJECUCIÓN DE CONSULTAS A SUPABASE (CON LLAVE MAESTRA) ---
    let query = supabase.from(table);

    switch (action) {
      case 'select':
        query = query.select(select || '*');
        
        // --- SEGURIDAD BACKEND: FORZAR FILTRO POR EMPRESA_ID ---
        if (userContext && userContext.rol === 'dueno') {
           // Obligamos a que solo vea datos de su propia empresa sin importar lo que mande el frontend
           query = query.eq('empresa_id', userContext.empresa_id);
        } else if (userContext && userContext.rol !== 'dueno') {
           // Si es un empleado regular (por ejemplo), solo ve sus propios datos
           query = query.eq('usuario', userContext.usuario).eq('empresa_id', userContext.empresa_id);
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

      case 'insert':
        // Solo usuarios logueados pueden insertar
        if (!userContext) return res.status(401).json({ error: 'No autorizado para insertar' });
        query = query.insert(data).select();
        break;

      case 'update':
        // Solo usuarios logueados pueden actualizar
        if (!userContext) return res.status(401).json({ error: 'No autorizado para actualizar' });
        query = query.update(data);
        if (match) {
          for (const key in match) {
            query = query.eq(key, match[key]);
          }
        }
        query = query.select();
        break;
        
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
