<?= $this->extend('layouts/main') ?>
<?= $this->section('content') ?>
<style>
    body {
        font-family: 'Inter', sans-serif;
    }

    .material-symbols-outlined {
        font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
    }

    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }

    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }

    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #1e293b;
        border-radius: 10px;
    }

    /* Sidebar Toggle & Responsive Styles */
    aside {
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease;
    }

    .sidebar-collapsed {
        width: 80px !important;
    }

    .sidebar-collapsed .logo-text,
    .sidebar-collapsed .menu-label,
    .sidebar-collapsed .expand-icon,
    .sidebar-collapsed .submenu,
    .sidebar-collapsed .user-info {
        display: none !important;
    }

    .sidebar-collapsed .module-item button {
        justify-content: center;
        padding-left: 0;
        padding-right: 0;
    }

    .sidebar-collapsed .module-item button div {
        margin-right: 0 !important;
        justify-content: center;
    }

    .sidebar-collapsed .module-item button span.material-symbols-outlined {
        margin: 0;
    }

    /* Mobile Overlay */
    @media (max-width: 1024px) {
        #mainSidebar {
            position: fixed;
            height: 100vh;
            z-index: 50;
            transform: translateX(-100%);
            width: 256px !important;
            /* Always full width on mobile */
        }

        #mainSidebar.mobile-open {
            transform: translateX(0);
        }

        #sidebarBackdrop.active {
            display: block;
        }

        .header-title-centered {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
        }
    }

    /* Responsive Kanban Board Styles */
    @media (max-width: 1024px) {
        #workflowSection {
            padding: 1rem !important;
        }

        .kanban-container {
            display: flex !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            padding-bottom: 2rem !important;
            gap: 1.5rem !important;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            width: 100% !important;
            max-width: 100% !important;
        }

        .kanban-column {
            min-width: 300px !important;
            width: 300px !important;
            flex-shrink: 0 !important;
            scroll-snap-align: start;
            height: auto !important;
        }

        .swipe-indicator {
            display: flex !important;
            justify-content: center;
            gap: 0.5rem;
            margin-top: 1rem;
            color: #94a3b8;
        }

        /* Make scrollbar visible on mobile for this container */
        .kanban-container::-webkit-scrollbar {
            height: 6px;
            display: block !important;
        }

        .kanban-container::-webkit-scrollbar-thumb {
            background: #135bec40;
            border-radius: 10px;
        }
    }

    @media (min-width: 1025px) {
        .kanban-container {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 1.5rem !important;
        }

        .swipe-indicator {
            display: none;
        }
    }

    /* Drag and Drop Styles */
    .kanban-card.dragging {
        opacity: 0.5;
        cursor: grabbing;
        transform: scale(0.95);
    }

    .kanban-column-content.drag-over {
        background-color: rgba(19, 91, 236, 0.05);
        border-radius: 0.75rem;
        outline: 2px dashed #135bec40;
        outline-offset: -4px;
    }

    /* FullCalendar Custom Styles */
    #calendarView {
        background: white;
        padding: 1.5rem;
        border-radius: 1.5rem;
        border: 1px solid #e2e8f0;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
        flex: 1;
    }

    #calendar {
        max-width: 100%;
    }

    .fc-header-toolbar {
        margin-bottom: 1.5rem !important;
    }

    .fc-button-primary {
        background-color: #135bec !important;
        border-color: #135bec !important;
    }

    .fc-button-primary:hover {
        background-color: #0e46b4 !important;
        border-color: #0e46b4 !important;
    }

    .fc-event {
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 0.75rem;
    }

    .dark #calendarView {
        background: #1e293b;
        border-color: #334155;
    }

    .dark .fc-theme-standard td,
    .dark .fc-theme-standard th {
        border-color: #334155;
    }

    .dark .fc-col-header-cell-cushion,
    .dark .fc-daygrid-day-number {
        color: #f1f5f9;
    }

    /* Fix Calendar Header Text Visibility */
    .fc-toolbar-title {
        color: #1e293b !important;
        font-weight: 700 !important;
    }

    .fc-col-header-cell {
        background-color: #1e293b !important;
        /* Dark blue/slate */
    }

    .fc-col-header-cell-cushion {
        color: #ffffff !important;
        text-transform: capitalize;
        font-weight: 600;
        padding: 8px 4px !important;
        display: block !important;
    }

    .dark .fc-col-header-cell {
        background-color: #0f172a !important;
        /* Even darker for dark mode */
    }

    .dark .fc-toolbar-title {
        color: #f1f5f9 !important;
    }

    .dark .fc-col-header-cell-cushion {
        color: #ffffff !important;
    }

    .fc-timegrid-slot-label-cushion {
        color: #475569 !important;
    }

    .dark .fc-timegrid-slot-label-cushion {
        color: #94a3b8 !important;
    }

    .fc .fc-button-primary:disabled {
        opacity: 0.6;
    }

    /* Zoomable Images in Detail */
    #detContenido img {
        cursor: zoom-in;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 0.75rem;
        max-width: 100%;
        margin: 1rem 0;
        display: block;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }

    #detContenido img:hover {
        transform: scale(1.01);
        filter: brightness(1.05);
        box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    }
</style>

<div class="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 space-y-8">
    <!-- Header Summary -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
            <p class="text-primary font-black text-xs uppercase tracking-[0.2em] mb-2 px-1">Panel de Control</p>
            <h1 class="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <span class="material-symbols-outlined text-primary text-3xl">dashboard</span>
                Mis Actividades de Hoy
            </h1>
        </div>
        <div class="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <span class="material-symbols-outlined">calendar_today</span>
            </div>
            <div class="pr-4">
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha Actual</p>
                <p class="text-xs font-black text-slate-700 dark:text-slate-200"><?= date('d M, Y') ?></p>
            </div>
        </div>
    </div>

    <?php
    $session = session();
    $rol_id = $session->get('rol_id');
    ?>
    <script>
        const USER_ROL_ID = <?= json_encode($rol_id) ?>;
    </script>
    <!-- Workflow Section -->
    <div id="workflowSection" class="flex flex-col h-full min-h-[600px] pb-10">
        <div class="mb-6">

            <div class="flex flex-wrap items-center gap-4">
                <!-- View Toggle -->
                <div class="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button id="showKanban" class="px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all bg-white dark:bg-slate-700 text-primary shadow-sm">
                        Tablero
                    </button>
                    <button id="showCalendar" class="px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                        Calendario
                    </button>
                </div>

                <div id="kanbanFilters" class="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <?php if ($rol_id == 1 || $rol_id == 2): ?>
                        <!-- Select Auxiliar -->
                        <div class="relative flex items-center group">
                            <span class="material-symbols-outlined absolute left-2.5 text-slate-400 text-[18px] group-focus-within:text-primary transition-colors">person</span>
                            <select id="filtroAuxiliar" class="bg-white dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm font-medium outline-none text-slate-700 dark:text-slate-200 focus:border-primary transition-colors cursor-pointer min-w-[180px]">
                                <option value="">Todos los Auxiliares</option>
                            </select>
                        </div>
                    <?php endif; ?>

                    <div class="relative flex items-center group">
                        <span class="material-symbols-outlined absolute left-2.5 text-slate-400 text-[18px] group-focus-within:text-primary transition-colors">event</span>
                        <input type="date" id="filtroFechaInicio" class="bg-white dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm font-medium outline-none text-slate-700 dark:text-slate-200 focus:border-primary transition-colors cursor-pointer" />
                    </div>
                    <span class="text-slate-400 dark:text-slate-500 font-medium">-</span>
                    <div class="relative flex items-center group">
                        <span class="material-symbols-outlined absolute left-2.5 text-slate-400 text-[18px] group-focus-within:text-primary transition-colors">event</span>
                        <input type="date" id="filtroFechaFin" class="bg-white dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm font-medium outline-none text-slate-700 dark:text-slate-200 focus:border-primary transition-colors cursor-pointer" />
                    </div>

                    <button id="btnFiltrarDashboard" class="bg-primary hover:bg-primary/90 text-white p-1.5 px-3 flex items-center gap-1 overflow-hidden rounded-lg transition-colors ml-1" title="Filtrar Resultados">
                        <span class="material-symbols-outlined text-[18px]">filter_list</span>
                        <span class="text-xs font-bold uppercase tracking-wider">Filtrar</span>
                    </button>
                </div>
            </div>
        </div>
        <!-- Kanban Board -->
        <div id="kanbanView" class="block">
            <div id="kanbanBoard" class="kanban-container flex-1 h-full min-h-[500px]">
                <!-- Column: Pendientes -->
                <div
                    class="kanban-column bg-slate-custom/30 dark:bg-slate-custom/20 rounded-xl p-4 flex flex-col gap-4 border border-primary/5">
                    <div class="flex items-center justify-between px-1">
                        <h3
                            class="font-bold flex items-center gap-2 text-slate-400 uppercase text-xs tracking-widest">
                            <span class="size-2 rounded-full bg-slate-400"></span> Pendientes
                        </h3>
                        <span
                            class="bg-slate-401/20 text-slate-400 text-xs px-2 py-0.5 rounded-full font-bold">3</span>
                    </div>
                    <div id="col-pendientes" class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                        <!-- Datos dinámicos -->
                    </div>
                </div>

                <!-- Column: En Proceso -->
                <div
                    class="kanban-column bg-primary/5 rounded-xl p-4 flex flex-col gap-4 border border-primary/10">
                    <div class="flex items-center justify-between px-1">
                        <h3
                            class="font-bold flex items-center gap-2 text-primary uppercase text-xs tracking-widest">
                            <span class="size-2 rounded-full bg-primary animate-pulse"></span> En Proceso
                        </h3>
                        <span
                            class="bg-primary/20 text-primary text-xs px-2 py-0.5 rounded-full font-bold">2</span>
                    </div>
                    <div id="col-en-proceso" class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                        <!-- Datos dinámicos -->
                    </div>
                </div>

                <!-- Column: Finalizado -->
                <div
                    class="kanban-column bg-emerald-500/5 rounded-xl p-4 flex flex-col gap-4 border border-emerald-500/10">
                    <div class="flex items-center justify-between px-1">
                        <h3
                            class="font-bold flex items-center gap-2 text-emerald-500 uppercase text-xs tracking-widest">
                            <span class="size-2 rounded-full bg-emerald-500"></span> Finalizado
                        </h3>
                        <span
                            class="bg-emerald-500/20 text-emerald-500 text-xs px-2 py-0.5 rounded-full font-bold">1</span>
                    </div>
                    <div id="col-finalizado" class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                        <!-- Datos dinámicos -->
                    </div>
                </div>

                <!-- Column: En Pausa -->
                <div
                    class="kanban-column bg-orange-500/5 rounded-xl p-4 flex flex-col gap-4 border border-orange-500/10">
                    <div class="flex items-center justify-between px-1">
                        <h3
                            class="font-bold flex items-center gap-2 text-orange-500 uppercase text-xs tracking-widest">
                            <span class="size-2 rounded-full bg-orange-500"></span> En Pausa
                        </h3>
                        <span
                            class="bg-orange-500/20 text-orange-500 text-xs px-2 py-0.5 rounded-full font-bold">2</span>
                    </div>
                    <div id="col-pausado" class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                        <!-- Datos dinámicos -->
                    </div>
                </div>
            </div>
            <!-- Mobile Swipe Indicator -->
            <div class="swipe-indicator">
                <span class="material-symbols-outlined animate-pulse">keyboard_double_arrow_right</span>
                <span class="text-xs font-medium uppercase tracking-widest">Desliza para ver más</span>
            </div>
        </div>

        <!-- Calendar View -->
        <div id="calendarView" class="hidden min-h-[600px]">
            <div id="calendar"></div>
        </div>
    </div>
</div>

<!-- Modal Detalle Actividad -->
<div id="modalDetalleActividad" class="fixed inset-0 z-[60] hidden overflow-y-auto overflow-x-hidden">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity opacity-0 cursor-pointer" id="modalBackdrop" onclick="closeModal('modalDetalleActividad')"></div>

    <!-- Modal Content -->
    <div class="relative flex min-h-screen items-center justify-center p-4">
        <div class="relative w-full max-w-2xl transform rounded-3xl bg-white dark:bg-neutral-dark shadow-2xl transition-all scale-95 opacity-0 duration-300" id="modalContent">

            <!-- Modal Header -->
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-border-dark px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined">assignment</span>
                    </div>
                    <div>
                        <h3 class="text-lg font-bold text-slate-900 dark:text-white leading-none">Detalles de Actividad</h3>
                        <p class="text-[13px] text-slate-500 mt-1">Información completa de la tarea</p>
                    </div>
                </div>
                <button type="button" onclick="closeModal('modalDetalleActividad')" class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <!-- Modal Body -->
            <div class="px-6 py-4 max-h-[70vh] overflow-y-auto custom-scrollbar">

                <div id="detalleLoader" class="flex justify-center py-8">
                    <span class="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                </div>

                <div id="detalleContenido" class="hidden space-y-6">
                    <!-- IDs Ocultos -->
                    <input type="hidden" id="detActividadId">
                    <input type="hidden" id="detProspectoId">

                    <!-- Header Detalle -->
                    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div class="flex-1">
                            <h4 id="detNombre" class="text-xl font-black text-slate-900 dark:text-white mb-2 leading-tight"></h4>
                            <div class="flex flex-wrap gap-2">
                                <span id="detEstado" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-slate-200 dark:border-slate-700"></span>
                                <span id="detPrioridad" class="px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-white/10 shadow-sm"></span>
                            </div>
                        </div>
                    </div>

                    <!-- Grid de Información -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                        <div class="space-y-1">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Responsable</p>
                            <p id="detResponsable" class="text-sm font-bold text-slate-800 dark:text-slate-200"></p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Información Cliente</p>
                            <p id="detProspectoInfo" class="text-sm font-bold text-slate-800 dark:text-slate-200"></p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Procedencia (Origen)</p>
                            <p id="detOrigen" class="text-sm font-bold text-slate-800 dark:text-slate-200"></p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Fecha Inicio / Contacto</p>
                            <p id="detFechaInicio" class="text-sm font-bold text-slate-800 dark:text-slate-200"></p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-primary">Fecha de Entrega</p>
                            <p id="detFechaEntrega" class="text-sm font-black text-primary dark:text-primary-light"></p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Nivel Académico</p>
                            <p id="detNivel" class="text-sm font-bold text-slate-800 dark:text-slate-200"></p>
                        </div>
                        <div class="space-y-1">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Universidad / Institución</p>
                            <p id="detInstitucion" class="text-sm font-bold text-slate-800 dark:text-slate-200"></p>
                        </div>
                        <div class="space-y-1 md:col-span-2">
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Carrera Profesional</p>
                            <p id="detCarrera" class="text-sm font-bold text-slate-800 dark:text-slate-200"></p>
                        </div>
                    </div>

                    <!-- Observaciones -->
                    <div class="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                        <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-slate-400 text-[18px]">notes</span>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Observaciones / Contenido</p>
                        </div>
                        <p id="detContenido" class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap italic"></p>
                    </div>

                    <!-- Contactos Adicionales -->
                    <div class="space-y-3">
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest px-1">Contactos Vinculados</p>
                        <div id="detContactosList" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <!-- Lista dinámica -->
                        </div>
                    </div>

                    <!-- Link de Drive (Editable) -->
                    <div class="bg-primary/5 p-5 rounded-2xl border border-primary/20 space-y-3">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="material-symbols-outlined text-primary text-[20px]">add_link</span>
                            <p class="text-xs font-black text-primary uppercase tracking-widest">Enlace de Google Drive</p>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <input type="text" id="detLinkDrive" 
                                   class="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-all font-medium" 
                                   placeholder="Pega aquí el enlace de la carpeta o archivo...">
                            <button type="button" onclick="guardarLinkDrive()" 
                                    class="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                                <span class="material-symbols-outlined text-[18px]">save</span>
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Modal Footer -->
            <div class="flex items-center justify-end px-6 py-4 border-t border-slate-100 dark:border-border-dark bg-slate-50 dark:bg-slate-800/50 rounded-b-3xl">
                <button type="button" onclick="closeModal('modalDetalleActividad')" class="px-5 py-2.5 rounded-xl font-bold text-sm bg-white dark:bg-neutral-dark border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
                    Cerrar
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Modal para Zoom de Imagen -->
<div id="modalImagenZoom" class="fixed inset-0 z-[70] hidden overflow-y-auto overflow-x-hidden">
    <!-- Backdrop con cierre al click -->
    <div class="fixed inset-0 bg-slate-900/90 backdrop-blur-md transition-opacity opacity-0 cursor-zoom-out" id="modalBackdrop" onclick="closeModal('modalImagenZoom')"></div>
    
    <!-- Wrapper interno flex -->
    <div class="relative flex min-h-screen items-center justify-center p-4 pointer-events-none">
        <!-- Contenedor de Imagen -->
        <div class="relative z-10 w-full max-w-5xl transform transition-all scale-95 opacity-0 duration-300 pointer-events-auto" id="modalContent">
            <div class="flex flex-col items-center gap-4">
                <img id="imgZoomed" src="" alt="Zoom" class="max-w-full max-h-[85vh] rounded-2xl shadow-2xl border-4 border-white/10">
                <button type="button" onclick="closeModal('modalImagenZoom')" class="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-md transition-all group">
                    <span class="material-symbols-outlined text-[32px] group-hover:scale-110 transition-transform">close</span>
                </button>
            </div>
        </div>
    </div>
</div>

<?= $this->endSection() ?>


<?= $this->section('js') ?>
<!-- SweetAlert2 -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<!-- FullCalendar -->
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js"></script>
<script src="<?= base_url('js/dashboard/index.js') ?>"></script>
<?= $this->endSection() ?>