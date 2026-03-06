function toggleSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const isMobile = window.innerWidth < 1024;

    if (isMobile) {
        sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('hidden');
        setTimeout(() => {
            backdrop.classList.toggle('opacity-0');
            backdrop.classList.toggle('opacity-100');
        }, 10);
    } else {
        sidebar.classList.toggle('sidebar-collapsed');
    }
}

function toggleSubmenu(button) {
    const moduleItem = button.closest('.module-item');
    const submenu = moduleItem.querySelector('.submenu');
    const chevron = button.querySelector('.material-symbols-outlined:last-child');

    // Toggle visibility
    const isHidden = submenu.classList.contains('hidden');

    // Close other submenus
    document.querySelectorAll('.submenu').forEach(s => {
        if (s !== submenu) {
            s.classList.add('hidden');
            const otherButton = s.previousElementSibling;
            const otherChevron = otherButton.querySelector('.material-symbols-outlined:last-child');
            if (otherChevron) otherChevron.style.transform = 'rotate(0deg)';
        }
    });

    if (isHidden) {
        submenu.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
        // Maintain primary color for button if needed
    } else {
        submenu.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

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

        // Fecha de hace 8 días
        const hace8Dias = new Date(hoy);
        hace8Dias.setDate(hoy.getDate() - 8);
        const strHace8Dias = hace8Dias.toISOString().split('T')[0];

        // Setear valores por defecto
        fechaInicio.value = strHace8Dias;
        fechaFin.value = strHoy;

        // Cargar por primera vez
        cargarDashboardCompleto();
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
});

let calendarInstance = null;
function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    if (calendarInstance) {
        calendarInstance.render();
        return;
    }

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
        events: async function (info, successCallback, failureCallback) {
            try {
                const resp = await fetch('horario/get-usuario');
                const data = await resp.json();

                if (data.status === 'success' || data.status === 200) {
                    const results = data.result || [];
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

    try {
        const formData = new FormData();
        formData.append('fecha_inicio', fInicio);
        formData.append('fecha_fin', fFin);
        formData.append('estado_progreso', estado);

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
                    const prioridadText = act.prioridad == '1' ? 'Alta' : (act.prioridad == '3' ? 'Baja' : 'Media');
                    const colorBadge = act.prioridad == '1' ? 'bg-red-500/10 text-red-500' : (act.prioridad == '3' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500');
                    const nombreUsuario = act.nombres && act.apellidos ? `${act.nombres} ${act.apellidos}` : 'Sin asignar';
                    const nombreTarea = act.nombre || 'Actividad sin nombre';

                    let fechaTxt = '-';
                    let tooltipFecha = 'Fecha';

                    if (estado === 'Pendiente' || estado === 'En Proceso' || estado === 'Finalizado') {
                        tooltipFecha = 'Fecha de Inicio';
                        fechaTxt = act.fecha_inicio ? formatFecha(act.fecha_inicio) : (act.fecha_contacto ? formatFecha(act.fecha_contacto) : '-');
                    } else {
                        tooltipFecha = 'Fecha de Contacto';
                        fechaTxt = act.fecha_contacto ? formatFecha(act.fecha_contacto) : '-';
                    }

                    const esFinalizado = estado === 'Finalizado';
                    html += `
                        <div ${esFinalizado ? '' : 'draggable="true"'} data-estado="${estado}" data-id="${act.id}" class="kanban-card bg-white dark:bg-background-dark/60 p-4 rounded-lg border border-primary/10 shadow-sm hover:border-primary/40 transition-all ${esFinalizado ? '' : 'cursor-grab active:cursor-grabbing'} relative">
                            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded ${colorBadge} mb-2 inline-block">${prioridadText}</span>
                            <h4 class="font-semibold text-sm mb-1 line-clamp-2" title="${nombreTarea}">${nombreTarea}</h4>
                            <div class="text-[11px] text-slate-500 mb-3">
                                <span class="block mb-0.5">Asignado por:</span>
                                <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 truncate" title="${nombreUsuario}">${nombreUsuario}</span>
                            </div>
                            <div class="flex justify-between items-center text-xs text-slate-400 mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                                <span class="flex items-center gap-1" title="${tooltipFecha}"><span class="material-symbols-outlined text-xs">calendar_today</span> <span class="truncate">${fechaTxt}</span></span>
                                <button type="button" onclick="verDetalleActividad('${act.id}')" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-400 hover:text-primary dark:hover:text-primary" title="Ver Detalles">
                                    <span class="material-symbols-outlined text-sm">visibility</span>
                                </button>
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

    // Mostramos Loader, ocultamos contenido
    const loader = document.getElementById('detalleLoader');
    const contenido = document.getElementById('detalleContenido');
    if (loader) loader.classList.remove('hidden');
    if (contenido) contenido.classList.add('hidden');

    try {
        const res = await fetch(`getActividadRow/${id}`);
        const data = await res.json();

        if (data.status === 'success' && data.result) {
            // El API debería devolver info en data.result o data.result[0] u objeto similar
            const det = Array.isArray(data.result) ? data.result[0] : (data.result.prospecto || data.result);

            if (!det) throw new Error("Datos no encontrados");

            // Rellenar Datos
            const pNombre = det.nombre || det.tarea_nombre || 'Actividad Sin Nombre';
            const detEstado = det.estado_progreso || 'Desconocido';

            // Prioridad
            let pColor = '';
            let pText = '';
            if (det.prioridad == '1') { pText = 'Alta'; pColor = 'bg-red-500/10 text-red-500'; }
            else if (det.prioridad == '3') { pText = 'Baja'; pColor = 'bg-emerald-500/10 text-emerald-500'; }
            else { pText = 'Media'; pColor = 'bg-blue-500/10 text-blue-500'; }

            // Responsable
            let responsable = 'Sin asignar';
            if (det.nombres || det.apellidos) {
                responsable = `${det.nombres || ''} ${det.apellidos || ''}`.trim();
            }

            // Prospecto/Cliente
            let prospectoAsociado = 'ND';
            if (det.prospecto_nombres || det.prospecto_apellidos) { // Adaptar esto dependiendo de lo que devuelva tu API internamente, si no devuelve nombre usar prospecto_id
                prospectoAsociado = `${det.prospecto_nombres || ''} ${det.prospecto_apellidos || ''}`.trim();
            } else if (det.prospecto_id) {
                prospectoAsociado = `Prospecto #${det.prospecto_id}`;
            }

            // Actualizar vista
            if (document.getElementById('detNombre')) document.getElementById('detNombre').textContent = pNombre;

            if (document.getElementById('detEstado')) {
                document.getElementById('detEstado').textContent = detEstado;
            }
            if (document.getElementById('detPrioridad')) {
                document.getElementById('detPrioridad').textContent = pText;
                document.getElementById('detPrioridad').className = `px-2 py-1 rounded font-medium ${pColor}`;
            }

            if (document.getElementById('detResponsable')) document.getElementById('detResponsable').textContent = responsable;
            if (document.getElementById('detProspectoInfo')) document.getElementById('detProspectoInfo').textContent = prospectoAsociado;

            // Fechas
            const fechaInicio = document.getElementById('detFechaInicio');
            if (fechaInicio) {
                fechaInicio.textContent = det.fecha_inicio ? formatFecha(det.fecha_inicio) : (det.fecha_contacto ? formatFecha(det.fecha_contacto) : 'No registrada');
            }

            const fechaFin = document.getElementById('detFechaFin');
            if (fechaFin) {
                fechaFin.textContent = det.fecha_fin ? formatFecha(det.fecha_fin) : 'Aún no finaliza';
            }

            // Ocultar Loader, Mostrar Contenido
            if (loader) loader.classList.add('hidden');
            if (contenido) contenido.classList.remove('hidden');

        } else {
            if (loader) loader.innerHTML = `<span class="text-sm text-red-500">Error: ${data.message || 'No se pudo cargar'}</span>`;
        }

    } catch (e) {
        console.error('Error fetching detalle actividad', e);
        if (loader) loader.innerHTML = '<span class="text-sm text-red-500">Error de comunicación.</span>';
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