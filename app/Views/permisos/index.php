<?= $this->extend('layouts/main') ?>
<?= $this->section('content') ?>
<div class="flex flex-1 overflow-hidden relative">
    <!-- Inner Sidebar (Roles/Users) -->
    <aside id="innerSidebar"
        class="w-80 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-background-dark overflow-y-auto">
        <!-- Tabs -->
        <div class="px-4 pt-4">
            <div class="flex p-1 bg-slate-200 dark:bg-slate-800 rounded-xl">
                <button id="tabPerfiles"
                    class="flex-1 py-2 text-xs font-bold rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm transition-all">Perfiles</button>
                <button id="tabUsuarios"
                    class="flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all">Usuarios</button>
            </div>
        </div>
        <!-- Search within Roles -->
        <div class="p-4">
            <div class="relative">
                <span
                    class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">filter_alt</span>
                <input
                    class="w-full bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary"
                    placeholder="Buscar perfiles..." type="text" />
            </div>
        </div>
        <!-- Lists Container -->
        <div class="flex-1 overflow-y-auto px-2 space-y-1">
            <!-- Perfiles List -->
            <div id="listaPerfiles" class="space-y-1">
                <!-- Role Item: Active -->
                <div
                    class="role-item p-3 rounded-xl bg-primary/10 border border-primary/20 cursor-pointer transition-all">
                    <div class="flex items-center justify-between mb-1">
                        <span class="role-name text-sm font-bold text-primary">Admin</span>
                        <span
                            class="status-icon material-symbols-outlined text-primary text-sm">check_circle</span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Acceso total al
                        sistema, gestión de usuarios y configuraciones críticas.</p>
                </div>
                <!-- Role Item -->
                <div
                    class="role-item p-3 rounded-xl border border-transparent hover:bg-slate-200 dark:hover:bg-slate-800/50 cursor-pointer transition-all group">
                    <div class="flex items-center justify-between mb-1">
                        <span
                            class="role-name text-sm font-bold text-slate-900 dark:text-white">Supervisor</span>
                        <span
                            class="status-icon material-symbols-outlined text-slate-400 opacity-0 group-hover:opacity-100 text-sm">chevron_right</span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Gestión de turnos,
                        aprobación de reportes y control de inventario.</p>
                </div>
                <!-- Role Item -->
                <div
                    class="role-item p-3 rounded-xl border border-transparent hover:bg-slate-200 dark:hover:bg-slate-800/50 cursor-pointer transition-all group">
                    <div class="flex items-center justify-between mb-1">
                        <span
                            class="role-name text-sm font-bold text-slate-900 dark:text-white">Operator</span>
                        <span
                            class="status-icon material-symbols-outlined text-slate-400 opacity-0 group-hover:opacity-100 text-sm">chevron_right</span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Registro de
                        producción
                        diaria y visualización de manuales técnicos.</p>
                </div>
            </div>

            <!-- Usuarios List (Hidden by default) -->
            <div id="listaUsuarios" class="hidden space-y-1">
                <!-- User Item -->
                <div
                    class="user-item p-3 rounded-xl border border-transparent hover:bg-slate-200 dark:hover:bg-slate-800/50 cursor-pointer transition-all group flex items-center gap-3">
                    <div class="size-8 rounded-full bg-slate-300 dark:bg-slate-700 flex-shrink-0"></div>
                    <div class="flex-1 min-w-0">
                        <p class="user-name text-sm font-bold truncate text-slate-900 dark:text-white">Juan
                            Pérez</p>
                        <p class="text-xs text-slate-500 truncate">juan.perez@factory.com</p>
                    </div>
                    <span
                        class="status-icon material-symbols-outlined text-slate-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                </div>
                <!-- User Item -->
                <div
                    class="user-item p-3 rounded-xl border border-transparent hover:bg-slate-200 dark:hover:bg-slate-800/50 cursor-pointer transition-all group flex items-center gap-3">
                    <div class="size-8 rounded-full bg-slate-300 dark:bg-slate-700 flex-shrink-0"></div>
                    <div class="flex-1 min-w-0">
                        <p class="user-name text-sm font-bold truncate text-slate-900 dark:text-white">Maria
                            García</p>
                        <p class="text-xs text-slate-500 truncate">m.garcia@factory.com</p>
                    </div>
                    <span
                        class="status-icon material-symbols-outlined text-slate-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">chevron_right</span>
                </div>
            </div>
    </aside>
    <!-- Main Permissions Area -->
    <section id="mainPermissions"
        class="flex-1 overflow-y-auto p-8 bg-white dark:bg-background-dark mobile-hidden">
        <div class="max-w-4xl mx-auto">
            <!-- Mobile Back Button -->
            <button onclick="hidePermissionsMobile()"
                class="lg:hidden flex items-center gap-2 text-primary font-bold mb-6 hover:bg-primary/5 p-2 rounded-lg transition-colors">
                <span class="material-symbols-outlined">arrow_back</span>
                <span>Volver a la lista</span>
            </button>

            <div class="mb-8">
                <h3 class="text-2xl font-bold mb-2">Configuración de Permisos</h3>
                <p class="text-slate-500 dark:text-slate-400">Define qué acciones puede realizar el perfil
                    <span class="text-primary font-semibold">Admin</span> en cada módulo.
                </p>
            </div>
            <!-- Permissions Table Header -->
            <div class="grid grid-cols-12 gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 px-4">
                <div class="col-span-12 text-xs font-bold uppercase tracking-wider text-slate-400">Módulo /
                    Funcionalidad y Acciones Específicas</div>
            </div>
            <!-- Permissions Modules -->
            <div class="space-y-4 py-4">
                <!-- Module: Dashboard -->
                <div
                    class="module-container bg-slate-50 dark:bg-slate-900/40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all">
                    <div
                        class="module-header flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-primary">bar_chart</span>
                            <span class="font-bold text-sm">Dashboard</span>
                        </div>
                        <span
                            class="module-chevron material-symbols-outlined text-slate-400 transition-transform duration-300">expand_more</span>
                    </div>
                    <div
                        class="module-content px-12 pb-6 space-y-6 overflow-hidden transition-all duration-300">
                        <!-- Sub-item: Reportes de Eficiencia -->
                        <div class="space-y-3">
                            <div class="text-xs font-bold text-slate-700 dark:text-slate-300">
                                <div class="flex items-center gap-2">
                                    <input
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800 size-3.5"
                                        type="checkbox" />
                                    <span
                                        class="text-xs font-bold text-slate-700 dark:text-slate-300">Reportes
                                        de Eficiencia</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Listar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Crear</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Editar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Eliminar</span>
                                </label>
                            </div>
                        </div>
                        <!-- Sub-item: Alertas de Sistema -->
                        <div class="space-y-3">
                            <div class="text-xs font-bold text-slate-700 dark:text-slate-300">
                                <div class="flex items-center gap-2">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800 size-3.5"
                                        type="checkbox" />
                                    <span
                                        class="text-xs font-bold text-slate-700 dark:text-slate-300">Alertas
                                        de Sistema</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Listar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Crear</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Editar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Eliminar</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Module: Producción -->
                <div
                    class="module-container bg-slate-50 dark:bg-slate-900/40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all">
                    <div
                        class="module-header flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-primary">factory</span>
                            <span class="font-bold text-sm">Producción</span>
                        </div>
                        <span
                            class="module-chevron material-symbols-outlined text-slate-400 transition-transform duration-300">expand_more</span>
                    </div>
                    <div
                        class="module-content px-12 pb-6 space-y-6 overflow-hidden transition-all duration-300">
                        <div class="space-y-3">
                            <div class="text-xs font-bold text-slate-700 dark:text-slate-300">
                                <div class="flex items-center gap-2">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800 size-3.5"
                                        type="checkbox" />
                                    <span
                                        class="text-xs font-bold text-slate-700 dark:text-slate-300">Órdenes
                                        de Trabajo</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Listar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Crear</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Editar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Eliminar</span>
                                </label>
                            </div>
                        </div>
                        <div class="space-y-3">
                            <div class="text-xs font-bold text-slate-700 dark:text-slate-300">
                                <div class="flex items-center gap-2">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800 size-3.5"
                                        type="checkbox" />
                                    <span
                                        class="text-xs font-bold text-slate-700 dark:text-slate-300">Control
                                        de Calidad</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Listar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Crear</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Editar</span>
                                </label>
                                <label class="flex items-center gap-2 cursor-pointer group">
                                    <input checked=""
                                        class="rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800"
                                        type="checkbox" />
                                    <span
                                        class="text-[11px] text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300">Eliminar</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div
                    class="module-container bg-slate-50 dark:bg-slate-900/40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all">
                    <div
                        class="module-header flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-primary">group</span>
                            <span class="font-bold text-sm">Trabajadores</span>
                        </div>
                        <span
                            class="module-chevron material-symbols-outlined text-slate-400 transition-transform duration-300 rotate-[-90deg]">expand_more</span>
                    </div>
                    <div
                        class="module-content hidden px-12 pb-6 space-y-6 overflow-hidden transition-all duration-300">
                        <p class="text-xs text-slate-500 italic">No hay configuraciones específicas
                            disponibles para este módulo.</p>
                    </div>
                </div>
                <div
                    class="module-container bg-slate-50 dark:bg-slate-900/40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all">
                    <div
                        class="module-header flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <div class="flex items-center gap-3">
                            <span class="material-symbols-outlined text-primary">inventory_2</span>
                            <span class="font-bold text-sm">Inventario</span>
                        </div>
                        <span
                            class="module-chevron material-symbols-outlined text-slate-400 transition-transform duration-300 rotate-[-90deg]">expand_more</span>
                    </div>
                    <div
                        class="module-content hidden px-12 pb-6 space-y-6 overflow-hidden transition-all duration-300">
                        <p class="text-xs text-slate-500 italic">No hay configuraciones específicas
                            disponibles para este módulo.</p>
                    </div>
                </div>
            </div>
            <!-- Footer Actions -->
            <div
                class="mt-8 flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span class="material-symbols-outlined text-sm">info</span>
                    <p class="text-xs">Los cambios aplicados afectarán a todos los usuarios con este perfil
                        inmediatamente.</p>
                </div>
                <div class="flex gap-3">
                    <button
                        class="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Descartar</button>
                    <button
                        class="bg-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-primary/20">Guardar
                        Cambios</button>
                </div>
            </div>
    </section>
</div>
<?= $this->endSection() ?>

<?= $this->section('js') ?>
<script src="<?= base_url('js/permisos/permisos.js') ?>"></script>
<?= $this->endSection() ?>