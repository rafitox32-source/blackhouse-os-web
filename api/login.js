const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Debe coincidir exactamente con el secreto usado para verificar en api/db.js
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_KEY;

module.exports = async (req, res) => {
  // Set CORS headers for Vercel Serverless Function
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!JWT_SECRET) {
    console.error('FALTA JWT_SECRET/SUPABASE_KEY en las variables de entorno.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta' });
  }

  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    // Buscamos al usuario en la base de datos (activo)
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('usuario', usuario)
      .eq('estado', 'activo')
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Validamos contraseña con bcrypt
    const match = await bcrypt.compare(password, user.password).catch(() => false);
    if (!match) {
      // Fallback a texto plano por compatibilidad con contraseñas no encriptadas
      const rawMatch = (password === user.password);
      if (!rawMatch) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }
    }

    // Generamos un JWT token
    const token = jwt.sign(
      {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol,
        empresa_id: user.empresa_id
      },
      JWT_SECRET,
      { expiresIn: '24h', algorithm: 'HS256' }
    );

    return res.status(200).json({
      success: true,
      token,
      usuario: user.usuario,
      rol: user.rol,
      empresa_id: user.empresa_id,
      nombre_completo: user.nombre_completo || '',
      nickname: user.nickname || user.usuario,
      avatar: user.avatar || ''
    });

  } catch (error) {
    console.error("Error en login API:", error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
