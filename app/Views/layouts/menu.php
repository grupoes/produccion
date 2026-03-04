<!-- Dashboard Module -->
<div class="module-item">
    <button
        class="flex items-center justify-between w-full gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-primary/5 hover:text-primary transition-colors group"
        onclick="toggleSubmenu(this)">
        <div class="flex items-center gap-3">
            <span class="material-symbols-outlined shrink-0 group-hover:text-primary">dashboard</span>
            <span class="text-sm font-medium menu-label">Dashboard</span>
        </div>
        <span
            class="material-symbols-outlined text-sm transition-transform duration-200 expand-icon">expand_more</span>
    </button>
    <div class="submenu hidden space-y-1 ml-9 mt-1">
        <a href="index.html"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Vista
            General</a>
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Reportes
            de Eficiencia</a>
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Alertas
            de Sistema</a>
    </div>
</div>

<!-- Producción Module -->
<div class="module-item">
    <button
        class="flex items-center justify-between w-full gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-primary/5 hover:text-primary transition-colors group"
        onclick="toggleSubmenu(this)">
        <div class="flex items-center gap-3">
            <span class="material-symbols-outlined shrink-0 group-hover:text-primary">factory</span>
            <span class="text-sm font-medium menu-label">Producción</span>
        </div>
        <span
            class="material-symbols-outlined text-sm transition-transform duration-200 expand-icon">expand_more</span>
    </button>
    <div class="submenu hidden space-y-1 ml-9 mt-1">
        <a href="<?= base_url('potenciales-clientes') ?>"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Potenciales Clientes</a>
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Clientes</a>
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Horarios</a>
    </div>
</div>

<!-- Trabajadores Module -->
<div class="module-item">
    <button
        class="flex items-center justify-between w-full gap-3 px-4 py-3 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-primary/5 hover:text-primary transition-colors group"
        onclick="toggleSubmenu(this)">
        <div class="flex items-center gap-3">
            <span class="material-symbols-outlined shrink-0 group-hover:text-primary">group</span>
            <span class="text-sm font-medium menu-label">Mantenimiento</span>
        </div>
        <span
            class="material-symbols-outlined text-sm transition-transform duration-200 expand-icon">expand_more</span>
    </button>
    <div class="submenu hidden space-y-1 ml-9 mt-1">
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Tareas</a>
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Universidad</a>
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Carreras</a>
        <a href="#"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Feriados</a>
        <a href="origen-contacto"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Origen Contacto</a>
        <a href="nivel-academico"
            class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Nivel Académico</a>
    </div>
</div>

<!-- Configuración Module (Active here) -->
<div class="pt-4 mt-4 border-t border-primary/10">
    <div class="module-item">
        <button
            class="flex items-center justify-between w-full gap-3 px-4 py-3 rounded-lg text-primary bg-primary/10 font-medium group transition-colors"
            onclick="toggleSubmenu(this)">
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined shrink-0">settings</span>
                <span class="text-sm font-medium menu-label">Seguridad</span>
            </div>
            <span
                class="material-symbols-outlined text-sm transition-transform duration-200 rotate-180 expand-icon">expand_more</span>
        </button>
        <div class="submenu space-y-1 ml-9 mt-1">
            <a href="usuarios"
                class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Gestión
                de Usuarios</a>
            <a href="permisos"
                class="block px-3 py-1.5 text-xs font-bold text-primary transition-colors">Perfiles y
                Permisos</a>
            <a href="#"
                class="block px-3 py-1.5 text-xs text-slate-500 hover:text-primary transition-colors">Ajustes
                del Sistema</a>
        </div>
    </div>
</div>