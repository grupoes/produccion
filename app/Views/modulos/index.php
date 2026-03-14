<?= $this->extend('layouts/main') ?>

<?= $this->section('content') ?>
<div class="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark p-8">
    <div class="max-w-6xl mx-auto w-full flex flex-col gap-8">

        <!-- Header Section -->
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h2 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Módulos del Sistema</h2>
                <p class="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Gestione la estructura y navegación de los módulos</p>
            </div>
            <button onclick="abrirModalModulo()"
                class="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]">
                <span class="material-symbols-outlined text-[20px]">add_circle</span>
                <span>Nuevo Módulo</span>
            </button>
        </div>

        <!-- Table Card -->
        <div class="bg-white dark:bg-neutral-dark rounded-3xl border border-slate-200 dark:border-border-dark overflow-hidden shadow-sm transition-all">
            <div class="p-5 border-b border-slate-100 dark:border-border-dark bg-slate-50/30 dark:bg-slate-800/20 backdrop-blur-sm">
                <div class="relative max-w-md w-full">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                    <input id="searchModulo"
                        class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400 transition-all"
                        placeholder="Buscar módulo..." type="text" />
                </div>
            </div>

            <div class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50/50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-bold tracking-widest border-b border-slate-100 dark:border-border-dark">
                            <th class="px-6 py-4">Orden</th>
                            <th class="px-6 py-4">Módulo</th>
                            <th class="px-6 py-4">URL</th>
                            <th class="px-6 py-4">Icono</th>
                            <th class="px-6 py-4">Padre</th>
                            <th class="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="listaModulos" class="divide-y divide-slate-100 dark:divide-border-dark whitespace-nowrap">
                        <!-- Cargando... -->
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center text-slate-400">
                                <div class="flex flex-col items-center gap-2">
                                    <div class="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                    <span class="text-xs font-medium">Cargando módulos...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Pagination Section -->
            <div id="paginationContainer" class="px-6 py-4 border-t border-slate-100 dark:border-border-dark flex items-center justify-between bg-slate-50/10 dark:bg-slate-800/10">
                <span id="paginationInfo" class="text-xs font-semibold text-slate-500">Mostrando 0 módulos</span>
                <div id="paginationControls" class="flex items-center gap-1">
                    <!-- Los controles se cargarán dinámicamente -->
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Modal: Nuevo / Editar Módulo -->
<div id="modalModulo" class="fixed inset-0 z-[60] hidden overflow-y-auto overflow-x-hidden">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity opacity-0 cursor-pointer" id="modalBackdrop" onclick="closeModal('modalModulo')"></div>

    <!-- Content -->
    <div class="relative flex min-h-screen items-center justify-center p-4">
        <div class="relative w-full max-w-lg transform rounded-3xl bg-white dark:bg-neutral-dark shadow-2xl transition-all scale-95 opacity-0 duration-300" id="modalContent">

            <div class="flex items-center justify-between border-b border-slate-100 dark:border-border-dark px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined">widgets</span>
                    </div>
                    <div>
                        <h3 id="modalTitle" class="text-lg font-bold text-slate-900 dark:text-white leading-none">Nuevo Módulo</h3>
                        <p class="text-[13px] text-slate-500 mt-1">Configure los detalles del módulo</p>
                    </div>
                </div>
                <button type="button" onclick="closeModal('modalModulo')" class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <form id="formModulo" class="p-6 space-y-4">
                <input type="hidden" id="moduloId" name="moduloId" value="0">

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Nombre del Módulo -->
                    <div class="md:col-span-2">
                        <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Nombre del Módulo</label>
                        <input type="text" id="nombre" name="moduloNombre" required
                            placeholder="Ej: Dashboard, Ventas, Reportes..."
                            class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all">
                    </div>

                    <!-- Es Padre Radio -->
                    <div class="md:col-span-2">
                        <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">¿Es Módulo Padre?</label>
                        <div class="grid grid-cols-2 gap-3">
                            <label class="relative flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-slate-100 dark:border-slate-800 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 group">
                                <input type="radio" name="es_padre" value="1" class="sr-only" onchange="actualizarInterfazPadre(this.value)">
                                <span class="material-symbols-outlined text-slate-400 group-has-[:checked]:text-primary transition-colors">account_tree</span>
                                <div class="flex flex-col">
                                    <span class="text-[13px] font-bold text-slate-700 dark:text-slate-300 group-has-[:checked]:text-primary transition-colors leading-none font-bold">Sí, es Padre</span>
                                    <span class="text-[10px] text-slate-400 font-medium mt-0.5">Contendrá submódulos</span>
                                </div>
                            </label>
                            <label class="relative flex items-center justify-center gap-2 p-3 rounded-2xl border-2 border-slate-100 dark:border-slate-800 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 group">
                                <input type="radio" name="es_padre" value="0" checked class="sr-only" onchange="actualizarInterfazPadre(this.value)">
                                <span class="material-symbols-outlined text-slate-400 group-has-[:checked]:text-primary transition-colors">responsive_layout</span>
                                <div class="flex flex-col">
                                    <span class="text-[13px] font-bold text-slate-700 dark:text-slate-300 group-has-[:checked]:text-primary transition-colors leading-none font-bold">No, es Submódulo</span>
                                    <span class="text-[10px] text-slate-400 font-medium mt-0.5">Pertenece a otro módulo</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- URL -->
                    <div>
                        <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">URL / Ruta</label>
                        <input type="text" id="url" name="moduloUrl"
                            placeholder="Ej: dashboard, usuarios..."
                            class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all">
                    </div>

                    <!-- Icono -->
                    <div>
                        <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Icono (Material Symbol)</label>
                        <input type="text" id="icono" name="moduloIcono"
                            placeholder="Ej: dashboard, person..."
                            class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all">
                    </div>

                    <!-- ID Padre -->
                    <div id="container_id_padre" class="transition-all duration-300">
                        <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Módulo Padre</label>
                        <select id="id_padre" name="moduloIdPadre"
                            class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer">
                            <option value="0">Ninguno (Módulo Principal)</option>
                        </select>
                    </div>

                    <!-- Orden -->
                    <div>
                        <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Orden</label>
                        <input type="number" id="orden" name="orden" value="1" min="1"
                            class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all">
                    </div>
                </div>

                <div class="flex items-center justify-end gap-3 pt-4">
                    <button type="button" onclick="closeModal('modalModulo')"
                        class="h-11 px-6 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                        Cancelar
                    </button>
                    <button type="submit"
                        class="h-11 px-8 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20">
                        Guardar Módulo
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
<?= $this->endSection() ?>

<?= $this->section('js') ?>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="<?= base_url('js/modulos/index.js') ?>"></script>
<?= $this->endSection() ?>