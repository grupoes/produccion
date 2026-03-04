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
</style>
<div class="flex-1 overflow-y-auto custom-scrollbar p-8">
    <!-- Metrics Section -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-primary/10 border border-primary/20 p-6 rounded-xl flex flex-col">
            <span class="text-primary text-sm font-semibold mb-1 uppercase tracking-wider">Entregas
                Hoy</span>
            <div class="flex items-end justify-between">
                <h3 class="text-3xl font-bold">42</h3>
                <span class="text-emerald-500 text-sm font-medium flex items-center">
                    <span class="material-symbols-outlined text-sm mr-1">trending_up</span> +5%
                </span>
            </div>
        </div>
        <div class="bg-primary/10 border border-primary/20 p-6 rounded-xl flex flex-col">
            <span class="text-primary text-sm font-semibold mb-1 uppercase tracking-wider">Pendientes
                Hoy</span>
            <div class="flex items-end justify-between">
                <h3 class="text-3xl font-bold">12</h3>
                <span class="text-orange-500 text-sm font-medium flex items-center">
                    <span class="material-symbols-outlined text-sm mr-1">trending_down</span> -2%
                </span>
            </div>
        </div>
        <div class="bg-primary/10 border border-primary/20 p-6 rounded-xl flex flex-col">
            <span class="text-primary text-sm font-semibold mb-1 uppercase tracking-wider">Entrega
                Semanal</span>
            <div class="flex items-end justify-between">
                <h3 class="text-3xl font-bold">285</h3>
                <span class="text-emerald-500 text-sm font-medium flex items-center">
                    <span class="material-symbols-outlined text-sm mr-1">trending_up</span> +12%
                </span>
            </div>
        </div>
        <div class="bg-primary/10 border border-primary/20 p-6 rounded-xl flex flex-col">
            <span class="text-primary text-sm font-semibold mb-1 uppercase tracking-wider">Pendientes
                Semanal</span>
            <div class="flex items-end justify-between">
                <h3 class="text-3xl font-bold">34</h3>
                <span class="text-orange-500 text-sm font-medium flex items-center">
                    <span class="material-symbols-outlined text-sm mr-1">trending_down</span> -8%
                </span>
            </div>
        </div>
    </div>
    <!-- Workflow Section -->
    <div id="workflowSection" class="flex flex-col h-full min-h-[600px] pb-10">
        <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold">Workflow de Producción</h2>
            <div class="flex gap-2">
                <button
                    class="bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm">add</span> <span
                        class="hidden sm:inline">Nueva Tarea</span>
                </button>
            </div>
        </div>
        <!-- Kanban Board -->
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
                        class="bg-slate-400/20 text-slate-400 text-xs px-2 py-0.5 rounded-full font-bold">3</span>
                </div>
                <div class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                    <div draggable="true"
                        class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-primary/10 shadow-sm hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing">
                        <span
                            class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-500 mb-2 inline-block">Alta</span>
                        <h4 class="font-semibold text-sm mb-1">Montaje de Chasis #405</h4>
                        <p class="text-xs text-slate-500 mb-3">Trabajador: Carlos Ruiz</p>
                        <div class="flex justify-between items-center text-xs text-slate-400">
                            <span class="flex items-center gap-1"><span
                                    class="material-symbols-outlined text-xs">calendar_today</span> 12
                                Oct</span>
                            <span class="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                    </div>
                    <div draggable="true"
                        class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-primary/10 shadow-sm hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing">
                        <span
                            class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 mb-2 inline-block">Media</span>
                        <h4 class="font-semibold text-sm mb-1">Control de Calidad Lote 12</h4>
                        <p class="text-xs text-slate-500 mb-3">Trabajador: Ana García</p>
                        <div class="flex justify-between items-center text-xs text-slate-400">
                            <span class="flex items-center gap-1"><span
                                    class="material-symbols-outlined text-xs">calendar_today</span> 14
                                Oct</span>
                            <span class="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                    </div>
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
                <div class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                    <div draggable="true"
                        class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-primary/20 shadow-sm hover:border-primary/40 transition-all border-l-4 border-l-primary cursor-grab active:cursor-grabbing">
                        <span
                            class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-500 mb-2 inline-block">Alta</span>
                        <h4 class="font-semibold text-sm mb-1">Pintura Especial Ref-002</h4>
                        <p class="text-xs text-slate-500 mb-3">Trabajador: Roberto Mendez</p>
                        <div class="w-full bg-primary/10 rounded-full h-1.5 mb-3">
                            <div class="bg-primary h-1.5 rounded-full" style="width: 65%"></div>
                        </div>
                        <div class="flex justify-between items-center text-xs text-slate-400">
                            <span class="flex items-center gap-1"><span
                                    class="material-symbols-outlined text-xs">schedule</span> 2h
                                rest.</span>
                            <span class="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                    </div>
                    <div draggable="true"
                        class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-primary/10 shadow-sm hover:border-primary/40 transition-all cursor-grab active:cursor-grabbing">
                        <span
                            class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 mb-2 inline-block">Baja</span>
                        <h4 class="font-semibold text-sm mb-1">Etiquetado Serie Black</h4>
                        <p class="text-xs text-slate-500 mb-3">Trabajador: Sofia Kim</p>
                        <div class="w-full bg-primary/10 rounded-full h-1.5 mb-3">
                            <div class="bg-primary h-1.5 rounded-full" style="width: 30%"></div>
                        </div>
                        <div class="flex justify-between items-center text-xs text-slate-400">
                            <span class="flex items-center gap-1"><span
                                    class="material-symbols-outlined text-xs">schedule</span> 5h
                                rest.</span>
                            <span class="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                    </div>
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
                <div class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                    <div draggable="true"
                        class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-emerald-500/10 shadow-sm opacity-80 cursor-grab active:cursor-grabbing">
                        <span
                            class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 mb-2 inline-block">Baja</span>
                        <div class="flex items-start justify-between">
                            <h4 class="font-semibold text-sm mb-1 line-through text-slate-400">Embalaje
                                Pedido #221</h4>
                            <span
                                class="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                        </div>
                        <p class="text-xs text-slate-500 mb-3">Trabajador: Lucas Mora</p>
                        <div class="flex justify-between items-center text-xs text-slate-400">
                            <span
                                class="flex items-center gap-1 uppercase font-bold text-[9px]">Completado</span>
                            <span class="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                    </div>
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
                <div class="kanban-column-content space-y-3 flex-1 min-h-[150px]">
                    <div draggable="true"
                        class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-orange-500/10 shadow-sm border-l-4 border-l-orange-500 cursor-grab active:cursor-grabbing">
                        <span
                            class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-500 mb-2 inline-block">Alta</span>
                        <h4 class="font-semibold text-sm mb-1">Mantenimiento Torno C</h4>
                        <p class="text-xs text-slate-500 mb-3">Trabajador: Pedro S.</p>
                        <div
                            class="bg-orange-500/10 p-2 rounded text-[10px] text-orange-500 font-medium mb-3">
                            Falta repuesto rodamiento 22mm
                        </div>
                        <div class="flex justify-between items-center text-xs text-slate-400">
                            <span class="flex items-center gap-1 text-orange-500"><span
                                    class="material-symbols-outlined text-xs">warning</span> Crítico</span>
                            <span class="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                    </div>
                    <div draggable="true"
                        class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-orange-500/10 shadow-sm border-l-4 border-l-orange-500 cursor-grab active:cursor-grabbing">
                        <span
                            class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 mb-2 inline-block">Media</span>
                        <h4 class="font-semibold text-sm mb-1">Calibrado Láser X10</h4>
                        <p class="text-xs text-slate-500 mb-3">Trabajador: Elena V.</p>
                        <div class="flex justify-between items-center text-xs text-slate-400">
                            <span class="flex items-center gap-1 text-slate-500"><span
                                    class="material-symbols-outlined text-xs">pause</span> Espera</span>
                            <span class="material-symbols-outlined text-sm">more_horiz</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- Mobile Swipe Indicator -->
        <div class="swipe-indicator">
            <span class="material-symbols-outlined animate-pulse">keyboard_double_arrow_right</span>
            <span class="text-xs font-medium uppercase tracking-widest">Desliza para ver más</span>
        </div>
    </div>
</div>
<?= $this->endSection() ?>

<?= $this->section('js') ?>
<script src="<?= base_url('js/dashboard/index.js') ?>"></script>
<?= $this->endSection() ?>