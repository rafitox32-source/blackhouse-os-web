



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
    

        // --- GUARDIA DE SEGURIDAD: Solo Dueños ---
        function verificarAccesoDueno() {
            const rol = localStorage.getItem('web_rol');
            if (rol !== 'dueno') {
                alert("Acceso denegado: Esta plataforma es exclusiva para administradores.");
                localStorage.clear();
                window.location.href = 'index.html';
            }
        }
        verificarAccesoDueno();

        // --- INTERFAZ BÁSICA ---
        const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', options).toUpperCase();

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
        }

        // --- CONEXIÓN SUPABASE ---
        // Cliente Supabase eliminado. Todas las peticiones van a /api/db

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

        async function cargarAsistenciaReal() {
            const tbody = document.getElementById('asistencia-tbody');
            if (!tbody) return;

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
                            <strong class="text-white">${item.usuario}</strong> ${item.mensaje}
                        </p>
                        <p class="text-xs text-gray-500 mt-1 font-mono">Historial</p>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="text-sm text-gray-500">No hay actividad reciente en el taller.</p>';
        }
    } catch (err) {
        console.error("Error cargando el historial del feed:", err);
    }
}
async function cargarKPIs() {
    try {
        // Obtenemos la fecha de hoy (formato YYYY-MM-DD)
        const hoy = new Date().toISOString().split('T')[0];

        // Consultamos las órdenes de la tabla
        const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
            body: JSON.stringify({ action: 'select', table: 'ordenes', select: 'costo, estado, created_at' })
        });
        const { data: ordenes, error } = await res.json();

        if (error) throw error;

        let ingresosHoy = 0;
        let equiposListos = 0;
        let recibidosHoy = 0;
        let entregadosHoy = 0;

        if (ordenes && ordenes.length > 0) {
            ordenes.forEach(orden => {
                // Convertimos el estado a minúsculas y limpiamos espacios para evitar fallos
                const estadoLogico = orden.estado ? orden.estado.toLowerCase().trim() : '';

                // 1. Equipos que ya están terminados esperando al cliente
                if (estadoLogico === 'listo') {
                    equiposListos++;
                }

                // 2. Filtrar los movimientos que se registraron HOY
                if (orden.created_at && orden.created_at.startsWith(hoy)) {
                    
                    // Si entró hoy con cualquiera de estos estados, suma a los Recibidos de hoy
                    if (estadoLogico === 'recibido' || estadoLogico === 'por asignar' || estadoLogico === 'en proceso') {
                        recibidosHoy++;
                    }
                    
                    // Si hoy mismo se marcó como entregado, suma a los ingresos del día
                    if (estadoLogico === 'entregado' || estadoLogico === 'pagado') {
                        entregadosHoy++;
                        ingresosHoy += parseFloat(orden.costo || 0); 
                    }
                }
            });
        }

        // Calcular el Ticket Promedio del día
        const ticketPromedio = entregadosHoy > 0 ? (ingresosHoy / entregadosHoy) : 0;

        // Inyectar los datos calculados en los IDs del HTML
        document.getElementById('kpi-ingresos').innerHTML = `S/ ${ingresosHoy.toFixed(2)}`;
        document.getElementById('kpi-listos').innerText = equiposListos;
        document.getElementById('kpi-flujo').innerHTML = `${entregadosHoy} <span class="text-lg text-gray-500 font-normal">/ ${recibidosHoy}</span>`;
        document.getElementById('kpi-ticket').innerHTML = `S/ ${ticketPromedio.toFixed(2)}`;

    } catch (err) {
        console.error("Error al cargar los KPIs:", err);
    }
}
async function cargarGraficaReal() {
    try {
        // 1. Preparar los últimos 7 días
        const fechas = [];
        const labels = [];
        const datosIngresos = [0, 0, 0, 0, 0, 0, 0];

        for (let i = 6; i >= 0; i--) {
            let d = new Date();
            d.setDate(d.getDate() - i);
            
            // Formato YYYY-MM-DD para comparar con Supabase
            let yyyy = d.getFullYear();
            let mm = String(d.getMonth() + 1).padStart(2, '0');
            let dd = String(d.getDate()).padStart(2, '0');
            fechas.push(`${yyyy}-${mm}-${dd}`);
            
            // Nombres para mostrar en la gráfica (Ej: "Lun", "Mar", "Hoy")
            if (i === 0) {
                labels.push('Hoy');
            } else {
                let nombreDia = d.toLocaleDateString('es-ES', { weekday: 'short' });
                labels.push(nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1));
            }
        }

        // 2. Traer datos de la base de datos (solo de los últimos 7 días)
        const fechaMasAntigua = fechas[0];
        const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
            body: JSON.stringify({ action: 'select', table: 'ordenes', select: 'costo, estado, created_at' }) // Filtraremos en frontend para simplificar
        });
        let { data: ordenesData, error } = await res.json();
        const ordenes = ordenesData ? ordenesData.filter(o => o.created_at >= fechaMasAntigua) : []; // .gte significa "mayor o igual que"

        if (error) throw error;

        // 3. Agrupar el dinero por día
        if (ordenes && ordenes.length > 0) {
            ordenes.forEach(orden => {
                const estadoLogico = orden.estado ? orden.estado.toLowerCase().trim() : '';
                
                // Solo sumamos ingresos de equipos cobrados/entregados
                if (estadoLogico === 'entregado' || estadoLogico === 'pagado') {
                    const fechaOrden = orden.created_at.split('T')[0]; // Sacamos la fecha pura
                    const index = fechas.indexOf(fechaOrden); // Buscamos a qué día pertenece
                    
                    if (index !== -1) {
                        datosIngresos[index] += parseFloat(orden.costo || 0);
                    }
                }
            });
        }

        // 4. Dibujar la Gráfica con Chart.js
        const ctx = document.getElementById('financeChart').getContext('2d');
        let gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(124, 58, 237, 0.5)'); 
        gradient.addColorStop(1, 'rgba(124, 58, 237, 0)');   

        // Buscamos si ya hay una gráfica dibujada en ese canvas y la destruimos
        const chartStatus = Chart.getChart("financeChart");
        if (chartStatus != undefined) {
            chartStatus.destroy();
        }

        // Ahora sí, creamos la gráfica limpia
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels, // Nombres de los días dinámicos
                datasets: [{
                    label: 'Ingresos (S/)',
                    data: datosIngresos, // El dinero real sumado
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
                        callbacks: {
                            label: function(context) { return 'S/ ' + context.parsed.y.toFixed(2); }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#6b7280' } },
                    x: { grid: { display: false }, ticks: { color: '#6b7280' } }
                }
            }
        });

    } catch (err) {
        console.error("Error al cargar la gráfica real:", err);
    }
}
async function cargarLicenciaSaaS() {
    try {
        // 1. Buscamos la licencia que está actualmente en uso (usada = TRUE)
        const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('web_token') },
            body: JSON.stringify({ action: 'select', table: 'licencias', match: { usada: true }, order: { column: 'created_at', ascending: false }, limit: 1 })
        });
        const { data: licenciasData, error: errLicencia } = await res.json();
        const licencia = licenciasData && licenciasData.length > 0 ? licenciasData[0] : null;

        if (errLicencia) throw errLicencia;

        if (licencia) {
            // A. Cálculos matemáticos de fechas
            const fechaActivacion = new Date(licencia.created_at);
            const fechaVencimiento = new Date(licencia.created_at);
            // Le sumamos los meses de duración que dice la tabla
            fechaVencimiento.setMonth(fechaVencimiento.getMonth() + licencia.meses_duracion);
            
            const hoy = new Date();
            
            // Calculamos cuántos días faltan
            const diasRestantes = Math.ceil((fechaVencimiento - hoy) / (1000 * 60 * 60 * 24));
            const totalDias = Math.ceil((fechaVencimiento - fechaActivacion) / (1000 * 60 * 60 * 24));
            
            // Calculamos el porcentaje de la barra de progreso
            let progreso = 100 - ((diasRestantes / totalDias) * 100);
            if (progreso > 100) progreso = 100;
            if (progreso < 0) progreso = 0;

            // Formatear la fecha de corte bonita (ej: "16 de julio de 2026")
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            const fechaCorteTexto = fechaVencimiento.toLocaleDateString('es-ES', options);

            // B. Inyectar en el HTML
            document.getElementById('licencia-plan').innerHTML = `Plan Taller Pro <i class="fa-solid fa-crown text-yellow-500 ml-2"></i>`;
            document.getElementById('licencia-dias').innerText = `${diasRestantes > 0 ? diasRestantes : 0} Días`;
            document.getElementById('licencia-progreso').style.width = `${progreso}%`;
            document.getElementById('licencia-corte').innerText = `Próximo corte: ${fechaCorteTexto}`;
        } else {
            // Si no hay licencia activa
            document.getElementById('licencia-plan').innerHTML = `Sin Plan Activo <i class="fa-solid fa-circle-exclamation text-red-500 ml-2"></i>`;
            document.getElementById('licencia-dias').innerText = `0 Días`;
            document.getElementById('licencia-progreso').style.width = `0%`;
            document.getElementById('licencia-corte').innerText = `Licencia Vencida o No Encontrada`;
        }

        // 2. Consultar el historial de recibos
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
                    <td class="py-4 px-6">
                        <span class="bg-bhGreen/10 text-bhGreen text-xs font-bold px-3 py-1 rounded-full">${recibo.estado}</span>
                    </td>
                    <td class="py-4 px-6 text-right">
                        <button class="text-bhPurple hover:text-white transition"><i class="fa-solid fa-download"></i> PDF</button>
                    </td>
                </tr>
            `).join('');
        }

    } catch (err) {
        console.error("Error al cargar la sección SaaS:", err);
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

        if (equipos && equipos.length > 0) {
            tbody.innerHTML = equipos.map(equipo => {
                let colorEstado = 'bg-gray-500/10 text-gray-400'; 
                let estadoStr = equipo.estado ? equipo.estado.toLowerCase().trim() : '';
                
                if (estadoStr === 'listo') {
                    colorEstado = 'bg-bhGreen/10 text-bhGreen';
                } else if (estadoStr === 'entregado' || estadoStr === 'pagado') {
                    colorEstado = 'bg-bhPurple/10 text-bhPurple';
                } else if (estadoStr === 'en proceso' || estadoStr === 'laboratorio') {
                    colorEstado = 'bg-blue-500/10 text-blue-400';
                } else if (estadoStr === 'por asignar' || estadoStr === 'recibido') {
                    colorEstado = 'bg-orange-500/10 text-orange-400';
                }

                return `
                <tr class="hover:bg-white/5 transition">
                    <td class="py-4 px-6 font-mono text-bhPurple font-bold">
                        ID-${equipo.id || '000'}<br>
                        <span class="text-xs text-gray-500 font-normal">${equipo.imei || 'Sin IMEI'}</span>
                    </td>
                    <td class="py-4 px-6">${equipo.modelo || 'Modelo no especificado'}</td>
                    <td class="py-4 px-6">${equipo.falla || equipo.problema || 'Revisión general'}</td>
                    <td class="py-4 px-6 text-white font-bold">S/ ${parseFloat(equipo.costo || 0).toFixed(2)}</td>
                    <td class="py-4 px-6 text-right">
                        <span class="${colorEstado} font-bold px-3 py-1 rounded-full text-xs uppercase">${equipo.estado || 'Pendiente'}</span>
                    </td>
                </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-gray-500">No hay equipos registrados actualmente.</td></tr>';
        }
    } catch (err) {
        console.error("Error al cargar Portal B2B:", err);
    }
}
    
