<?= $this->extend('layouts/main') ?>
<?= $this->section('content') ?>

<div class="flex-1 overflow-y-auto custom-scrollbar">
    <div class="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-8">
    <!-- Title Section -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div class="space-y-2">
            <h1 class="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Mis Actividades <span class="text-primary">de Hoy</span>
            </h1>
            <p class="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-2">
                <span class="material-symbols-outlined text-lg text-primary">calendar_today</span>
                <?php
                $dias = array("Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado");
                $meses = array("Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre");
                echo $dias[date('w')].", ".date('d')." de ".$meses[date('n')-1]. " de ".date('Y');
                ?>
            </p>
        </div>
        <div class="flex items-center gap-3">
            <span class="relative flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </span>
            <span class="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">En Línea</span>
        </div>
    </div>

    <!-- Stats Summary -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/30 dark:shadow-none hover:border-success/40 transition-all duration-300">
            <div class="flex items-center gap-4">
                <div class="size-11 rounded-xl bg-success/10 flex items-center justify-center text-success shrink-0 transition-transform">
                    <span class="material-symbols-outlined text-2xl">check_circle</span>
                </div>
                <div>
                    <p class="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Completadas</p>
                    <div class="flex items-baseline gap-1.5">
                        <p class="text-xl font-black text-slate-900 dark:text-white leading-none">12</p>
                        <span class="text-slate-400 text-[9px] font-medium leading-none">/ 18 hoy</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/30 dark:shadow-none hover:border-primary/40 transition-all duration-300">
            <div class="flex items-center gap-4">
                <div class="size-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform">
                    <span class="material-symbols-outlined text-2xl">sync</span>
                </div>
                <div>
                    <p class="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">En Progreso</p>
                    <p class="text-xl font-black text-slate-900 dark:text-white leading-none">02</p>
                </div>
            </div>
        </div>

        <div class="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/30 dark:shadow-none hover:border-warning/40 transition-all duration-300">
            <div class="flex items-center gap-4">
                <div class="size-11 rounded-xl bg-warning/10 flex items-center justify-center text-warning shrink-0 transition-transform">
                    <span class="material-symbols-outlined text-2xl">pending_actions</span>
                </div>
                <div>
                    <p class="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">Pendientes</p>
                    <p class="text-xl font-black text-slate-900 dark:text-white leading-none">04</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Timeline / Task List -->
    <div class="space-y-6">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <div class="size-1 bg-primary rounded-full"></div>
                Cronograma de Turno
            </h2>
            <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl shadow-inner">
                <button class="px-5 py-2 text-xs font-black rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm transition-all hover:scale-105 active:scale-95">TODAS</button>
                <button class="px-5 py-2 text-xs font-black rounded-xl text-slate-500 dark:text-slate-400 hover:text-primary transition-all">URGENTES</button>
            </div>
        </div>

        <div class="grid grid-cols-1 gap-6">
            <!-- Task Card: In Progress (Alta Prioridad) -->
            <div class="group relative bg-danger rounded-3xl p-5 lg:p-6 shadow-2xl shadow-danger/30 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
                <!-- Decorative background element for depth -->
                <div class="absolute -right-10 -bottom-10 size-40 bg-white/10 rounded-full blur-3xl"></div>
                
                <div class="absolute top-0 right-0 p-5">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white border border-white/30 backdrop-blur-sm">En Progreso</span>
                </div>
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div class="space-y-3">
                        <div class="flex items-center gap-3">
                            <div class="px-3 py-0.5 rounded-lg bg-white/20 text-white font-black text-[10px] tracking-tight border border-white/20">08:00 - 10:30</div>
                            <span class="flex items-center gap-1 text-[9px] font-black text-white uppercase tracking-widest bg-danger/40 px-2 py-0.5 rounded-full border border-white/30">
                                <span class="size-1 rounded-full bg-white animate-pulse"></span> ALTA PRIORIDAD
                            </span>
                        </div>
                        <h3 class="text-xl lg:text-2xl font-black text-white group-hover:scale-[1.01] transition-transform line-clamp-1">Ensamblaje de Chasis XT-500</h3>
                        <div class="flex flex-wrap items-center gap-4">
                            <p class="text-white/90 font-bold flex items-center gap-1.5 text-xs">
                                <span class="material-symbols-outlined text-base">conveyor_belt</span>
                                Línea de Producción A-4
                            </p>
                            <p class="text-white/80 font-medium flex items-center gap-1 text-xs">
                                <span class="material-symbols-outlined text-base">category</span>
                                Lote: #552-XT
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <button class="flex items-center gap-2 px-4 py-3 bg-white text-danger hover:bg-white/90 rounded-xl text-xs font-black shadow-lg shadow-black/10 transition-all active:scale-95 group/btn">
                            <span class="material-symbols-outlined text-lg group-hover/btn:rotate-12 transition-transform">pause</span>
                            PAUSAR
                        </button>
                        <button class="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white hover:bg-black rounded-xl text-xs font-black shadow-lg shadow-black/20 transition-all active:scale-95 group/btn">
                            <span class="material-symbols-outlined text-lg group-hover/btn:scale-125 transition-transform">done_all</span>
                            FINALIZAR
                        </button>
                    </div>
                </div>
            </div>

            <!-- Task Card: Pending (Media Prioridad) -->
            <div class="group relative bg-warning rounded-3xl p-5 lg:p-6 shadow-2xl shadow-warning/30 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
                <div class="absolute -right-10 -bottom-10 size-40 bg-white/20 rounded-full blur-3xl"></div>
                
                <div class="absolute top-0 right-0 p-5">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/10 text-slate-900 border border-black/10 backdrop-blur-sm">Pendiente</span>
                </div>
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div class="space-y-3">
                        <div class="flex items-center gap-3">
                            <div class="px-3 py-0.5 rounded-lg bg-black/10 text-slate-900 font-black text-[10px] tracking-tight border border-black/10">11:00 - 12:30</div>
                            <span class="text-[9px] font-black text-slate-900 uppercase tracking-widest bg-white/40 px-2 py-0.5 rounded-full border border-black/10">
                                MEDIA
                            </span>
                        </div>
                        <h3 class="text-xl lg:text-2xl font-black text-slate-900 group-hover:scale-[1.01] transition-transform line-clamp-1">Control de Calidad - Lote #882</h3>
                        <div class="flex items-center gap-4">
                            <p class="text-slate-800 font-bold flex items-center gap-1.5 text-xs">
                                <span class="material-symbols-outlined text-base">conveyor_belt</span>
                                Área de Inspección B
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center shrink-0">
                        <button class="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white hover:bg-black rounded-xl text-xs font-black shadow-lg shadow-black/20 transition-all active:scale-95 group/btn">
                            <span class="material-symbols-outlined text-xl group-hover/btn:translate-x-1 transition-transform">play_arrow</span>
                            INICIAR TAREA
                        </button>
                    </div>
                </div>
            </div>

            <!-- Task Card: Finished (Baja Prioridad) -->
            <div class="group relative bg-success rounded-3xl p-5 lg:p-6 shadow-xl shadow-success/20 transition-all duration-500 overflow-hidden">
                <div class="absolute -right-10 -bottom-10 size-40 bg-white/20 rounded-full blur-3xl"></div>
                
                <div class="absolute top-0 right-0 p-5">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white border border-white/20">Completado</span>
                </div>
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div class="space-y-3">
                        <div class="flex items-center gap-3">
                            <div class="px-3 py-0.5 rounded-lg bg-white/20 text-white font-black text-[10px] tracking-tight border border-white/20">06:30 - 07:45</div>
                            <span class="text-[9px] font-black text-white uppercase tracking-widest bg-success/40 px-2 py-0.5 rounded-full border border-white/30">BAJA</span>
                        </div>
                        <h3 class="text-xl lg:text-2xl font-black text-white/90 line-through decoration-white/40 decoration-2 line-clamp-1">Mantenimiento Preventivo C2</h3>
                        <p class="text-white font-bold flex items-center gap-1.5 text-xs">
                            <span class="material-symbols-outlined text-base">verified</span>
                            Entregado hoy a las 07:38
                        </p>
                    </div>
                    <div class="flex items-center shrink-0">
                        <button class="flex items-center gap-2 px-5 py-3 bg-white/20 hover:bg-white/30 text-white border border-white/20 rounded-xl text-xs font-black transition-all active:scale-95 backdrop-blur-sm">
                            <span class="material-symbols-outlined text-lg">visibility</span>
                            DETALLES
                        </button>
                    </div>
                </div>
            </div>

            <!-- Task Card: Paused -->
            <div class="group relative bg-slate-50 dark:bg-slate-900 rounded-3xl border-l-[6px] border-danger p-5 lg:p-6 shadow-lg shadow-danger/5 transition-all duration-500 hover:-translate-y-1">
                <div class="absolute top-0 right-0 p-5">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-danger text-white border border-danger shadow-lg shadow-danger/20">Pausado</span>
                </div>
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div class="space-y-3">
                        <div class="flex items-center gap-3">
                            <div class="px-3 py-0.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white font-black text-[10px] tracking-tight">14:00 - 15:30</div>
                            <span class="flex items-center gap-1 text-[9px] font-black text-danger uppercase tracking-widest bg-danger/10 px-2 py-0.5 rounded-full border border-danger/20">
                                ALTA PRIORIDAD
                            </span>
                        </div>
                        <h3 class="text-xl lg:text-2xl font-black text-slate-900 dark:text-white">Carga de Materia Prima G-9</h3>
                        <p class="text-danger font-bold flex items-center gap-1.5 text-xs py-1.5 bg-danger/5 px-3 rounded-lg inline-flex w-fit border border-danger/10">
                            <span class="material-symbols-outlined text-base">error</span>
                            Pendiente: Respuesta de Almacén
                        </p>
                    </div>
                    <div class="flex items-center shrink-0">
                        <button class="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl text-white text-xs font-black shadow-lg shadow-primary/20 transition-all active:scale-95 group/btn">
                            <span class="material-symbols-outlined text-xl group-hover/btn:rotate-[-45deg] transition-transform">refresh</span>
                            REANUDAR
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Quick Actions Mobile -->
    <div class="lg:hidden grid grid-cols-2 gap-6 pb-6">
        <button class="flex flex-col items-center justify-center p-6 bg-slate-900 text-white rounded-[2.5rem] shadow-2xl shadow-slate-900/30 active:scale-95 transition-all touch-none">
            <div class="size-12 rounded-2xl bg-white/10 flex items-center justify-center mb-3">
                <span class="material-symbols-outlined text-2xl">report_problem</span>
            </div>
            <span class="text-[10px] font-black uppercase tracking-widest leading-none">Reportar<br>Incidencia</span>
        </button>
        <button class="flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-[2.5rem] shadow-xl active:scale-95 transition-all touch-none">
            <div class="size-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-3 text-primary">
                <span class="material-symbols-outlined text-2xl">help_center</span>
            </div>
            <span class="text-[10px] font-black uppercase tracking-widest leading-none text-slate-500 dark:text-slate-300">Pedir<br>Asistencia</span>
        </button>
    </div>
</div>
</div>

<?= $this->endSection() ?>