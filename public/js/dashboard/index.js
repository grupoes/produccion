
// Drag and Drop Implementation
function asignarEventosDragDrop() {
    const cards = document.querySelectorAll('.kanban-card');
    const columns = document.querySelectorAll('.kanban-column-content');

    cards.forEach(card => {
        // Remover listeners anteriores para evitar duplicados si ocurriera
        card.replaceWith(card.cloneNode(true));
    });

    const newCards = document.querySelectorAll('.kanban-card');

    newCards.forEach(card => {
        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
    });

    columns.forEach(column => {
        // Clonamos para remover listeners antiguos (porque las columnas se vacían innerHTML así que los drag leaves podrían ensuciar, aunque no estrictamente requerido si no se clonan las columnas en sí mismas. Mejor solo los definimos si usamos una flag)
        if (!column.dataset.dndInit) {
            column.addEventListener('dragover', e => {
                const draggingCard = document.querySelector('.dragging');
                if (!draggingCard) return;

                const estadoOrigen = draggingCard.getAttribute('data-estado');
                let columnaDestino = '';

                switch (column.id) {
                    case 'col-pendientes': columnaDestino = 'Pendiente'; break;
                    case 'col-en-proceso': columnaDestino = 'En Proceso'; break;
                    case 'col-finalizado': columnaDestino = 'Finalizado'; break;
                    case 'col-pausado': columnaDestino = 'Pausado'; break;
                }

                if (estadoOrigen !== columnaDestino) {
                    let isValidMove = false;
                    if (estadoOrigen === 'Pendiente' && columnaDestino === 'En Proceso') isValidMove = true;
                    if (estadoOrigen === 'En Proceso' && (columnaDestino === 'Finalizado' || columnaDestino === 'Pausado')) isValidMove = true;
                    if (estadoOrigen === 'Pausado' && columnaDestino === 'En Proceso') isValidMove = true;

                    if (!isValidMove) {
                        return;
                    }
                }

                e.preventDefault();
                column.classList.add('drag-over');

                const afterElement = getDragAfterElement(column, e.clientY);

                if (afterElement == null) {
                    column.appendChild(draggingCard);
                } else {
                    column.insertBefore(draggingCard, afterElement);
                }
            });

            column.addEventListener('dragleave', () => {
                column.classList.remove('drag-over');
            });

            column.addEventListener('drop', (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');

                const draggedCard = document.querySelector('.dragging') || e.target.closest('.kanban-card');
                if (!draggedCard) return;

                const estadoOrigen = draggedCard.getAttribute('data-estado');
                let nuevoEstado = '';

                switch (column.id) {
                    case 'col-pendientes': nuevoEstado = 'Pendiente'; break;
                    case 'col-en-proceso': nuevoEstado = 'En Proceso'; break;
                    case 'col-finalizado': nuevoEstado = 'Finalizado'; break;
                    case 'col-pausado': nuevoEstado = 'Pausado'; break;
                }

                if (estadoOrigen === nuevoEstado) {
                    updateColumnCounters();
                    return;
                }

                let idColOrigen = '';
                switch (estadoOrigen) {
                    case 'Pendiente': idColOrigen = 'col-pendientes'; break;
                    case 'En Proceso': idColOrigen = 'col-en-proceso'; break;
                    case 'Finalizado': idColOrigen = 'col-finalizado'; break;
                    case 'Pausado': idColOrigen = 'col-pausado'; break;
                }

                const recargarColumnasAfectadas = () => {
                    cargarColumna(estadoOrigen, idColOrigen);
                    // Solo recargar destino si es distinto al origen (aunque ya validamos antes que son distintos)
                    if (estadoOrigen !== nuevoEstado) {
                        cargarColumna(nuevoEstado, column.id);
                    }
                };

                if (nuevoEstado === 'En Proceso') {
                    const cardsInProcess = document.getElementById('col-en-proceso').querySelectorAll('.kanban-card');
                    if (cardsInProcess.length > 1) { // 1 es la tarjeta actual que se acaba de arrastrar visualmente
                        Swal.fire({
                            icon: 'warning',
                            title: 'No permitido',
                            text: 'Solo puede haber una actividad "En Proceso" a la vez. Finaliza o pausa la actual para continuar.'
                        });
                        recargarColumnasAfectadas();
                        return;
                    }
                }

                const procesarMove = async () => {
                    const cardId = draggedCard.getAttribute('data-id');
                    if (cardId && nuevoEstado) {
                        try {
                            const formData = new FormData();
                            formData.append('id_actividad', cardId);
                            formData.append('estado_progreso', nuevoEstado);

                            const resp = await fetch('update-estado-tarea', {
                                method: 'POST',
                                body: formData
                            });

                            if (!resp.ok) throw new Error('Error en la comunicación con el servidor');

                            Swal.fire({
                                icon: 'success',
                                title: '¡Actualizado!',
                                text: `La tarea se ha movido a ${nuevoEstado}.`,
                                timer: 1500,
                                showConfirmButton: false
                            });

                            recargarColumnasAfectadas();
                        } catch (err) {
                            console.error('Error moviendo tarea', err);
                            Swal.fire({
                                icon: 'error',
                                title: 'Error',
                                text: 'Hubo un problema al mover la tarea.'
                            });
                            recargarColumnasAfectadas();
                        }
                    }
                };

                // Confirmación
                Swal.fire({
                    title: '¿Confirmar movimiento?',
                    text: `¿Seguro que deseas mover la categoría a ${nuevoEstado}?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Sí, mover',
                    cancelButtonText: 'Cancelar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        procesarMove();
                    } else {
                        recargarColumnasAfectadas();
                    }
                });
            });
            column.dataset.dndInit = true;
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateColumnCounters() {
    const columnContainers = document.querySelectorAll('.kanban-column');
    columnContainers.forEach(container => {
        const content = container.querySelector('.kanban-column-content');
        const counter = container.querySelector('span[class*="rounded-full font-bold"]');
        if (content && counter) {
            counter.innerText = content.querySelectorAll('.kanban-card').length;
        }
    });
}

// Configurar Fechas y Cargar Datos
document.addEventListener('DOMContentLoaded', () => {
    const fechaInicio = document.getElementById('filtroFechaInicio');
    const fechaFin = document.getElementById('filtroFechaFin');

    if (fechaInicio && fechaFin) {
        // Fecha de hoy
        const hoy = new Date();
        const strHoy = hoy.toISOString().split('T')[0];

        if (typeof USER_ROL_ID !== 'undefined' && (USER_ROL_ID == 1 || USER_ROL_ID == 2)) {
            // Admin/Super: Hace 8 días a hoy
            const hace8Dias = new Date(hoy);
            hace8Dias.setDate(hoy.getDate() - 8);
            const strHace8Dias = hace8Dias.toISOString().split('T')[0];

            fechaInicio.value = strHace8Dias;
            fechaFin.value = strHoy;
        } else {
            // Auxiliar: Hoy a Hoy, con limitación de max
            fechaInicio.value = strHoy;
            fechaFin.value = strHoy;
            fechaFin.setAttribute('max', strHoy);
        }

        // Cargar por primera vez
        cargarDashboardCompleto();
    }

    // Cargar auxiliares si el select existe (rol 1 o 2)
    const selectAuxiliar = document.getElementById('filtroAuxiliar');
    if (selectAuxiliar) {
        cargarAuxiliares();
        selectAuxiliar.addEventListener('change', cargarDashboardCompleto);
    }

    const btnFiltrar = document.getElementById('btnFiltrarDashboard');
    if (btnFiltrar) {
        btnFiltrar.addEventListener('click', cargarDashboardCompleto);
    }

    // Initial drag and drop setup for any pre-existing cards
    asignarEventosDragDrop();

    // ── View Toggle Logic ──
    const btnKanban = document.getElementById('showKanban');
    const btnCalendar = document.getElementById('showCalendar');
    const kanbanView = document.getElementById('kanbanView');
    const calendarView = document.getElementById('calendarView');
    const kanbanFilters = document.getElementById('kanbanFilters');

    if (btnKanban && btnCalendar) {
        btnKanban.addEventListener('click', () => {
            kanbanView.classList.remove('hidden');
            calendarView.classList.add('hidden');
            kanbanFilters.classList.remove('hidden');

            // Update button styles
            btnKanban.classList.add('bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-sm');
            btnKanban.classList.remove('text-slate-500');
            btnCalendar.classList.remove('bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-sm');
            btnCalendar.classList.add('text-slate-500');
        });

        btnCalendar.addEventListener('click', () => {
            kanbanView.classList.add('hidden');
            calendarView.classList.remove('hidden');
            kanbanFilters.classList.add('hidden');

            // Update button styles
            btnCalendar.classList.add('bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-sm');
            btnCalendar.classList.remove('text-slate-500');
            btnKanban.classList.remove('bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-sm');
            btnKanban.classList.add('text-slate-500');

            initCalendar();
            if (calendarInstance) {
                setTimeout(() => {
                    calendarInstance.updateSize();
                }, 50);
            }
        });
    }

    // --- Lógica para Zoom de Imágenes en Observaciones ---
    const detContenido = document.getElementById('detContenido');
    if (detContenido) {
        detContenido.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                const src = e.target.src;
                const imgZoomed = document.getElementById('imgZoomed');
                if (imgZoomed) {
                    imgZoomed.src = src;
                    if (typeof openModal === 'function') {
                        openModal('modalImagenZoom');
                    }
                }
            }
        });
    }
});


let calendarInstance = null;
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    if (calendarInstance) {
        calendarInstance.render();
        return;
    }

    const isAdmin = (typeof USER_ROL_ID !== 'undefined' && (USER_ROL_ID == 1 || USER_ROL_ID == 2));

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        firstDay: 1, // Lunes
        locale: 'es',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día'
        },
        slotMinTime: '08:00:00',
        slotMaxTime: '19:00:00',
        allDaySlot: false,
        displayEventTime: (typeof USER_ROL_ID !== 'undefined' && (USER_ROL_ID == 1 || USER_ROL_ID == 2)),
        events: async function (info, successCallback, failureCallback) {
            try {
                const fAuxiliar = document.getElementById('filtroAuxiliar')?.value || '';
                const url = fAuxiliar ? `horario/get-usuario?id_user=${fAuxiliar}` : 'horario/get-usuario';
                const resp = await fetch(url);
                const data = await resp.json();

                if (data.status === 'success' || data.status === 200) {
                    let results = data.result || [];

                    if (!isAdmin) {
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        results = results.filter(act => act.start && act.start.startsWith(todayStr));
                    }

                    const events = results.map(act => {
                        return {
                            id: act.actividad_id || act.id,
                            title: act.title || 'Sin título',
                            start: act.start,
                            end: act.end,
                            color: act.color || '#3b82f6',
                            extendedProps: {
                                tipo: act.tipo,
                                duracion: act.duracion_minutos
                            }
                        };
                    });
                    successCallback(events);
                } else {
                    successCallback([]);
                }
            } catch (err) {
                console.error('Error cargando eventos del horario:', err);
                failureCallback(err);
            }
        },
        eventClick: function (info) {
            verDetalleActividad(info.event.id);
        },
        height: 'auto',
        themeSystem: 'standard'
    });

    calendarInstance.render();
}

function cargarDashboardCompleto() {
    cargarColumna('Pendiente', 'col-pendientes');
    cargarColumna('En Proceso', 'col-en-proceso');
    cargarColumna('Finalizado', 'col-finalizado');
    cargarColumna('Pausado', 'col-pausado');
}

async function cargarColumna(estado, containerId) {
    const contenedor = document.getElementById(containerId);
    if (!contenedor) return;

    // Estado de carga
    contenedor.innerHTML = '<div class="text-center text-xs text-slate-400 py-4"><span class="material-symbols-outlined animate-spin text-lg">progress_activity</span></div>';

    const fInicio = document.getElementById('filtroFechaInicio').value;
    const fFin = document.getElementById('filtroFechaFin').value;
    const fAuxiliar = document.getElementById('filtroAuxiliar')?.value || '';

    try {
        const formData = new FormData();
        formData.append('fecha_inicio', fInicio);
        formData.append('fecha_fin', fFin);
        formData.append('estado_progreso', estado);
        if (fAuxiliar) formData.append('id_user', fAuxiliar);

        const resp = await fetch('getEstadosActividades', {
            method: 'POST',
            body: formData
        });

        const data = await resp.json();

        if (data.status === 'success' && Array.isArray(data.result)) {
            let html = '';

            if (data.result.length === 0) {
                html = '<div class="text-center text-xs text-slate-400 py-8 border border-dashed border-slate-200 dark:border-slate-700/50 rounded-lg">Nada por aquí</div>';
            } else {
                data.result.forEach(act => {
                    const prioridadText = act.prioridad == '3' ? 'Alta' : (act.prioridad == '1' ? 'Baja' : 'Media');
                    const esFinalizado = estado === 'Finalizado';
                    let fechaTxt = '-';
                    let tooltipFecha = 'Fecha';

                    if (estado === 'Pendiente' || estado === 'En Proceso' || estado === 'Finalizado') {
                        tooltipFecha = 'Fecha de Inicio';
                        fechaTxt = act.fecha_inicio ? formatFecha(act.fecha_inicio) : (act.fecha_contacto ? formatFecha(act.fecha_contacto) : '-');
                    } else {
                        tooltipFecha = 'Fecha de Contacto';
                        fechaTxt = act.fecha_contacto ? formatFecha(act.fecha_contacto) : '-';
                    }

                    // Color mapping based on priority
                    let cardBgClass = '';
                    let textClass = 'text-white';
                    let badgeBgClass = 'bg-white/20';
                    let shadowClass = '';

                    if (act.prioridad == '3') { // Alta
                        cardBgClass = 'bg-danger';
                        shadowClass = 'shadow-danger/20';
                    } else if (act.prioridad == '1') { // Baja
                        cardBgClass = 'bg-success';
                        shadowClass = 'shadow-success/20';
                    } else { // Media
                        cardBgClass = 'bg-warning';
                        textClass = 'text-slate-900';
                        badgeBgClass = 'bg-black/10';
                        shadowClass = 'shadow-warning/20';
                    }

                    const nombreTarea = act.nombre || 'Actividad sin nombre';
                    const nombreUsuario = act.nombres && act.apellidos ? `${act.nombres} ${act.apellidos}` : 'Sin asignar';

                    html += `
                        <div ${esFinalizado ? '' : 'draggable="true"'} data-estado="${estado}" data-id="${act.id}" 
                             class="kanban-card ${cardBgClass} p-4 rounded-2xl shadow-lg ${shadowClass} transition-all duration-300 ${esFinalizado ? 'opacity-80 saturate-[0.7]' : 'hover:-translate-y-1 cursor-grab active:cursor-grabbing'} relative overflow-hidden group">
                            
                            <!-- Deco background -->
                            <div class="absolute -right-6 -bottom-6 size-24 bg-white/10 rounded-full blur-2xl"></div>

                            <div class="flex items-center justify-between mb-3 relative z-10">
                                <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${badgeBgClass} ${textClass} border border-white/10 backdrop-blur-sm tracking-widest">
                                    ${prioridadText}
                                </span>
                                ${act.prioridad == '1' ? '<span class="size-1.5 rounded-full bg-white animate-pulse"></span>' : ''}
                            </div>

                            <h4 class="font-black ${textClass} text-sm mb-2 line-clamp-2 leading-tight relative z-10" title="${nombreTarea}">
                                ${nombreTarea}
                            </h4>

                            <div class="space-y-1 mb-4 relative z-10">
                                <p class="${textClass} opacity-70 text-[10px] uppercase font-bold tracking-tighter">Asignado por:</p>
                                <p class="${textClass} text-[11px] font-bold truncate">${nombreUsuario}</p>
                            </div>

                            <div class="flex justify-between items-center text-[10px] ${textClass} mt-auto pt-3 border-t border-white/10 relative z-10">
                                <span class="flex items-center gap-1 font-bold opacity-80" title="${tooltipFecha}">
                                    <span class="material-symbols-outlined text-[14px]">calendar_today</span> 
                                    <span>${fechaTxt.split(' ')[0]}</span>
                                </span>
                                <div class="flex gap-1">
                                    <button type="button" onclick="verDetalleActividad('${act.id}')" 
                                            class="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 transition-colors ${textClass}" title="Ver Detalles">
                                        <span class="material-symbols-outlined text-[16px]">visibility</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }
            contenedor.innerHTML = html;

            // Refrescar listeners Drag & Drop (ya que re-rendereamos html local)
            asignarEventosDragDrop();
        } else {
            contenedor.innerHTML = '<div class="text-red-400 text-xs text-center py-4 border border-dashed border-red-200 rounded-lg">Error backend</div>';
        }
    } catch (err) {
        console.error("Error pidiendo columna " + estado, err);
        contenedor.innerHTML = '<div class="text-red-400 text-xs text-center py-4 border border-dashed border-red-200 rounded-lg">Falla de conexión</div>';
    } finally {
        updateColumnCounters();
    }
}

// ----------------------------------------------------
// VER DETALLES DE LA ACTIVIDAD
// ----------------------------------------------------
async function verDetalleActividad(id) {
    // Abrir Modal
    const modalId = 'modalDetalleActividad';
    if (typeof openModal === 'function') openModal(modalId);

    const loader = document.getElementById('detalleLoader');
    const contenido = document.getElementById('detalleContenido');
    if (loader) loader.classList.remove('hidden');
    if (contenido) contenido.classList.add('hidden');

    try {
        const res = await fetch(`getActividadRow/${id}`);
        const data = await res.json();

        if (data.status === 'success' && data.result) {
            const det = data.result;

            // Rellenar IDs ocultos
            document.getElementById('detActividadId').value = det.id;
            document.getElementById('detProspectoId').value = det.prospecto_id;

            // Datos Principales
            document.getElementById('detNombre').textContent = det.tarea || 'Sin Título';
            document.getElementById('detEstado').textContent = det.estado_progreso;

            // Prioridad Logic
            let pColor = '';
            let pText = '';
            // 1=Baja, 2=Media, 3=Alta
            if (det.prioridad == '3') {
                pText = 'Alta';
                pColor = 'bg-danger text-white border-danger/50 shadow-danger/20';
            } else if (det.prioridad == '1') {
                pText = 'Baja';
                pColor = 'bg-success text-white border-success/50 shadow-success/20';
            } else {
                pText = 'Media';
                pColor = 'bg-warning text-slate-900 border-warning/50 shadow-warning/20';
            }

            const elPrioridad = document.getElementById('detPrioridad');
            elPrioridad.textContent = pText;
            elPrioridad.className = `px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border shadow-sm ${pColor}`;

            // Responsable y Prospecto
            const nombreProspecto = `${det.nombres || ''} ${det.apellidos || ''}`.trim();
            document.getElementById('detResponsable').textContent = 'Responsable Asignado';
            document.getElementById('detProspectoInfo').textContent = `${det.estado_cliente} - ${nombreProspecto}`;
            document.getElementById('detOrigen').textContent = det.origen || 'No especificado';
            document.getElementById('detFechaInicio').textContent = det.fecha_contacto ? formatFecha(det.fecha_contacto) : '-';

            // Nuevos Campos
            document.getElementById('detFechaEntrega').textContent = det.fecha_entrega ? formatFecha(det.fecha_entrega) : 'Sin fecha pactada';
            document.getElementById('detNivel').textContent = det.nivel_academico || 'No especificado';
            document.getElementById('detInstitucion').textContent = det.institucion || 'No especificada';
            document.getElementById('detCarrera').textContent = det.carrera || 'No especificada';
            document.getElementById('detContenido').innerHTML = det.contenido || 'Sin observaciones adicionales.';

            // Link Drive
            document.getElementById('detLinkDrive').value = det.link_drive || '';

            // Render Contacts List
            const contactsContainer = document.getElementById('detContactosList');
            contactsContainer.innerHTML = '';
            if (Array.isArray(det.contactos) && det.contactos.length > 0) {
                det.contactos.forEach(c => {
                    contactsContainer.innerHTML += `
                        <div class="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <div class="size-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                <span class="material-symbols-outlined text-sm">person</span>
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${c.nombres} ${c.apellidos || ''}</p>
                                <p class="text-[10px] text-slate-500 font-medium">${c.celular || 'Sin celular'}</p>
                            </div>
                        </div>
                    `;
                });
            } else {
                contactsContainer.innerHTML = '<p class="text-[10px] text-slate-400 italic px-1">No hay contactos adicionales vinculados.</p>';
            }

            // Mostrar contenido
            loader.classList.add('hidden');
            contenido.classList.remove('hidden');

        } else {
            throw new Error(data.message || "Error al obtener datos");
        }
    } catch (err) {
        console.error("Error cargando detalle:", err);
        Swal.fire('Error', 'No se pudo cargar la información de la actividad', 'error');
        closeModal(modalId);
    }
}

async function guardarLinkDrive() {
    const idActividad = document.getElementById('detActividadId').value;
    const idProspecto = document.getElementById('detProspectoId').value;
    const link = document.getElementById('detLinkDrive').value;

    if (!idActividad) return;

    Swal.fire({
        title: 'Guardando...',
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const formData = new FormData();
        formData.append('id_actividad', idActividad);
        formData.append('id_prospecto', idProspecto);
        formData.append('dt-link-drive', link);

        const res = await fetch('update-link-drive', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (data.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: '¡Guardado!',
                text: 'El enlace de Google Drive se ha actualizado correctamente.',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            throw new Error(data.message || "No se pudo guardar");
        }
    } catch (err) {
        console.error("Error al guardar link:", err);
        Swal.fire('Error', 'Ocurrió un error al intentar guardar el enlace', 'error');
    }
}



// ----------------------------------------------------
// FORMAT FECHA HELPER
// ----------------------------------------------------
function formatFecha(dateString) {
    if (!dateString || dateString === '-' || dateString === 'No registrada' || dateString === 'Aún no finaliza') return dateString;
    const parts = dateString.split(' ');
    const datePart = parts[0];
    let timePart = parts[1] || '00:00:00';

    const dParts = datePart.split('-');
    if (dParts.length !== 3) return dateString;

    const tParts = timePart.split(':');
    const h = tParts[0] || '00';
    const m = tParts[1] || '00';
    const s = tParts[2] || '00';

    return `${dParts[2]}-${dParts[1]}-${dParts[0]} ${h}:${m}:${s}`;
}

async function cargarAuxiliares() {
    const select = document.getElementById('filtroAuxiliar');
    if (!select) return;

    try {
        const resp = await fetch('usuarios/get-all');
        const data = await resp.json();

        if (data.status === 'success' && Array.isArray(data.result)) {
            // Filtrar auxiliares (asumiendo que los que no son rol 1 o 2 son auxiliares)
            // El usuario dijo "filtralo por el rol_id", usualmente auxiliares son rol 3
            const auxiliares = data.result.filter(u => u.rol_id != 1 && u.rol_id != 2);

            auxiliares.forEach(aux => {
                const opt = document.createElement('option');
                opt.value = aux.id;
                opt.textContent = `${aux.nombres} ${aux.apellidos}`;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Error cargando auxiliares:', err);
    }
}