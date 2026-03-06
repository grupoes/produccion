<?= $this->extend('layouts/main') ?>

<?= $this->section('content') ?>

<div class="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark p-8">
    <div class="max-w-7xl mx-auto w-full flex flex-col gap-8">
        <!-- Header Section -->
        <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h2 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Potenciales Clientes</h2>
                <p class="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Gestión y seguimiento de prospectos académicos</p>
            </div>
            <button onclick="nuevoProspecto()"
                class="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]">
                <span class="material-symbols-outlined text-[20px]">person_add</span>
                <span>Nuevo Prospecto</span>
            </button>
        </div>

        <!-- Filters & Table Card -->
        <div class="bg-white dark:bg-neutral-dark rounded-2xl border border-slate-200 dark:border-border-dark overflow-hidden shadow-sm transition-all">

            <!-- Table Section -->
            <div class="overflow-x-auto custom-scrollbar p-4">
                <table id="dtProspectos" class="w-full text-left border-collapse" style="width:100%">
                    <thead>
                        <tr class="bg-slate-50/50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-bold tracking-widest border-b border-slate-100 dark:border-border-dark">
                            <th class="px-6 py-4">Contacto</th>
                            <th class="px-6 py-4 text-center">Nivel</th>
                            <th class="px-6 py-4">Carrera</th>
                            <th class="px-6 py-4">Universidad</th>
                            <th class="px-6 py-4 text-center">Estado</th>
                            <th class="px-6 py-4">Fecha Entrega</th>
                            <th class="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="tablaProspectos" class="divide-y divide-slate-100 dark:divide-border-dark">
                        <!-- Filas insertadas por JS -->
                    </tbody>
                </table>
            </div>

        </div>
    </div>
</div>

<!-- Modal Nuevo Prospecto -->
<div id="modalNuevoProspecto" class="fixed inset-0 z-[60] hidden overflow-y-auto overflow-x-hidden">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity opacity-0" id="modalBackdrop"></div>

    <!-- Modal Content -->
    <div class="relative flex min-h-screen items-center justify-center p-4">
        <div class="relative w-full max-w-4xl transform rounded-3xl bg-white dark:bg-neutral-dark shadow-2xl transition-all scale-95 opacity-0 duration-300" id="modalContent">

            <!-- Modal Header -->
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-border-dark px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined">person_add</span>
                    </div>
                    <div>
                        <h3 id="modalTitle" class="text-lg font-bold text-slate-900 dark:text-white leading-none">Registrar Nuevo Prospecto</h3>
                        <p class="text-[13px] text-slate-500 mt-1">Complete los campos obligatorios</p>

                    </div>
                </div>
                <button type="button" onclick="closeModal('modalNuevoProspecto')" class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>

            <!-- Modal Body -->
            <form id="formNuevoProspecto" class="p-6">
                <div class="flex flex-col gap-6">

                    <!-- Sección 1: Información del Cliente -->
                    <div class="space-y-6">
                        <div class="flex items-center gap-2 mb-4">
                            <span class="size-2 rounded-full bg-primary"></span>
                            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Información Académica</h4>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Nivel Académico</label>
                                <input type="hidden" name="prospecto_id" id="prospecto_id" value="0">
                                <select name="nivelAcademico" class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer">
                                    <option value="">Seleccione nivel</option>
                                    <option>Pregrado</option>
                                    <option>Postgrado</option>
                                    <option>Doctorado</option>
                                </select>
                            </div>

                            <div class="relative" id="searchUniContainer">
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Universidad</label>
                                <div class="relative group">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                    <input type="text" id="uniSearchInput" placeholder="Buscar universidad..."
                                        class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                        autocomplete="off">

                                    <div id="uniResults" class="hidden absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                                        <div class="p-2 space-y-1" id="uniResultsList">
                                            <!-- Las universidades se cargarán dinámicamente aquí -->
                                            <div class="p-3 text-center text-xs text-slate-400">Cargando...</div>
                                        </div>
                                    </div>
                                    <input type="hidden" name="universidad" id="selectedUniId">
                                </div>
                            </div>

                            <div class="relative" id="searchCarreraContainer">
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Carrera</label>
                                <div class="relative group">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                    <input type="text" id="carreraSearchInput" placeholder="Buscar carrera..."
                                        class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                        autocomplete="off">

                                    <!-- Resultados de búsqueda -->
                                    <div id="carreraResults" class="hidden absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                                        <div class="p-2 space-y-1">
                                            <button type="button" class="carrera-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-value="Administración">Administración</button>
                                            <button type="button" class="carrera-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-value="Derecho">Derecho</button>
                                            <button type="button" class="carrera-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-value="Ingeniería Civil">Ingeniería Civil</button>
                                            <button type="button" class="carrera-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-value="Psicología">Psicología</button>
                                        </div>
                                    </div>
                                    <input type="hidden" name="carrera" id="selectedCarreraId">
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                            <div>
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Fecha Entrega Tentativa</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">calendar_month</span>
                                    <input type="date" name="fechaEntrega" class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" />
                                </div>
                            </div>
                            <div>
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Origen de Contacto</label>
                                <select id="id_origen" name="id_origen" class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-3 py-[9px] text-sm focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer">
                                    <option value="">Seleccione...</option>
                                </select>
                            </div>
                        </div>

                        <!-- Sección de Contactos -->
                        <div class="pt-2">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="size-2 rounded-full bg-emerald-500"></span>
                                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Contactos</h4>
                                </div>
                                <button type="button" onclick="agregarContacto()" class="text-[10px] font-black uppercase text-primary border border-primary/20 hover:bg-primary hover:text-white px-3 py-1.5 rounded-lg transition-all">
                                    + Agregar Nuevo
                                </button>
                            </div>

                            <div id="contenedorContactos" class="space-y-2 max-h-[240px] overflow-y-auto overflow-x-hidden custom-scrollbar pr-3">
                                <div class="contacto-item grid grid-cols-1 md:grid-cols-12 gap-2 p-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    <div class="md:col-span-4 leading-none">
                                        <input name="nombres[]" placeholder="Nombre" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
                                    </div>
                                    <div class="md:col-span-4 leading-none">
                                        <input name="apellidos[]" placeholder="Apellidos" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
                                    </div>
                                    <div class="md:col-span-4 leading-none">
                                        <input name="celular[]" placeholder="Celular" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" required />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Sección 2: Roles y Tareas -->
                    <div class="space-y-6 pt-6 border-t border-slate-100 dark:border-border-dark">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="size-2 rounded-full bg-amber-500"></span>
                            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Roles y Tareas</h4>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Asignar Roles</label>
                                <select id="rol_asignado" name="rol_asignado" class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer" required>
                                    <option value="">Seleccione rol...</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Tipo y Tarea</label>
                                <div class="flex gap-1">
                                    <select class="w-1/3 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-2 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer" id="tipo_tarea">
                                        <option value="">TODOS</option>
                                        <option value="1">PRIMARIA</option>
                                        <option value="0">COMPLEMENTARIA</option>
                                    </select>
                                    <div class="relative flex-1 group" id="searchTaskContainer">
                                        <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                        <input type="text" id="taskSearchInput" placeholder="Buscar tarea..."
                                            class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                            autocomplete="off" required>

                                        <!-- Resultados de búsqueda -->
                                        <div id="taskResults" class="hidden absolute top-full left-0 right-0 mt-1 bg-white dark:bg-neutral-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                                            <div class="p-2 space-y-1" id="taskResultsList">
                                                <div class="p-3 text-center text-xs text-slate-400">Seleccione un rol...</div>
                                            </div>

                                        </div>
                                        <input type="hidden" name="tareaRealizar" id="selectedTaskId">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Personal Responsable</label>
                                <select id="personal_responsable" name="personal" class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer" required>
                                    <option value="">Asignar personal...</option>
                                </select>
                            </div>

                            <div>
                                <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Link Drive</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">link</span>
                                    <input placeholder="https://drive.google.com/..." name="linkDrive" class="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" type="text" />
                                </div>
                            </div>
                        </div>

                        <!-- Opciones de horario manual -->
                        <div id="contenedorHorarioManual" class="grid grid-cols-1 md:grid-cols-2 gap-4 hidden bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-200 dark:border-amber-700/50">
                            <div>
                                <label class="block text-[13px] font-bold text-amber-900 dark:text-amber-200 mb-1 ml-1">Fecha de Inicio Manual</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-sm">event</span>
                                    <input type="date" id="fecha_inicio_manual" name="fecha_inicio_manual" min="<?= date('Y-m-d') ?>" class="w-full bg-white dark:bg-background-dark border border-amber-200 dark:border-amber-700/50 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all" />
                                </div>
                            </div>
                            <div>
                                <label class="block text-[13px] font-bold text-amber-900 dark:text-amber-200 mb-1 ml-1">Hora de Inicio Manual</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-sm">schedule</span>
                                    <input type="time" id="hora_inicio_manual" name="hora_inicio_manual" class="w-full bg-white dark:bg-background-dark border border-amber-200 dark:border-amber-700/50 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all" />
                                </div>
                            </div>
                            <div class="md:col-span-2">
                                <p class="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <span class="material-symbols-outlined text-[14px]">warning</span>
                                    El personal seleccionado no tiene un horario registrado. Por favor, asigne manualmente cuándo iniciará la tarea.
                                </p>
                            </div>
                        </div>

                        <div class="space-y-3">
                            <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Prioridad de Tarea</label>
                            <div class="flex items-center gap-5 px-5 bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-2xl h-12 w-fit">
                                <label class="flex items-center gap-2.5 cursor-pointer group">
                                    <input type="radio" name="prioridad" value="1" class="hidden peer" />
                                    <div class="size-4 rounded-full border-2 border-slate-300 dark:border-slate-700 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center">
                                        <div class="size-1.5 rounded-full bg-white opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span class="text-xs font-bold text-slate-500 peer-checked:text-primary transition-colors select-none">Baja</span>
                                </label>
                                <label class="flex items-center gap-2.5 cursor-pointer group">
                                    <input type="radio" name="prioridad" value="2" class="hidden peer" checked />
                                    <div class="size-4 rounded-full border-2 border-slate-300 dark:border-slate-700 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center">
                                        <div class="size-1.5 rounded-full bg-white opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span class="text-xs font-bold text-slate-500 peer-checked:text-primary transition-colors select-none">Media</span>
                                </label>
                                <label class="flex items-center gap-2.5 cursor-pointer group">
                                    <input type="radio" name="prioridad" value="3" class="hidden peer" />
                                    <div class="size-4 rounded-full border-2 border-slate-300 dark:border-slate-700 peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center">
                                        <div class="size-1.5 rounded-full bg-white opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                                    </div>
                                    <span class="text-xs font-bold text-slate-500 peer-checked:text-primary transition-colors select-none">Alta</span>
                                </label>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label class="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-1 ml-1">Apuntes / Observaciones</label>
                            <div class="bg-slate-50 dark:bg-background-dark rounded-xl overflow-hidden min-h-[160px]">
                                <div id="editorApuntes"></div>
                            </div>
                            <p class="text-[12px] text-slate-400 mt-1 ml-1 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[13px]">info</span>
                                Puedes pegar imágenes directamente y redimensionarlas
                            </p>
                        </div>
                    </div>

                    <!-- Footer Buttons -->
                    <div class="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-slate-100 dark:border-border-dark">
                        <button type="button" onclick="closeModal('modalNuevoProspecto')"
                            class="h-11 px-6 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                            Cancelar
                        </button>
                        <button type="submit"
                            class="h-11 px-8 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center justify-center min-w-[160px]">
                            Guardar Prospecto
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </div>
</div>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
<link href="https://cdn.datatables.net/2.0.8/css/dataTables.dataTables.min.css" rel="stylesheet">
<style>
    /* Estilos personalizados para Quill en modo oscuro */
    .ql-toolbar.ql-snow {
        border-color: #2d3748 !important;
        background-color: #f8fafc;
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
        padding: 8px !important;
    }

    .dark .ql-toolbar.ql-snow {
        background-color: #1a2233;
        border-color: #2d3748 !important;
    }

    .ql-container.ql-snow {
        border-color: #2d3748 !important;
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
        min-height: 120px;
        font-family: 'Inter', sans-serif;
        font-size: 13px;
    }

    .dark .ql-editor {
        color: #e2e8f0;
    }

    .ql-editor.ql-blank::before {
        color: #94a3b8 !important;
        font-style: normal;
    }

    .ql-snow .ql-stroke {
        stroke: #64748b !important;
    }

    .dark .ql-snow .ql-stroke {
        stroke: #94a3b8 !important;
    }

    .ql-snow .ql-fill {
        fill: #64748b !important;
    }

    .dark .ql-snow .ql-fill {
        fill: #94a3b8 !important;
    }

    .ql-snow.ql-toolbar button:hover .ql-stroke,
    .ql-snow.ql-toolbar button.ql-active .ql-stroke {
        stroke: #135bec !important;
    }

    /* Estilos para texto alrededor de imágenes */
    .ql-editor img {
        display: inline-block !important;
        vertical-align: middle;
        margin: 5px;
        max-width: 100%;
        cursor: pointer;
    }

    .ql-editor img.ql-align-left {
        float: left;
        margin-right: 15px;
    }

    .ql-editor img.ql-align-right {
        float: right;
        margin-left: 15px;
    }

    .ql-editor img.ql-align-center {
        display: block !important;
        margin: 10px auto;
    }

    /* Scrollbar personalizada */
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }

    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }

    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 10px;
    }

    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #334155;
    }

    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
    }

    .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #475569;
    }

    /* ── DataTables overrides ── */
    div.dataTables_wrapper {
        font-family: inherit;
    }

    div.dataTables_length label,
    div.dataTables_filter label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    div.dataTables_length select,
    div.dataTables_filter input {
        border: 1px solid #e2e8f0;
        border-radius: 0.75rem;
        outline: none;
        background: #fff;
        color: #0f172a;
        transition: all .2s;
    }

    div.dataTables_length select {
        padding: 0.375rem 0.75rem;
        font-size: 0.8125rem;
    }

    /* Input de buscador estilizado con icono integrado */
    div.dataTables_filter input {
        padding: 0.5rem 1rem 0.5rem 2.5rem;
        font-size: 0.875rem;
        width: 260px;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: 0.85rem center;
        background-size: 1.15rem;
    }

    div.dataTables_length select:focus {
        box-shadow: 0 0 0 3px rgba(19, 91, 236, .15);
        border-color: #135bec;
    }

    div.dataTables_filter input:focus {
        box-shadow: 0 0 0 3px rgba(19, 91, 236, .15);
        border-color: #135bec;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23135bec' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
    }

    .dark div.dataTables_length select {
        background: #0f172a;
        border-color: #334155;
        color: #f1f5f9;
    }

    .dark div.dataTables_filter input {
        background-color: #0f172a;
        border-color: #334155;
        color: #f1f5f9;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
    }

    .dark div.dataTables_filter input:focus {
        border-color: #3b82f6;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E");
    }

    div.dataTables_info {
        font-size: 0.72rem;
        font-weight: 600;
        color: #64748b;
        padding-top: 0.5rem;
    }

    /* Paginación DataTables */
    div.dataTables_paginate {
        margin-top: 0.25rem;
    }

    div.dataTables_paginate .paginate_button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.25rem;
        height: 2.25rem;
        border-radius: 0.75rem;
        font-size: 0.75rem;
        font-weight: 700;
        border: none !important;
        background: transparent !important;
        color: #64748b !important;
        cursor: pointer;
        transition: background .15s, color .15s;
        box-shadow: none !important;
    }

    div.dataTables_paginate .paginate_button:hover {
        background: #f1f5f9 !important;
        color: #135bec !important;
    }

    div.dataTables_paginate .paginate_button.current,
    div.dataTables_paginate .paginate_button.current:hover {
        background: #135bec !important;
        color: #fff !important;
        box-shadow: 0 4px 12px rgba(19, 91, 236, .25) !important;
        border-radius: 0.75rem;
    }

    div.dataTables_paginate .paginate_button.disabled,
    div.dataTables_paginate .paginate_button.disabled:hover {
        opacity: .35;
        cursor: not-allowed;
        color: #94a3b8 !important;
        background: transparent !important;
    }

    div.dataTables_paginate .paginate_button.previous,
    div.dataTables_paginate .paginate_button.next {
        font-size: 1rem;
    }

    .dark div.dataTables_paginate .paginate_button:hover {
        background: #1e293b !important;
    }

    /* Wrapper superior e inferior */
    div.dataTables_wrapper div.dataTables_length,
    div.dataTables_wrapper div.dataTables_filter {
        padding: 1rem 1.25rem 0.5rem;
    }

    div.dataTables_wrapper div.dataTables_info,
    div.dataTables_wrapper div.dataTables_paginate {
        padding: 0.75rem 1.25rem 1rem;
    }

    div.dataTables_wrapper div.dataTables_filter {
        text-align: right;
    }
</style>

<?= $this->endSection() ?>

<?= $this->section('js') ?>
<!-- jQuery (requerido por DataTables) -->
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<!-- DataTables JS -->
<script src="https://cdn.datatables.net/2.0.8/js/dataTables.min.js"></script>
<!-- Quill -->
<script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
<script>
    window.Quill = Quill;
</script>
<script src="https://unpkg.com/quill-image-resize-module@3.0.0/image-resize.min.js"></script>
<!-- SweetAlert2 -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="<?= base_url('js/clientes/potenciales.js') ?>"></script>
<?= $this->endSection() ?>