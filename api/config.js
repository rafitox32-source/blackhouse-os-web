module.exports = (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Esta ruta es pública (sin login), así que SOLO puede entregar la llave "anon"
    // (la misma que ya va hardcodeada en el cliente de escritorio, respeta RLS).
    // NUNCA debe devolver SUPABASE_KEY: esa es la llave secreta que salta el RLS.
    return res.status(200).json({
        url: process.env.SUPABASE_URL || 'https://flfhpffslhjcuvhxsnjz.supabase.co',
        key: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsZmhwZmZzbGhqY3V2aHhzbmp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4Mzg0MDMsImV4cCI6MjA4NDQxNDQwM30.9AxJDLzH2f5jJxAarw5dc1DMuvDlFY2sAr6zJBNUsFc'
    });
};
