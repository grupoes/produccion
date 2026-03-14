<?= $this->extend('layouts/main') ?>

<?= $this->section('content') ?>
<div class="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark p-8">
    <div class="max-w-6xl mx-auto w-full flex flex-col gap-8">

        <!-- Header Section -->
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h2 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Configuración de Acciones</h2>
                <p class="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Asigne y gestione las acciones disponibles para cada módulo del sistema</p>
            </div>
            <div class="flex items-center gap-3">
                <a href="<?= base_url('acciones') ?>" 
                    class="h-11 px-6 flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                    <span class="material-symbols-outlined text-[20px]">list</span>
                    Gestionar Catálogo de Acciones
                </a>
            </div>
        </div>

        <!-- Modules Grid/Table -->
        <div class="bg-white dark:bg-neutral-dark rounded-3xl border border-slate-200 dark:border-border-dark overflow-hidden shadow-sm transition-all">
            <div class="p-5 border-b border-slate-100 dark:border-border-dark bg-slate-50/30 dark:bg-slate-800/20 backdrop-blur-sm">
                <div class="relative max-w-md w-full">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                    <input id="searchConfig"
                        class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400 transition-all"
                        placeholder="Filtrar por módulo..." type="text" />
                </div>
            </div>

            <div class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50/50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-bold tracking-widest border-b border-slate-100 dark:border-border-dark">
                            <th class="px-6 py-4">Módulo</th>
                            <th class="px-6 py-4">Ruta / URL</th>
                            <th class="px-6 py-4">Acciones Habilitadas</th>
                            <th class="px-6 py-4 text-right">Configuración</th>
                        </tr>
                    </thead>
                    <tbody id="listaConfiguracion" class="divide-y divide-slate-100 dark:divide-border-dark">
                        <!-- Cargando... -->
                        <tr>
                            <td colspan="4" class="px-6 py-12 text-center text-slate-400">
                                <div class="flex flex-col items-center gap-2">
                                    <div class="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                    <span class="text-xs font-medium">Cargando módulos...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Modal: Configurar Acciones del Módulo -->
<div id="modalConfigAcciones" class="fixed inset-0 z-[60] hidden overflow-y-auto overflow-x-hidden">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity opacity-0 cursor-pointer" id="modalBackdropCfg" onclick="closeModal('modalConfigAcciones')"></div>

    <!-- Content -->
    <div class="relative flex min-h-screen items-center justify-center p-4">
        <div class="relative w-full max-w-2xl transform rounded-3xl bg-white dark:bg-neutral-dark shadow-2xl transition-all scale-95 opacity-0 duration-300" id="modalContentCfg">

            <div class="flex items-center justify-between border-b border-slate-100 dark:border-border-dark px-6 py-5">
                <div class="flex items-center gap-4">
                    <div class="size-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <span id="moduloIconoTitle" class="material-symbols-outlined text-[28px]">settings_suggest</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <h3 id="moduloNombreTitle" class="text-xl font-black text-slate-900 dark:text-white leading-none">Configurar Acciones</h3>
                            <span id="moduloIdBadge" class="hidden px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-bold font-mono border border-slate-200 dark:border-slate-700"></span>
                        </div>
                        <p class="text-[13px] text-slate-500">Marque las acciones que estarán permitidas en este módulo</p>
                    </div>
                </div>
                <button type="button" onclick="closeModal('modalConfigAcciones')" class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <span class="material-symbols-outlined text-[24px]">close</span>
                </button>
            </div>

            <form id="formConfigAcciones" class="p-6">
                <!-- Input Oculto de ID -->
                <input type="hidden" id="moduloIdModal" value="">
                <!-- Grid de Acciones -->
                <div id="gridAcciones" class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    <!-- Dinámico: Checkboxes de acciones -->
                    <div class="col-span-full py-10 text-center text-slate-400 flex flex-col items-center gap-2">
                        <span class="material-symbols-outlined animate-spin">sync</span>
                        <span class="text-xs font-bold uppercase tracking-widest">Obteniendo catálogo...</span>
                    </div>
                </div>

                <div class="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-border-dark">
                    <button type="button" onclick="closeModal('modalConfigAcciones')"
                        class="h-12 px-6 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all">
                        Cerrar
                    </button>
                    <button type="submit"
                        class="h-12 px-8 bg-primary hover:bg-primary/90 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center gap-2">
                        <span class="material-symbols-outlined text-[20px]">save</span>
                        Guardar Cambios
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
<?= $this->endSection() ?>

<?= $this->section('js') ?>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="<?= base_url('js/acciones/configuracion.js') ?>"></script>
<?= $this->endSection() ?>
