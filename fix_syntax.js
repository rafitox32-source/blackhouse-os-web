const fs = require('fs');
let content = fs.readFileSync('panel.html', 'utf8');

// Find the second instance of "const res = await fetch" inside cargarLicenciaSaaS
// We'll replace it with "const resRecibos = await fetch" and update the json() call.

const searchString = `        const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
            body: JSON.stringify({ action: 'select', table: 'recibos', order: { column: 'id', ascending: false } })
        });
        const { data: recibos, error: errRecibos } = await res.json();`;

const replaceString = `        const resRecibos = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
            body: JSON.stringify({ action: 'select', table: 'recibos', order: { column: 'id', ascending: false } })
        });
        const { data: recibos, error: errRecibos } = await resRecibos.json();`;

if (content.includes(searchString)) {
    content = content.replace(searchString, replaceString);
    fs.writeFileSync('panel.html', content, 'utf8');
    console.log('Fixed syntax error successfully!');
} else {
    // Maybe indentation is different
    // Let's use a regex
    content = content.replace(
        /const res = await fetch\('\/api\/db', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json', 'Authorization': 'Bearer ' \+ localStorage\.getItem\('web_token'\) \},\s*body: JSON\.stringify\(\{ action: 'select', table: 'recibos', order: \{ column: 'id', ascending: false \} \}\)\s*\}\);\s*const \{ data: recibos, error: errRecibos \} = await res\.json\(\);/,
        `const resRecibos = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
            body: JSON.stringify({ action: 'select', table: 'recibos', order: { column: 'id', ascending: false } })
        });
        const { data: recibos, error: errRecibos } = await resRecibos.json();`
    );
    fs.writeFileSync('panel.html', content, 'utf8');
    console.log('Fixed syntax error with regex successfully!');
}
