



        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        bhDark: '#050505',
                        bhCard: '#101010',
                        bhPurple: '#7c3aed',
                        bhGreen: '#10b981',
                        bhRed: '#ef4444'
                    }
                }
            }
        }
    

        // --- GUARDIA DE SEGURIDAD ---
        function verificarAccesoDueno() {
            const rol = localStorage.getItem('web_rol');
            if (rol !== 'dueno') {
                alert("Acceso denegado: Esta plataforma es exclusiva para administradores.");
                localStorage.clear();
                window.location.href = 'index.html';
            }
        }
        verificarAccesoDueno();

        // --- INTERFAZ ---
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        const dateEl = document.getElementById('current-date');
        if (dateEl) dateEl.innerText = new Date().toLocaleDateString('es-ES', dateOptions).toUpperCase();

        // --- MENÚ HAMBURGUESA MÓVIL ---
        function toggleMobileMenu() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobile-overlay');
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        }

        // --- NAVEGACIÓN POR TABS ---
        function switchTab(tabId, element) {
            document.querySelectorAll('.view-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');

            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                link.classList.add('border-transparent');
            });
            element.classList.add('active');
            element.classList.remove('border-transparent');

            // Cerrar menú en móvil
            if (window.innerWidth < 768) {
                toggleMobileMenu();
            }

            // Cargar datos según la vista
            if (tabId === 'view-monitor') cargarMonitorMovil();
        }

        // --- FUNCIONES DE BASE DE DATOS ---
        async function cargarAgendaReal() {
            const listaAgenda = document.getElementById('lista-agenda-id');
            if (!listaAgenda) return;

            try {
                const res = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'ordenes', select: 'cliente, modelo, fecha_cita', order: { column: 'created_at', ascending: false }, limit: 5 })
                });
                const { data, error } = await res.json();

                if (error) throw error;

                if (data && data.length > 0) {
                    listaAgenda.innerHTML = data.map(item => `
                        <li class="p-3 bg-gray-800 rounded-lg mb-2 border-l-4 border-bhPurple">
                            <div class="flex justify-between">
                                <span class="font-bold text-white">${item.cliente}</span>
                                <span class="text-xs text-gray-400">${item.fecha_cita ? item.fecha_cita.substring(0, 10) : 'Sin fecha'}</span>
                            </div>
                            <p class="text-sm text-gray-300">${item.modelo}</p>
                        </li>
                    `).join('');
                }
            } catch (err) {
                console.error("Error cargando agenda:", err);
            }
        }

        async function cargarFeedReal() {
            const container = document.getElementById('feed-container');
            if (!container) return;

            try {
                const res = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'feed_taller', order: { column: 'created_at', ascending: false }, limit: 10 })
                });
                const { data, error } = await res.json();

                if (error) throw error;

                if (data && data.length > 0) {
                    container.innerHTML = data.map(item => `
                        <div class="flex gap-3" style="animation: fadeIn 0.5s;">
                            <div class="mt-1 w-2 h-2 rounded-full bg-blue-400 shrink-0"></div>
                            <div>
                                <p class="text-sm text-gray-300">
                                    <strong class="text-white">${item.usuario || 'Sistema'}</strong> ${item.mensaje || ''}
                                </p>
                                <p class="text-xs text-gray-500 mt-1 font-mono">Historial</p>
                            </div>
                        </div>
                    `).join('');
                }
            } catch (err) {
                console.error("Error cargando feed:", err);
            }
        }

        async function cargarAsistenciaReal() {
            const tbody = document.getElementById('asistencia-tbody');
            if (!tbody) return;

            try {
                const res = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'asistencia', order: { column: 'created_at', ascending: false }, limit: 10 })
                });
                const { data, error } = await res.json();

                if (error) throw error;

                if (data && data.length > 0) {
                    tbody.innerHTML = data.map(item => `
                        <tr class="hover:bg-white/5 transition">
                            <td class="py-3 px-2 font-bold text-white">${item.usuario || 'Empleado'}</td>
                            <td class="py-3 px-2 font-mono text-sm">${item.hora_entrada || '--:--'}</td>
                            <td class="py-3 px-2">
                                <span class="bg-bhGreen/10 text-bhGreen text-xs font-bold px-2 py-1 rounded-full">${item.hora_salida ? 'Completo' : 'Activo'}</span>
                            </td>
                            <td class="py-3 px-2 text-right text-bhPurple font-bold">${item.ordenes_completadas || 0} órdenes</td>
                        </tr>
                    `).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-gray-500">No hay registros de asistencia para hoy.</td></tr>';
                }
            } catch (err) {
                console.error("Error cargando asistencia:", err);
                tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-gray-500">Error al cargar asistencia.</td></tr>';
            }
        }

        async function cargarKPIs() {
            try {
                const hoy = new Date().toISOString().split('T')[0];
                const res = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'ordenes', select: 'costo, estado, created_at' })
                });
                const { data: ordenes, error } = await res.json();
                if (error) throw error;

                let ingresosHoy = 0, equiposListos = 0, recibidosHoy = 0, entregadosHoy = 0;

                if (ordenes && ordenes.length > 0) {
                    ordenes.forEach(orden => {
                        const estadoLogico = orden.estado ? orden.estado.toLowerCase().trim() : '';
                        if (estadoLogico === 'listo') equiposListos++;
                        if (orden.created_at && orden.created_at.startsWith(hoy)) {
                            if (estadoLogico === 'recibido' || estadoLogico === 'por asignar' || estadoLogico === 'en proceso') recibidosHoy++;
                            if (estadoLogico === 'entregado' || estadoLogico === 'pagado') {
                                entregadosHoy++;
                                ingresosHoy += parseFloat(orden.costo || 0);
                            }
                        }
                    });
                }

                const ticketPromedio = entregadosHoy > 0 ? (ingresosHoy / entregadosHoy) : 0;
                document.getElementById('kpi-ingresos').innerHTML = `S/ ${ingresosHoy.toFixed(2)}`;
                document.getElementById('kpi-listos').innerText = equiposListos;
                document.getElementById('kpi-flujo').innerHTML = `${entregadosHoy} <span class="text-lg text-gray-500 font-normal">/ ${recibidosHoy}</span>`;
                document.getElementById('kpi-ticket').innerHTML = `S/ ${ticketPromedio.toFixed(2)}`;
            } catch (err) {
                console.error("Error al cargar KPIs:", err);
            }
        }

        async function cargarGraficaReal() {
            try {
                const fechas = [], labels = [], datosIngresos = [0, 0, 0, 0, 0, 0, 0];
                for (let i = 6; i >= 0; i--) {
                    let d = new Date(); d.setDate(d.getDate() - i);
                    let yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
                    fechas.push(`${yyyy}-${mm}-${dd}`);
                    labels.push(i === 0 ? 'Hoy' : (d.toLocaleDateString('es-ES', { weekday: 'short' }).charAt(0).toUpperCase() + d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(1)));
                }

                const fechaMasAntigua = fechas[0];
                const res = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'ordenes', select: 'costo, estado, created_at' })
                });
                let { data: ordenesData, error } = await res.json();
                const ordenes = ordenesData ? ordenesData.filter(o => o.created_at >= fechaMasAntigua) : [];
                if (error) throw error;

                if (ordenes && ordenes.length > 0) {
                    ordenes.forEach(orden => {
                        const estadoLogico = orden.estado ? orden.estado.toLowerCase().trim() : '';
                        if (estadoLogico === 'entregado' || estadoLogico === 'pagado') {
                            const fechaOrden = orden.created_at.split('T')[0];
                            const index = fechas.indexOf(fechaOrden);
                            if (index !== -1) datosIngresos[index] += parseFloat(orden.costo || 0);
                        }
                    });
                }

                const ctx = document.getElementById('financeChart').getContext('2d');
                let gradient = ctx.createLinearGradient(0, 0, 0, 300);
                gradient.addColorStop(0, 'rgba(124, 58, 237, 0.5)');
                gradient.addColorStop(1, 'rgba(124, 58, 237, 0)');

                const chartStatus = Chart.getChart("financeChart");
                if (chartStatus) chartStatus.destroy();

                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Ingresos (S/)',
                            data: datosIngresos,
                            borderColor: '#7c3aed',
                            backgroundColor: gradient,
                            borderWidth: 3,
                            pointBackgroundColor: '#10b981',
                            pointBorderColor: '#fff',
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: '#101010',
                                titleColor: '#7c3aed',
                                bodyColor: '#fff',
                                borderColor: '#333',
                                borderWidth: 1,
                                padding: 10,
                                displayColors: false,
                                callbacks: { label: function(context) { return 'S/ ' + context.parsed.y.toFixed(2); } }
                            }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#6b7280' } },
                            x: { grid: { display: false }, ticks: { color: '#6b7280' } }
                        }
                    }
                });
            } catch (err) {
                console.error("Error al cargar gráfica:", err);
            }
        }

        async function cargarLicenciaSaaS() {
            try {
                const res = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'licencias', match: { usada: true }, order: { column: 'created_at', ascending: false }, limit: 1 })
                });
                const { data: licenciasData, error: errLicencia } = await res.json();
                const licencia = licenciasData && licenciasData.length > 0 ? licenciasData[0] : null;
                if (errLicencia) throw errLicencia;

                if (licencia) {
                    const fechaActivacion = new Date(licencia.created_at);
                    const fechaVencimiento = new Date(licencia.created_at);
                    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + licencia.meses_duracion);
                    const hoy = new Date();
                    const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));
                    const totalDias = Math.ceil((fechaVencimiento - fechaActivacion) / (1000 * 60 * 60 * 24));
                    let progreso = 100 - ((diasRestantes / totalDias) * 100);
                    if (progreso > 100) progreso = 100;
                    if (progreso < 0) progreso = 0;

                    const optsFecha = { year: 'numeric', month: 'long', day: 'numeric' };
                    const fechaCorteTexto = fechaVencimiento.toLocaleDateString('es-ES', optsFecha);

                    document.getElementById('licencia-plan').innerHTML = `Plan Taller Pro <i class="fa-solid fa-crown text-yellow-500 ml-2"></i>`;
                    document.getElementById('licencia-dias').innerText = `${diasRestantes > 0 ? diasRestantes : 0} Días`;
                    document.getElementById('licencia-progreso').style.width = `${progreso}%`;
                    document.getElementById('licencia-corte').innerText = `Próximo corte: ${fechaCorteTexto}`;
                } else {
                    document.getElementById('licencia-plan').innerHTML = `Sin Plan Activo <i class="fa-solid fa-circle-exclamation text-red-500 ml-2"></i>`;
                    document.getElementById('licencia-dias').innerText = `0 Días`;
                    document.getElementById('licencia-progreso').style.width = `0%`;
                    document.getElementById('licencia-corte').innerText = `Licencia Vencida o No Encontrada`;
                    const badge = document.getElementById('licencia-badge');
                    if (badge) { badge.innerText = 'VENCIDO'; badge.classList.remove('bg-bhPurple'); badge.classList.add('bg-red-500'); }
                }

                // Historial de recibos
                const tbody = document.getElementById('recibos-tbody');
                if (!tbody) return;

                const resRecibos = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'recibos', order: { column: 'id', ascending: false } })
                });
                const { data: recibos, error: errRecibos } = await resRecibos.json();
                if (errRecibos) throw errRecibos;

                if (recibos && recibos.length > 0) {
                    tbody.innerHTML = recibos.map(recibo => `
                        <tr class="hover:bg-white/5 transition">
                            <td class="py-4 px-6">${recibo.fecha}</td>
                            <td class="py-4 px-6">${recibo.concepto}</td>
                            <td class="py-4 px-6 font-mono text-white">S/ ${parseFloat(recibo.monto).toFixed(2)}</td>
                            <td class="py-4 px-6"><span class="bg-bhGreen/10 text-bhGreen text-xs font-bold px-3 py-1 rounded-full">${recibo.estado}</span></td>
                            <td class="py-4 px-6 text-right"><button class="text-bhPurple hover:text-white transition"><i class="fa-solid fa-download"></i> PDF</button></td>
                        </tr>
                    `).join('');
                }
            } catch (err) {
                console.error("Error al cargar sección SaaS:", err);
            }
        }

        async function cargarPortalB2B() {
            const tbody = document.getElementById('b2b-tbody');
            if (!tbody) return;

            try {
                const resEq = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'ordenes', limit: 5 })
                });
                const { data: equipos, error } = await resEq.json();
                if (error) throw error;

                const totalEl = document.getElementById('b2b-total');
                if (totalEl) totalEl.innerText = equipos ? equipos.length : 0;

                if (equipos && equipos.length > 0) {
                    tbody.innerHTML = equipos.map(equipo => {
                        let colorEstado = 'bg-gray-500/10 text-gray-400';
                        let estadoStr = equipo.estado ? equipo.estado.toLowerCase().trim() : '';
                        if (estadoStr === 'listo') colorEstado = 'bg-bhGreen/10 text-bhGreen';
                        else if (estadoStr === 'entregado' || estadoStr === 'pagado') colorEstado = 'bg-bhPurple/10 text-bhPurple';
                        else if (estadoStr === 'en proceso' || estadoStr === 'laboratorio') colorEstado = 'bg-blue-500/10 text-blue-400';
                        else if (estadoStr === 'por asignar' || estadoStr === 'recibido') colorEstado = 'bg-orange-500/10 text-orange-400';

                        return `
                        <tr class="hover:bg-white/5 transition">
                            <td class="py-4 px-6 font-mono text-bhPurple font-bold">ID-${equipo.id || '000'}<br><span class="text-xs text-gray-500 font-normal">${equipo.imei || 'Sin IMEI'}</span></td>
                            <td class="py-4 px-6">${equipo.modelo || 'Modelo no especificado'}</td>
                            <td class="py-4 px-6">${equipo.falla || equipo.problema || 'Revisión general'}</td>
                            <td class="py-4 px-6 text-white font-bold">S/ ${parseFloat(equipo.costo || 0).toFixed(2)}</td>
                            <td class="py-4 px-6 text-right"><span class="${colorEstado} font-bold px-3 py-1 rounded-full text-xs uppercase">${equipo.estado || 'Pendiente'}</span></td>
                        </tr>`;
                    }).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-500">No hay equipos registrados actualmente.</td></tr>';
                }
            } catch (err) {
                console.error("Error al cargar B2B:", err);
            }
        }

        // --- MONITOR MÓVIL ---
        async function cargarMonitorMovil() {
            try {
                const res = await fetch('/api/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                    body: JSON.stringify({ action: 'select', table: 'ordenes', select: 'id, cliente, modelo, falla, problema, estado, costo, created_at', order: { column: 'created_at', ascending: false } })
                });
                const { data: ordenes, error } = await res.json();
                if (error) throw error;

                const hoy = new Date().toISOString().split('T')[0];
                let pendientes = 0, enProceso = 0, completados = 0, entregados = 0, ingresosHoy = 0;

                if (ordenes && ordenes.length > 0) {
                    ordenes.forEach(o => {
                        const est = o.estado ? o.estado.toLowerCase().trim() : '';
                        if (est === 'recibido' || est === 'por asignar') pendientes++;
                        else if (est === 'en proceso' || est === 'laboratorio') enProceso++;
                        else if (est === 'listo' || est === 'completado') completados++;
                        else if (est === 'entregado' || est === 'pagado') entregados++;
                        if (o.created_at && o.created_at.startsWith(hoy) && (est === 'entregado' || est === 'pagado')) {
                            ingresosHoy += parseFloat(o.costo || 0);
                        }
                    });
                }

                // KPIs
                document.getElementById('mon-pendientes').innerText = pendientes;
                document.getElementById('mon-en-proceso').innerText = enProceso;
                document.getElementById('mon-completados').innerText = completados;
                document.getElementById('mon-entregados').innerText = entregados;
                document.getElementById('mon-ingresos').innerText = `S/ ${ingresosHoy.toFixed(2)}`;
                const totalEntregadosHoy = ordenes ? ordenes.filter(o => o.created_at && o.created_at.startsWith(hoy) && (o.estado || '').toLowerCase().trim() === 'entregado').length : 0;
                document.getElementById('mon-ticket').innerText = `S/ ${totalEntregadosHoy > 0 ? (ingresosHoy / totalEntregadosHoy).toFixed(2) : '0.00'}`;

                // Tabla de órdenes activas (no entregadas)
                const tbody = document.getElementById('monitor-ordenes-tbody');
                const activas = ordenes ? ordenes.filter(o => {
                    const est = o.estado ? o.estado.toLowerCase().trim() : '';
                    return est !== 'entregado' && est !== 'pagado';
                }).slice(0, 15) : [];

                if (activas.length > 0) {
                    tbody.innerHTML = activas.map(o => {
                        const est = o.estado ? o.estado.toLowerCase().trim() : '';
                        let colorEstado = 'bg-gray-500/10 text-gray-400';
                        let dotColor = 'gray';
                        if (est === 'listo' || est === 'completado') { colorEstado = 'bg-bhGreen/10 text-bhGreen'; dotColor = 'green'; }
                        else if (est === 'en proceso' || est === 'laboratorio') { colorEstado = 'bg-blue-500/10 text-blue-400'; dotColor = 'blue'; }
                        else if (est === 'recibido' || est === 'por asignar') { colorEstado = 'bg-orange-500/10 text-orange-400'; dotColor = 'orange'; }

                        return `
                        <tr class="hover:bg-white/5 transition">
                            <td class="py-3 px-4 font-mono text-bhPurple font-bold text-xs">#${String(o.id).padStart(4, '0')}</td>
                            <td class="py-3 px-4 text-white font-semibold text-sm">${o.cliente || 'Sin nombre'}</td>
                            <td class="py-3 px-4 text-gray-400 text-sm">${o.modelo || '--'}</td>
                            <td class="py-3 px-4 text-gray-500 text-xs">${o.falla || o.problema || 'Revisión'}</td>
                            <td class="py-3 px-4 text-right"><span class="${colorEstado} font-bold px-2 py-1 rounded-full text-xs">${o.estado || 'Pendiente'}</span></td>
                        </tr>`;
                    }).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-500">🎉 No hay órdenes pendientes.</td></tr>';
                }

                // Feed de actividad
                const feedEl = document.getElementById('monitor-feed');
                try {
                    const resFeed = await fetch('/api/db', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
                        body: JSON.stringify({ action: 'select', table: 'feed_taller', order: { column: 'created_at', ascending: false }, limit: 8 })
                    });
                    const { data: feed } = await resFeed.json();
                    if (feed && feed.length > 0) {
                        feedEl.innerHTML = feed.map(item => {
                            const colors = ['bg-bhGreen', 'bg-blue-400', 'bg-orange-400', 'bg-bhPurple', 'bg-pink-400'];
                            const dotColor = colors[Math.floor(Math.random() * colors.length)];
                            return `
                            <div class="flex gap-3">
                                <div class="mt-1 w-2 h-2 rounded-full ${dotColor} shrink-0"></div>
                                <div>
                                    <p class="text-sm text-gray-300"><strong class="text-white">${item.usuario || 'Sistema'}</strong> ${item.mensaje || ''}</p>
                                    <p class="text-xs text-gray-600 mt-1 font-mono">${item.created_at ? new Date(item.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                                </div>
                            </div>`;
                        }).join('');
                    } else {
                        feedEl.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No hay actividad reciente.</p>';
                    }
                } catch (e) { console.error("Error feed monitor:", e); }

                // Timestamp
                document.getElementById('mon-ultima-actualizacion').innerText = `Última actualización: ${new Date().toLocaleTimeString('es-ES')}`;

            } catch (err) {
                console.error("Error cargando Monitor Móvil:", err);
            }
        }

        // --- INICIALIZAR TODO AL CARGAR ---
        document.addEventListener('DOMContentLoaded', function() {
            cargarKPIs();
            cargarGraficaReal();
            cargarAsistenciaReal();
            cargarFeedReal();
            cargarLicenciaSaaS();
            cargarPortalB2B();
        });
    
