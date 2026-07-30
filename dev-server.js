// Servidor de DESARROLLO local para ver la web de la vendedora en tiempo real.
// - Sirve los archivos estáticos de esta carpeta.
// - Emula las funciones de Vercel (/api/login, /api/db, /api/config, /api/download).
// - Recarga automática: inyecta un mini-script en los .html que refresca el navegador
//   apenas cambia cualquier .html/.js/.css de la carpeta.
// Uso:  node dev-server.js   →  http://localhost:3999/panel-vendedor.html
// (Solo para desarrollo local; NO se despliega a Vercel.)

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- Cargar credenciales: primero el .env propio de esta carpeta (ver
// .env.example) y, si no existe todavia, el del proyecto de escritorio
// (mismo Supabase) para no romper el flujo de quien ya lo tenia asi. ---
function cargarEnvDesde(envPath, etiqueta) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split(/\r?\n/).forEach(l => {
        const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    });
    console.log('Credenciales cargadas desde ' + etiqueta);
}

try {
    cargarEnvDesde(path.join(__dirname, '.env'), '.env (esta carpeta)');
} catch (e) {
    try {
        cargarEnvDesde(path.join(__dirname, '..', 'app de rafitox', '.env'), 'app de rafitox/.env');
    } catch (e2) {
        console.error('⚠️ No se encontro ningun .env (ni local ni el del proyecto principal):', e2.message);
        console.error('   Copia .env.example a .env y completa tus llaves de Supabase.');
    }
}

const PORT = 3999;
const RAIZ = __dirname;
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.webp': 'image/webp', '.mp4': 'video/mp4'
};

const RELOAD_SNIPPET = `\n<script>/* live-reload dev */(function(){let u=null;setInterval(async()=>{try{const r=await fetch('/__mtime');const t=await r.text();if(u&&t!==u)location.reload();u=t;}catch(e){}},1200);})();</script>`;

function firmaMtimes() {
    let firma = '';
    for (const f of fs.readdirSync(RAIZ)) {
        if (/\.(html|js|css)$/.test(f)) {
            try { firma += f + ':' + fs.statSync(path.join(RAIZ, f)).mtimeMs + ';'; } catch (e) { }
        }
    }
    try {
        for (const f of fs.readdirSync(path.join(RAIZ, 'api'))) {
            firma += 'api/' + f + ':' + fs.statSync(path.join(RAIZ, 'api', f)).mtimeMs + ';';
        }
    } catch (e) { }
    return firma;
}

// Adaptador estilo Vercel: agrega res.status/json/send y req.body/query.
function adaptarRes(res) {
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    res.send = s => { res.end(typeof s === 'string' ? s : JSON.stringify(s)); };
    return res;
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const ruta = decodeURIComponent(url.pathname);

    if (ruta === '/__mtime') { res.end(firmaMtimes()); return; }

    // --- API estilo Vercel (siempre con require fresco para ver cambios sin reiniciar) ---
    if (ruta.startsWith('/api/')) {
        const modPath = path.join(RAIZ, ruta.replace(/^\//, '')) + '.js';
        if (!fs.existsSync(modPath)) { res.statusCode = 404; res.end('API no encontrada'); return; }
        let cuerpo = '';
        req.on('data', c => cuerpo += c);
        req.on('end', async () => {
            try {
                delete require.cache[require.resolve(modPath)];
                const mod = require(modPath);
                const handler = mod.default || mod;
                req.body = cuerpo ? JSON.parse(cuerpo) : {};
                req.query = Object.fromEntries(url.searchParams.entries());
                await handler(req, adaptarRes(res));
            } catch (e) {
                console.error('Error en', ruta, '-', e.message);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'dev-server: ' + e.message }));
            }
        });
        return;
    }

    // --- Estáticos ---
    let archivo = ruta === '/' ? '/index.html' : ruta;
    const fisico = path.join(RAIZ, archivo);
    if (!fisico.startsWith(RAIZ) || !fs.existsSync(fisico) || fs.statSync(fisico).isDirectory()) {
        res.statusCode = 404; res.end('No encontrado'); return;
    }
    const ext = path.extname(fisico).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    if (ext === '.html') {
        let html = fs.readFileSync(fisico, 'utf8');
        html = html.includes('</body>') ? html.replace('</body>', RELOAD_SNIPPET + '\n</body>') : html + RELOAD_SNIPPET;
        res.end(html);
    } else {
        res.end(fs.readFileSync(fisico));
    }
});

server.listen(PORT, () => {
    const os = require('os');
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`\n✅ Vista previa en vivo:`);
    console.log(`   PC:      http://localhost:${PORT}/panel-vendedor.html`);
    ips.forEach(ip => console.log(`   Celular: http://${ip}:${PORT}/panel-vendedor.html  (misma red WiFi)`));
    console.log(`\nCada cambio que se guarde se refresca solo en el navegador.\n`);
});
