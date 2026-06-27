const translations = {
    es: {
        // Nav
        "nav_features": "Características",
        "nav_why_us": "Por qué elegirnos",
        "nav_tracking": "Rastreo de Clientes",
        "nav_login": "Iniciar Sesión",
        "nav_buy": "Adquirir Licencia",
        
        // Hero
        "hero_badge": "Gestión Inteligente en Tiempo Real",
        "hero_title_1": "Lleva tu Taller al ",
        "hero_title_2": "Nivel Empresarial",
        "hero_desc": "Deja de perder dinero en desorden. Controla inventarios, recepciones, órdenes técnicas, facturación y estados de clientes con una plataforma premium diseñada por y para técnicos profesionales.",
        "hero_btn_demo": "Solicitar Demo Gratis",
        "hero_btn_features": "Ver Características",
        
        // Stats
        "stat_shops": "Talleres Activos",
        "stat_income": "Ingresos Gestionados",
        "stat_clients": "Clientes Satisfechos",
        "stat_support": "Horas de Soporte",

        // Video
        "vid_badge": "Descubre el Sistema",
        "vid_title_1": "Mira BlackHouse OS en ",
        "vid_title_2": "Acción",
        "vid_desc": "Conoce por dentro la interfaz rápida, intuitiva y oscura que está revolucionando la gestión de los talleres técnicos.",
        "vid_btn": "Solicitar Demo Gratis",
        "vid_sub": "Un asesor te guiará paso a paso en tu propio entorno de pruebas.",

        // Features
        "feat_title": "Todo lo que necesitas para dominar el mercado",
        "feat_desc": "Haz clic sobre cualquiera de los módulos para abrir los detalles técnicos y ver su funcionamiento.",
        
        "feat_rec_title": "Recepción Dinámica",
        "feat_rec_desc": "Registra equipos en segundos. Captura fallas visuales, datos del cliente y genera hojas de ingreso automáticas.",
        "feat_lab_title": "Laboratorio Técnico",
        "feat_lab_desc": "Asigna prioridades, técnicos responsables y lleva una trazabilidad quirúrgica de cada reparación en curso.",
        "feat_inv_title": "Inventario Blindado",
        "feat_inv_desc": "Alerta de stock bajo para pantallas, baterías y flexores. Vincula repuestos directamente al costo de la orden.",
        "feat_trk_title": "Rastreo por Código QR",
        "feat_trk_desc": "Tus clientes escanean el ticket y ven el estado en tiempo real. Reduce en un 70% las llamadas molestas.",
        "feat_rep_title": "Analista Financiero IA",
        "feat_rep_desc": "Análisis predictivo de tus ganancias y métricas de rendimiento por empleado para tomar decisiones estratégicas.",
        "feat_fac_title": "Caja y Facturación",
        "feat_fac_desc": "Control total de ingresos, adelantos, cuentas por cobrar, emisión de comprobantes y cierres de caja limpios.",
        
        // Hook
        "hook_title": "¿Cuánto dinero estás perdiendo hoy por falta de control?",
        "hook_desc": "El desorden aleja a los clientes premium. Con <span class=\"text-white font-bold\">BlackHouse OS</span>, ofreces una experiencia transparente, automatizas las tareas tediosas y recuperas el control total de tu negocio desde cualquier lugar.",
        "hook_btn": "Quiero Digitalizar mi Taller Ahora",

        // Modal Login
        "login_title": "Acceso al Panel",
        "login_subtitle": "Ingresa tus credenciales de administrador",
        "login_lbl_user": "Correo Electrónico / Usuario",
        "login_lbl_pass": "Contraseña",
        "login_forgot": "¿Olvidaste tu contraseña?",
        "login_btn_enter": "Entrar al Sistema"
    },
    en: {
        // Nav
        "nav_features": "Features",
        "nav_why_us": "Why Choose Us",
        "nav_tracking": "Client Tracking",
        "nav_login": "Login",
        "nav_buy": "Get License",
        
        // Hero
        "hero_badge": "Real-Time Smart Management",
        "hero_title_1": "Take Your Shop to the ",
        "hero_title_2": "Enterprise Level",
        "hero_desc": "Stop losing money on disorganization. Control inventory, intake, repair orders, billing, and client status with a premium platform designed by and for professional technicians.",
        "hero_btn_demo": "Request Free Demo",
        "hero_btn_features": "View Features",

        // Stats
        "stat_shops": "Active Shops",
        "stat_income": "Managed Income",
        "stat_clients": "Satisfied Clients",
        "stat_support": "Support Hours",
        
        // Video
        "vid_badge": "Discover the System",
        "vid_title_1": "See BlackHouse OS in ",
        "vid_title_2": "Action",
        "vid_desc": "Get to know the fast, intuitive and dark interface that is revolutionizing the management of technical shops.",
        "vid_btn": "Request Free Demo",
        "vid_sub": "An advisor will guide you step by step in your own test environment.",

        // Features
        "feat_title": "Everything you need to dominate the market",
        "feat_desc": "Click on any module to open technical details and see how it works.",
        
        "feat_rec_title": "Dynamic Intake",
        "feat_rec_desc": "Register devices in seconds. Capture visual flaws, client data, and generate automatic intake sheets.",
        "feat_lab_title": "Technical Laboratory",
        "feat_lab_desc": "Assign priorities, responsible technicians, and keep a surgical traceability of every repair in progress.",
        "feat_inv_title": "Bulletproof Inventory",
        "feat_inv_desc": "Low stock alerts for screens, batteries, and flex cables. Link parts directly to the order cost.",
        "feat_trk_title": "QR Code Tracking",
        "feat_trk_desc": "Your clients scan the ticket and see the status in real time. Reduce annoying 'Is it ready?' calls by 70%.",
        "feat_rep_title": "AI Financial Analyst",
        "feat_rep_desc": "Predictive analysis of your profits and employee performance metrics to make strategic decisions.",
        "feat_fac_title": "Cash & Billing",
        "feat_fac_desc": "Total control of income, advances, accounts receivable, receipt issuance, and clean cash register closings.",

        // Hook
        "hook_title": "How much money are you losing today due to lack of control?",
        "hook_desc": "Disorganization drives away premium clients. With <span class=\"text-white font-bold\">BlackHouse OS</span>, you offer a transparent experience, automate tedious tasks, and regain full control of your business from anywhere.",
        "hook_btn": "I Want to Digitize My Shop Now",
        
        // Modal Login
        "login_title": "Panel Access",
        "login_subtitle": "Enter your administrator credentials",
        "login_lbl_user": "Email / Username",
        "login_lbl_pass": "Password",
        "login_forgot": "Forgot your password?",
        "login_btn_enter": "Enter System"
    }
};

let currentLang = localStorage.getItem('bh_lang') || 'es';

function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    localStorage.setItem('bh_lang', lang);
    applyTranslations();
}

function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang] && translations[currentLang][key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translations[currentLang][key];
            } else {
                el.innerHTML = translations[currentLang][key];
            }
        }
    });

    const langSelector = document.getElementById('lang-selector');
    if (langSelector) {
        langSelector.value = currentLang;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
});
