/**
 * ============================================================
 *  potenciales.js  –  Prospectos / Potenciales Clientes
 * ============================================================
 */

/* ── Paleta rotatoria de colores para avatares ─────────────── */
const avatarColors = [
    { bg: 'bg-primary/10', text: 'text-primary' },
    { bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
    { bg: 'bg-violet-500/10', text: 'text-violet-500' },
    { bg: 'bg-amber-500/10', text: 'text-amber-500' },
    { bg: 'bg-rose-500/10', text: 'text-rose-500' },
    { bg: 'bg-sky-500/10', text: 'text-sky-500' },
];

/* ── Badge de estado ────────────────────────────────────────── */
function badgeEstado(estado) {
    const mapa = {
        'Pendiente': 'bg-amber-100   text-amber-600   dark:bg-amber-500/10   dark:text-amber-500',
        'Interesado': 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500',
        'Cotizado': 'bg-blue-100    text-blue-600    dark:bg-blue-500/10    dark:text-blue-500',
        'Cerrado': 'bg-slate-100   text-slate-500   dark:bg-slate-800      dark:text-slate-400',
        'Perdido': 'bg-red-100     text-red-600     dark:bg-red-500/10     dark:text-red-500',
    };
    const cls = mapa[estado] || 'bg-slate-100 text-slate-500';
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cls} uppercase">${estado || '—'}</span>`;
}

/* ── Bloque HTML del/los contacto(s) ───────────────────────── */
function buildContactos(personas, color) {
    if (!personas || personas.length === 0) {
        return '<span class="text-xs text-slate-400">Sin contacto</span>';
    }
    if (personas.length === 1) {
        const per = personas[0];
        const nombre = `${per.nombres || ''} ${per.apellidos || ''}`.trim() || '—';
        const ini = nombre !== '—' ? nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?';
        return `
            <div class="flex items-center gap-3">
                <div class="size-9 rounded-full ${color.bg} flex items-center justify-center ${color.text} font-bold text-xs flex-shrink-0">${ini}</div>
                <div class="flex flex-col min-w-0">
                    <span class="text-sm font-bold text-slate-900 dark:text-white truncate">${nombre}</span>
                    <span class="text-[11px] text-slate-500">${per.celular || '—'}</span>
                </div>
            </div>`;
    }
    // Múltiples contactos
    let html = '<div class="flex flex-col gap-1.5">';
    personas.forEach(per => {
        const nombre = `${per.nombres || ''} ${per.apellidos || ''}`.trim() || '—';
        const ini = nombre !== '—' ? nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?';
        html += `
            <div class="flex items-center gap-2">
                <div class="size-7 rounded-full ${color.bg} flex items-center justify-center ${color.text} font-bold text-[10px] flex-shrink-0">${ini}</div>
                <div class="flex flex-col min-w-0">
                    <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${nombre}</span>
                    <span class="text-[10px] text-slate-500">${per.celular || '—'}</span>
                </div>
            </div>`;
    });
    html += '</div>';
    return html;
}

/* ── Instancia global de DataTables ────────────────────────── */
let dtTable = null;

/* ── Cargar prospectos desde la API ─────────────────────────── */
async function cargarProspectos() {
    const tbody = document.getElementById('tablaProspectos');
    if (!tbody) return;

    // Destruir instancia previa si existe
    if (dtTable) {
        dtTable.destroy();
        dtTable = null;
    }

    // Spinner mientras carga
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="px-6 py-12 text-center">
                <div class="flex flex-col items-center gap-3 text-slate-400">
                    <span class="material-symbols-outlined text-[36px] animate-spin">progress_activity</span>
                    <span class="text-sm font-medium">Cargando prospectos...</span>
                </div>
            </td>
        </tr>`;

    try {
        const resp = await fetch('prospecto/get-all');
        const data = await resp.json();

        if (data.status !== 'success' || !data.result || data.result.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-16 text-center">
                        <div class="flex flex-col items-center gap-3 text-slate-400">
                            <span class="material-symbols-outlined text-[48px]">person_search</span>
                            <span class="text-sm font-semibold">No hay prospectos registrados</span>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        // Construir filas
        let html = '';
        data.result.forEach((p, idx) => {
            const color = avatarColors[idx % avatarColors.length];
            const contactos = buildContactos(p.personas, color);
            const nivel = p.nivel_academico || '—';
            const carrera = p.carrera || '—';
            const uniAbr = p.abreviatura || (p.institucion ? p.institucion.substring(0, 8) : '—');
            const uniLabel = p.institucion || '—';
            const fechaHtml = p.fecha_entrega
                ? `<div class="flex items-center gap-2 text-sm text-slate-500">
                       <span class="material-symbols-outlined text-[18px]">calendar_today</span>
                       <span>${p.fecha_entrega}</span>
                   </div>`
                : '<span class="text-xs text-slate-400">—</span>';

            html += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors" data-id="${p.id}">
                <td class="px-6 py-4">${contactos}</td>
                <td class="px-6 py-4 text-center">
                    <span class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">${nivel}</span>
                </td>
                <td class="px-6 py-4">
                    <span class="text-sm font-medium text-slate-600 dark:text-slate-300">${carrera}</span>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <span class="size-2 rounded-full bg-blue-500 flex-shrink-0"></span>
                        <span class="text-sm text-slate-600 dark:text-slate-400" title="${uniLabel}">${uniAbr}</span>
                    </div>
                </td>
                <td class="px-6 py-4 text-center">${badgeEstado(p.estado_progreso)}</td>
                <td class="px-6 py-4">${fechaHtml}</td>
                <td class="px-6 py-4 text-right">
                    <div class="flex justify-end gap-1">
                        <button onclick="editarProspecto(${p.id})"
                            class="p-2 rounded-lg hover:bg-primary/10 text-slate-500 hover:text-primary transition-colors" title="Editar">
                            <span class="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button onclick="contactarWhatsApp(${p.id})"
                            class="p-2 rounded-lg hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-500 transition-colors" title="WhatsApp">
                            <span class="material-symbols-outlined text-[20px]">chat</span>
                        </button>
                        <button onclick="eliminarProspecto(${p.id})"
                            class="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-500 transition-colors" title="Eliminar">
                            <span class="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;

        // Inicializar DataTables
        dtTable = $('#dtProspectos').DataTable({
            language: {
                search: "",
                searchPlaceholder: "Buscar prospectos...",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando de _START_ a _END_ de _TOTAL_ prospectos",
                infoEmpty: "Mostrando 0 prospectos",
                infoFiltered: "(filtrado de _MAX_ totales)",
                emptyTable: "No hay datos disponibles en la tabla",
                zeroRecords: "No se encontraron coincidencias",
                loadingRecords: "Cargando...",
                paginate: {
                    first: '<span class="material-symbols-outlined text-[18px] leading-none">keyboard_double_arrow_left</span>',
                    last: '<span class="material-symbols-outlined text-[18px] leading-none">keyboard_double_arrow_right</span>',
                    next: '<span class="material-symbols-outlined text-[18px] leading-none">chevron_right</span>',
                    previous: '<span class="material-symbols-outlined text-[18px] leading-none">chevron_left</span>'
                }
            },
            pageLength: 10,
            lengthMenu: [5, 10, 25, 50],
            order: [],                 // sin orden por defecto
            columnDefs: [
                { orderable: false, targets: [0, 4, 6] }  // Contacto, Estado, Acciones no ordenables
            ],
            autoWidth: false,
            dom: '<"flex flex-wrap items-center justify-between gap-2 px-0"lf>t<"flex flex-wrap items-center justify-between gap-2 px-0"ip>',
        });

    } catch (err) {
        console.error('Error cargando prospectos:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center gap-3 text-red-400">
                        <span class="material-symbols-outlined text-[36px]">error</span>
                        <span class="text-sm font-medium">Error al cargar los prospectos</span>
                    </div>
                </td>
            </tr>`;
    }
}

/* ── Funciones de Modal / Edición / Acciones ───────────────────── */
function nuevoProspecto() {
    document.getElementById('formNuevoProspecto').reset();
    document.getElementById('prospecto_id').value = '0';
    document.getElementById('modalTitle').textContent = 'Registrar Nuevo Prospecto';

    // Limpiar Quill
    if (typeof quill !== 'undefined' && quill) {
        quill.setContents([]);
    }

    // Limpiar hidden inputs de búsqueda
    if (document.getElementById('selectedUniId')) document.getElementById('selectedUniId').value = '';
    if (document.getElementById('selectedCarreraId')) document.getElementById('selectedCarreraId').value = '';
    if (document.getElementById('selectedTaskId')) document.getElementById('selectedTaskId').value = '';

    // Resetear roles y horario manual
    const taskList = document.getElementById('taskResultsList');
    if (taskList) taskList.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Seleccione un rol...</div>';

    const selectUser = document.getElementById('personal_responsable');
    if (selectUser) selectUser.innerHTML = '<option value="">Asignar personal...</option>';

    if (typeof ocultarHorarioManual === 'function') ocultarHorarioManual();

    // Resetear contactos a uno vacío
    const contenedor = document.getElementById('contenedorContactos');
    if (contenedor) {
        contenedor.innerHTML = `
            <div class="contacto-item grid grid-cols-12 md:grid-cols-12 gap-2 p-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-800 relative">
                <div class="col-span-12 md:col-span-4 leading-none">
                    <input name="nombres[]" placeholder="Nombre" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
                </div>
                <div class="col-span-12 md:col-span-4 leading-none">
                    <input name="apellidos[]" placeholder="Apellidos" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
                </div>
                <div class="col-span-10 md:col-span-3 leading-none">
                    <input name="celular[]" placeholder="Celular" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" required />
                </div>
            </div>`;
    }

    openModal('modalNuevoProspecto');
}

async function editarProspecto(id) {
    try {
        const resp = await fetch(`prospecto/get-row/${id}`);
        const data = await resp.json();

        if (data.status === 'success') {
            const p = data.result.prospecto;
            const contactos = data.result.contactos;

            const form = document.getElementById('formNuevoProspecto');
            form.reset();

            document.getElementById('prospecto_id').value = p.id;
            document.getElementById('modalTitle').textContent = 'Editar Prospecto';

            // Llenar campos estáticos
            if (p.fecha_entrega) form.fechaEntrega.value = p.fecha_entrega.split(' ')[0];
            if (p.origen_id) form.id_origen.value = p.origen_id;
            if (p.link_drive) form.linkDrive.value = p.link_drive;

            // Radio prioridad
            if (p.prioridad) {
                const radios = form.querySelectorAll('input[name="prioridad"]');
                radios.forEach(r => r.checked = (r.value == p.prioridad));
            }

            // Asignación de Roles y Tareas Dinámicas
            if (p.rol) {
                form.rol_asignado.value = p.rol;

                // Cargar tareas y personal de este rol de forma asíncrona
                await cargarTareasYUsuariosPorRol(p.rol);

                // Seteamos personal si existe
                if (p.responsable_id) {
                    form.personal_responsable.value = p.responsable_id;
                }

                // Seteamos tarea visual y oculta si existe
                if (p.tarea_id) {
                    document.getElementById('selectedTaskId').value = p.tarea_id;
                    setTimeout(() => {
                        const btnTarea = document.querySelector(`.task-option[data-value="${p.tarea_id}"]`);
                        if (btnTarea && document.getElementById('taskSearchInput')) {
                            document.getElementById('taskSearchInput').value = btnTarea.textContent;
                        }
                    }, 100);
                } else {
                    document.getElementById('selectedTaskId').value = '';
                    if (document.getElementById('taskSearchInput')) document.getElementById('taskSearchInput').value = '';
                }
            } else {
                form.rol_asignado.value = '';
                document.getElementById('taskResultsList').innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Seleccione un rol...</div>';
                document.getElementById('personal_responsable').innerHTML = '<option value="">Asignar personal...</option>';
                document.getElementById('selectedTaskId').value = '';
                if (document.getElementById('taskSearchInput')) document.getElementById('taskSearchInput').value = '';
            }

            // Contenido Quill
            if (typeof quill !== 'undefined' && quill) {
                if (p.contenido) quill.clipboard.dangerouslyPasteHTML(p.contenido);
                else quill.setContents([]);
            }

            // Llenar contactos
            const contenedor = document.getElementById('contenedorContactos');
            contenedor.innerHTML = '';

            if (contactos && contactos.length > 0) {
                contactos.forEach(c => {
                    const nuevoId = Math.random().toString(36).substring(2, 9);
                    const div = document.createElement('div');
                    div.className = 'contacto-item grid grid-cols-12 gap-2 p-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-800 relative';
                    div.id = `contacto-${nuevoId}`;
                    div.innerHTML = `
                        <div class="col-span-12 md:col-span-4 leading-none">
                            <input name="nombres[]" value="${c.nombres || ''}" placeholder="Nombre"
                                class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
                        </div>
                        <div class="col-span-12 md:col-span-4 leading-none">
                            <input name="apellidos[]" value="${c.apellidos || ''}" placeholder="Apellidos"
                                class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
                        </div>
                        <div class="col-span-10 md:col-span-3 leading-none">
                            <input name="celular[]" value="${c.celular || ''}" placeholder="Celular"
                                class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
                        </div>
                        <div class="col-span-2 md:col-span-1 flex items-center justify-center">
                            <button type="button" onclick="eliminarContacto('${nuevoId}')" class="text-red-400 hover:text-red-500 transition-colors p-1">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>`;
                    contenedor.appendChild(div);
                });
            } else {
                agregarContacto();
            }

            openModal('modalNuevoProspecto');
        } else {
            console.error('Error del servidor:', data.message);
            Swal.fire({ title: 'Error', text: data.message || 'No se pudo obtener el prospecto', icon: 'error' });
        }
    } catch (err) {
        console.error('Error fetch get-row:', err);
    }
}

function contactarWhatsApp(id) {
    console.log('WhatsApp prospecto:', id);
    // TODO: abrir WhatsApp con el número del prospecto
}

async function eliminarProspecto(id) {
    if (typeof Swal === 'undefined') return;
    const isDark = document.documentElement.classList.contains('dark');
    const result = await Swal.fire({
        title: '¿Eliminar prospecto?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: isDark ? '#1e293b' : '#fff',
        color: isDark ? '#fff' : '#545454'
    });
    if (result.isConfirmed) {
        console.log('Eliminar prospecto:', id);
        // TODO: llamar al endpoint de eliminación y recargar
    }
}

/* ── Agregar / Eliminar contactos dentro del modal ─────────── */
function agregarContacto() {
    const contenedor = document.getElementById('contenedorContactos');
    const nuevoId = Date.now();

    const div = document.createElement('div');
    div.className = 'contacto-item grid grid-cols-12 gap-2 p-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-800 relative';
    div.id = `contacto-${nuevoId}`;
    div.innerHTML = `
        <div class="col-span-12 md:col-span-4 leading-none">
            <input name="nombres[]" placeholder="Nombre"
                class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
        </div>
        <div class="col-span-12 md:col-span-4 leading-none">
            <input name="apellidos[]" placeholder="Apellidos"
                class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
        </div>
        <div class="col-span-10 md:col-span-3 leading-none">
            <input name="celular[]" placeholder="Celular"
                class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
        </div>
        <div class="col-span-2 md:col-span-1 flex items-center justify-center">
            <button type="button" onclick="eliminarContacto('${nuevoId}')" class="text-red-400 hover:text-red-500 transition-colors p-1">
                <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>`;

    contenedor.appendChild(div);
    contenedor.scrollTo({ top: contenedor.scrollHeight, behavior: 'smooth' });
}

function eliminarContacto(id) {
    const item = document.getElementById(`contacto-${id}`);
    if (item) {
        item.style.transition = 'opacity .25s, transform .25s';
        item.style.opacity = '0';
        item.style.transform = 'scale(0.95)';
        setTimeout(() => item.remove(), 260);
    }
}

/* ── Quill Editor ───────────────────────────────────────────── */
let quill;
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('editorApuntes')) {
        window.Quill = Quill;

        let IRConstructor = window.ImageResize || (typeof ImageResize !== 'undefined' ? ImageResize : null);
        if (IRConstructor && IRConstructor.default) IRConstructor = IRConstructor.default;

        const quillModules = {
            toolbar: [
                ['bold', 'italic', 'underline'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['image', 'link'],
                ['clean']
            ]
        };

        if (IRConstructor) {
            try {
                if (!Quill.import('modules/imageResize')) {
                    Quill.register('modules/imageResize', IRConstructor);
                }
                quillModules.imageResize = { displaySize: true, modules: ['Resize', 'DisplaySize', 'Toolbar'] };
            } catch (e) {
                console.warn('ImageResize error:', e);
            }
        }

        quill = new Quill('#editorApuntes', {
            theme: 'snow',
            placeholder: 'Escriba aquí los detalles adicionales o pegue una imagen...',
            modules: quillModules
        });
    }

    // ── Cargar datos dinámicos ──
    cargarOrigenesContacto();
    cargarRoles();
    cargarUniversidades();
    cargarProspectos();

    // ── Selector de rol → tareas + personal ──
    const selectRol = document.getElementById('rol_asignado');
    if (selectRol) {
        selectRol.addEventListener('change', e => {
            const rolId = e.target.value;
            if (rolId) {
                cargarTareasYUsuariosPorRol(rolId);
            } else {
                tareasDelRolActual = [];
                const taskList = document.getElementById('taskResultsList');
                if (taskList) taskList.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Seleccione un rol...</div>';
                const selectUser = document.getElementById('personal_responsable');
                if (selectUser) selectUser.innerHTML = '<option value="">Asignar personal...</option>';
                ocultarHorarioManual();
            }
        });
    }

    // ── Selector de Personal Responsable ──
    const selectPersonal = document.getElementById('personal_responsable');
    if (selectPersonal) {
        selectPersonal.addEventListener('change', async e => {
            const personalId = e.target.value;
            ocultarUltimoHorario();

            if (personalId) {
                try {
                    const res = await fetch('horario/get-by-id/' + personalId);
                    const data = await res.json();

                    if (!data || !data.result || data.result.length === 0) {
                        mostrarHorarioManual();
                    } else {
                        ocultarHorarioManual();
                        // Si tiene horario, traer el último para referencia
                        cargarUltimoHorario(personalId);
                    }
                } catch (err) {
                    console.error('Error obteniendo horario:', err);
                    mostrarHorarioManual();
                }
            } else {
                ocultarHorarioManual();
            }
        });
    }

    // ── Selector tipo de tarea ──
    const selectTipoTarea = document.getElementById('tipo_tarea');
    if (selectTipoTarea) {
        selectTipoTarea.addEventListener('change', renderizarTareasPorTipo);
    }

    // ── Buscador carrera ──
    setupSearchSelect('carreraSearchInput', 'carreraResults', '.carrera-option', 'selectedCarreraId', 'searchCarreraContainer');
});

/* ── Envío del formulario de nuevo prospecto ────────────────── */
document.addEventListener('submit', async e => {
    if (e.target.id !== 'formNuevoProspecto') return;
    e.preventDefault();

    let apuntesContent = quill ? quill.root.innerHTML : '';
    if (apuntesContent === '<p><br></p>') apuntesContent = '';

    const formData = new FormData(e.target);
    formData.append('contenido', apuntesContent);

    const isDark = document.documentElement.classList.contains('dark');

    try {
        const resp = await fetch('prospectos/crear', { method: 'POST', body: formData });
        const data = await resp.json();

        console.log(data);


        if (data.status === 'success') {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: '¡Éxito!',
                    text: 'Prospecto guardado correctamente',
                    icon: 'success',
                    confirmButtonColor: '#135bec',
                    background: isDark ? '#1e293b' : '#fff',
                    color: isDark ? '#fff' : '#545454'
                }).then(() => {
                    closeModal('modalNuevoProspecto');
                    if (quill) quill.setContents([]);
                    e.target.reset();
                    cargarProspectos();   // ← recarga tabla sin recargar página
                });
            } else {
                alert('Prospecto guardado correctamente');
                closeModal('modalNuevoProspecto');
                if (quill) quill.setContents([]);
                e.target.reset();
                cargarProspectos();
            }
        } else {
            let errorMsg = data.message || 'Error al guardar el prospecto';
            if (typeof data.message === 'object') errorMsg = Object.values(data.message).join('\n');
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Error', text: errorMsg, icon: 'error', confirmButtonColor: '#135bec',
                    background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#545454'
                });
            } else {
                alert('Error: ' + errorMsg);
            }
        }
    } catch (err) {
        console.error('Error enviando formulario:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Error de servidor', text: 'Se produjo un problema al intentar guardar los datos.',
                icon: 'error', confirmButtonColor: '#135bec',
                background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#545454'
            });
        } else {
            alert('Ocurrió un error en el servidor o problema de red.');
        }
    }
});

/* ── Search Selects (Carrera / Universidad / Tarea) ─────────── */
function setupSearchSelect(inputId, resultsId, optionsClass, hiddenId, containerId) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    const options = document.querySelectorAll(optionsClass);
    const hidden = document.getElementById(hiddenId);
    if (!input || !results) return;

    input.addEventListener('focus', () => results.classList.remove('hidden'));

    input.addEventListener('input', e => {
        const term = e.target.value.toLowerCase();
        let hasResults = false;
        options.forEach(opt => {
            const match = opt.textContent.toLowerCase().includes(term);
            opt.classList.toggle('hidden', !match);
            if (match) hasResults = true;
        });
        results.classList.toggle('hidden', !hasResults && term !== '');
    });

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            input.value = opt.textContent.trim();
            if (hidden) hidden.value = opt.dataset.value || opt.textContent.trim();
            results.classList.add('hidden');
        });
    });

    document.addEventListener('click', e => {
        const container = document.getElementById(containerId);
        if (container && !container.contains(e.target)) results.classList.add('hidden');
    });
}

/* ── Mostrar / Ocultar Horario Manual ── */
function mostrarHorarioManual() {
    const contenedor = document.getElementById('contenedorHorarioManual');
    const fInicio = document.getElementById('fecha_inicio_manual');
    const hInicio = document.getElementById('hora_inicio_manual');
    if (contenedor) contenedor.classList.remove('hidden');
    if (fInicio) fInicio.required = true;
    if (hInicio) hInicio.required = true;
}

function ocultarHorarioManual() {
    const contenedor = document.getElementById('contenedorHorarioManual');
    const fInicio = document.getElementById('fecha_inicio_manual');
    const hInicio = document.getElementById('hora_inicio_manual');
    if (contenedor) contenedor.classList.add('hidden');
    if (fInicio) { fInicio.required = false; fInicio.value = ''; }
    if (hInicio) { hInicio.required = false; hInicio.value = ''; }
}

async function cargarUltimoHorario(personalId) {
    const contenedor = document.getElementById('containerUltimoHorario');
    const detalle = document.getElementById('detalleUltimoHorario');
    if (!contenedor || !detalle) return;

    try {
        const resp = await fetch(`get-ultimo-horario/${personalId}`);
        const data = await resp.json();

        if (data.status === 'success' && data.message) {
            contenedor.classList.remove('hidden');
            detalle.innerHTML = data.message; // En este caso el backend devuelve el string formateado como message
        } else {
            ocultarUltimoHorario();
        }
    } catch (e) {
        console.error('Error ultimo horario:', e);
        ocultarUltimoHorario();
    }
}

function ocultarUltimoHorario() {
    const contenedor = document.getElementById('containerUltimoHorario');
    if (contenedor) contenedor.classList.add('hidden');
}

function setupSearchSelectStatic(inputId, resultsId, optionsClass, hiddenId, containerId) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    const options = document.querySelectorAll(optionsClass);
    const hidden = document.getElementById(hiddenId);
    if (!input || !results) return;

    input.addEventListener('focus', () => results.classList.remove('hidden'));

    input.addEventListener('input', e => {
        const term = e.target.value.toLowerCase();
        let hasResults = false;
        options.forEach(opt => {
            const match = opt.textContent.toLowerCase().includes(term);
            opt.classList.toggle('hidden', !match);
            if (match) hasResults = true;
        });
        results.classList.toggle('hidden', !hasResults && term !== '');
    });

    options.forEach(opt => {
        opt.onclick = () => {
            input.value = opt.textContent.trim();
            if (hidden) hidden.value = opt.dataset.value;
            results.classList.add('hidden');
        };
    });

    document.addEventListener('click', e => {
        const container = document.getElementById(containerId);
        if (container && !container.contains(e.target)) results.classList.add('hidden');
    });
}

/* ── Datos dinámicos del modal ──────────────────────────────── */
async function cargarOrigenesContacto() {
    const sel = document.getElementById('id_origen');
    if (!sel) return;
    try {
        const resp = await fetch('origen-contacto/get-all');
        const data = await resp.json();
        if (data.status === 'success' && data.result) {
            data.result.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.id;
                opt.textContent = o.nombre;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error orígenes:', e); }
}

async function cargarRoles() {
    const sel = document.getElementById('rol_asignado');
    if (!sel) return;
    try {
        const resp = await fetch('permisos/lista-roles');
        const data = await resp.json();
        if (data.status === 'success' && data.result) {
            data.result.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = r.nombre;
                sel.appendChild(opt);
            });
        }
    } catch (e) { console.error('Error roles:', e); }
}

async function cargarUniversidades() {
    const listContainer = document.getElementById('uniResultsList');
    if (!listContainer) return;
    try {
        const resp = await fetch('instituciones/get-all');
        const data = await resp.json();
        if (data.status === 'success' && data.result) {
            let html = '';
            data.result.forEach(u => {
                html += `<button type="button" class="uni-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-value="${u.id}">${u.nombre} - ${u.abreviatura}</button>`;
            });
            listContainer.innerHTML = html;
            setTimeout(() => setupSearchSelectStatic('uniSearchInput', 'uniResults', '.uni-option', 'selectedUniId', 'searchUniContainer'), 0);
        } else {
            listContainer.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error al cargar universidades</div>';
        }
    } catch (e) {
        console.error('Error universidades:', e);
        listContainer.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error de conexión</div>';
    }
}

/* ── Tareas por Rol ─────────────────────────────────────────── */
let tareasDelRolActual = [];

async function cargarTareasYUsuariosPorRol(rolId) {
    const taskList = document.getElementById('taskResultsList');
    const selectUser = document.getElementById('personal_responsable');
    if (!taskList || !selectUser) return;

    taskList.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Cargando tareas...</div>';
    selectUser.innerHTML = '<option value="">Cargando personal...</option>';

    try {
        const resp = await fetch(`tareas/get-by-rol/${rolId}`);
        const data = await resp.json();

        if (data.status === 'success' && data.result) {
            let htmlUsers = '<option value="">Asignar personal...</option>';
            if (data.result.users && data.result.users.length > 0) {
                data.result.users.forEach(u => {
                    htmlUsers += `<option value="${u.id}">${u.nombres} ${u.apellidos}</option>`;
                });
            } else {
                htmlUsers = '<option value="">Sin personal disponible</option>';
            }
            selectUser.innerHTML = htmlUsers;

            tareasDelRolActual = data.result.tareas || [];
            renderizarTareasPorTipo();
        } else {
            taskList.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error al cargar tareas</div>';
            selectUser.innerHTML = '<option value="">Asignar personal...</option>';
        }
    } catch (e) {
        console.error('Error tareas / usuarios:', e);
        taskList.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error de conexión</div>';
        selectUser.innerHTML = '<option value="">Asignar personal...</option>';
    }
}

function renderizarTareasPorTipo() {
    const taskList = document.getElementById('taskResultsList');
    const tipoSelect = document.getElementById('tipo_tarea');
    if (!taskList) return;

    const tipoFiltro = tipoSelect ? tipoSelect.value : '';
    const tareasFilt = tipoFiltro !== ''
        ? tareasDelRolActual.filter(t => t.prioridad == tipoFiltro)
        : tareasDelRolActual;

    if (tareasFilt.length > 0) {
        let html = '';
        tareasFilt.forEach(t => {
            html += `<button type="button" class="task-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-value="${t.id}">${t.nombre}</button>`;
        });
        taskList.innerHTML = html;

        setTimeout(() => {
            const input = document.getElementById('taskSearchInput');
            if (input) {
                const clone = input.cloneNode(true);
                input.replaceWith(clone);
                setupSearchSelectStatic('taskSearchInput', 'taskResults', '.task-option', 'selectedTaskId', 'searchTaskContainer');
            }
        }, 0);
    } else {
        taskList.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">No hay tareas para este tipo/rol</div>';
    }
}

/* ── Cerrar modal al hacer clic en el backdrop ──────────────── */
document.addEventListener('click', e => {
    if (e.target.id === 'modalBackdrop') {
        const modal = e.target.closest('[id^="modal"]');
        if (modal) closeModal(modal.id);
    }
});
