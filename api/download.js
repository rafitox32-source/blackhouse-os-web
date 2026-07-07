// Descarga directa: el usuario nunca ve github.com, solo nuestra propia URL.
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const ghResp = await fetch('https://api.github.com/repos/rafitox32-source/blackhouse-os/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'blackhouse-os-web' }
    });

    if (!ghResp.ok) throw new Error('No se pudo consultar la última versión');

    const release = await ghResp.json();
    const asset = (release.assets || []).find(a => a.name.endsWith('.exe'));

    if (!asset) throw new Error('No se encontró el instalador en la última versión');

    res.writeHead(302, { Location: asset.browser_download_url });
    return res.end();

  } catch (error) {
    console.error('Error en /api/download:', error);
    // Último recurso: mandar a la página de releases en vez de romper la descarga
    res.writeHead(302, { Location: 'https://github.com/rafitox32-source/blackhouse-os/releases/latest' });
    return res.end();
  }
};
