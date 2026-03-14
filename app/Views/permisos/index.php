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
                <div class="p-4 text-center text-slate-400">
                    <span class="material-symbols-outlined animate-spin">progress_activity</span>
                    <p class="text-xs mt-2">Cargando perfiles...</p>
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
                    <span id="perfilActivoLabel" class="text-primary font-semibold uppercase tracking-wider">...</span> en cada módulo.
                </p>
            </div>
            <!-- Permissions Table Header -->
            <div class="grid grid-cols-12 gap-4 pb-4 border-b border-slate-200 dark:border-slate-800 px-4">
                <div class="col-span-12 text-xs font-bold uppercase tracking-wider text-slate-400">Módulo /
                    Funcionalidad y Acciones Específicas</div>
            </div>
            <form id="formPermisos">
                <input type="hidden" id="perfilIdHidden" name="id_perfil" value="">
                
                <!-- Permissions Modules Container (Rendered via JS) -->
                <div id="modulosContainer" class="space-y-4 py-4">
                    <div class="p-8 text-center text-slate-400">
                        <span class="material-symbols-outlined animate-spin text-3xl">sync</span>
                        <p class="mt-2 text-sm font-bold tracking-widest uppercase">Seleccione un perfil</p>
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
                        <button type="button"
                            class="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Descartar</button>
                        <button type="submit"
                            class="bg-primary text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-primary/20">Guardar
                            Cambios</button>
                    </div>
                </div>
            </form>
    </section>
</div>
<?= $this->endSection() ?>

<?= $this->section('js') ?>
<script src="<?= base_url('js/permisos/permisos.js') ?>"></script>
<?= $this->endSection() ?>