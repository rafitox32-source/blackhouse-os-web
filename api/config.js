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

    // Retorna las llaves enmascaradas en el servidor, no expuestas en GitHub.
    // Solo se envían al frontend en tiempo de ejecución.
    return res.status(200).json({
        url: process.env.SUPABASE_URL || 'https://flfhpffslhjcuvhxsnjz.supabase.co',
        key: process.env.SUPABASE_KEY || '' // Requiere configurarse en Vercel
    });
};
