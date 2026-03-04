let allOrigenes = [];
let currentPage = 1;
const itemsPerPage = 8;

document.addEventListener('DOMContentLoaded', () => {
    cargarOrigenes();

    // Gestión del formulario
    const formOrigen = document.getElementById('formOrigen');
    if (formOrigen) {
        formOrigen.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(formOrigen);

            try {
                const response = await fetch('origen-contacto/save', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.status === 'success') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Éxito!',
                        text: data.message,
                        timer: 2000,
                        showConfirmButton: false,
                        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    });
                    closeModal('modalOrigen');
                    cargarOrigenes();
                } else {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Validación',
                        text: data.message,
                        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                    });
                }
            } catch (error) {
                console.error('Error al guardar origen:', error);
            }
        });
    }

    // Buscador
    const searchInput = document.getElementById('searchOrigen');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allOrigenes.filter(origen =>
                origen.nombre.toLowerCase().includes(term) ||
                origen.id.toString().includes(term)
            );
            currentPage = 1;
            renderTable(filtered);
        });
    }
});

/**
 * Carga los orígenes desde el servidor
 */
async function cargarOrigenes() {
    const listContainer = document.getElementById('listaOrigenes');
    if (!listContainer) return;

    try {
        const response = await fetch('origen-contacto/get-all');
        const data = await response.json();

        if (data.status === 'success' && data.result) {
            allOrigenes = data.result;
            renderTable(allOrigenes);
        } else {
            listContainer.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">${data.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Error cargando orígenes:', error);
        listContainer.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Error de conexión</td></tr>`;
    }
}

/**
 * Renderiza la tabla con paginación
 */
function renderTable(dataToRender) {
    const listContainer = document.getElementById('listaOrigenes');
    const infoContainer = document.getElementById('paginationInfo');
    const controlsContainer = document.getElementById('paginationControls');

    if (!listContainer) return;

    const totalItems = dataToRender.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Ajustar página actual si es necesario
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = dataToRender.slice(start, end);

    let html = '';
    if (paginatedItems.length === 0) {
        html = `
            <tr>
                <td colspan="4" class="px-6 py-12 text-center text-slate-400">
                    No se encontraron registros
                </td>
            </tr>
        `;
    } else {
        paginatedItems.forEach(origen => {
            const statusClass = (origen.estado === 't' || origen.estado === '1') ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10' : 'bg-slate-100 text-slate-600 dark:bg-slate-500/10';
            const statusText = (origen.estado === 't' || origen.estado === '1') ? 'Activo' : 'Inactivo';

            html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td class="px-6 py-4 text-xs font-bold text-slate-400">#${origen.id}</td>
                    <td class="px-6 py-4">
                        <span class="text-sm font-bold text-slate-900 dark:text-white capitalize">${origen.nombre.toLowerCase()}</span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${statusClass} uppercase">
                            ${statusText}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end gap-1">
                            <button onclick="editarOrigen(${JSON.stringify(origen).replace(/"/g, '&quot;')})" 
                                class="p-2 rounded-lg hover:bg-primary/10 text-slate-500 hover:text-primary transition-colors" title="Editar">
                                <span class="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                            <button onclick="eliminarOrigen(${origen.id})" 
                                class="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-500 transition-colors" title="Eliminar">
                                <span class="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    listContainer.innerHTML = html;

    // Actualizar info de paginación
    const currentCount = paginatedItems.length;
    infoContainer.textContent = `Mostrando ${start + (currentCount > 0 ? 1 : 0)} - ${start + currentCount} de ${totalItems} orígenes`;

    // Renderizar controles de paginación
    renderControls(totalPages, dataToRender);
}

/**
 * Renderiza los botones de paginación
 */
function renderControls(totalPages, dataToRender) {
    const controlsContainer = document.getElementById('paginationControls');
    if (!controlsContainer) return;

    let html = '';

    // Botón anterior
    html += `
        <button onclick="changePage(${currentPage - 1}, ${JSON.stringify(dataToRender).replace(/"/g, '&quot;')})" 
            ${currentPage === 1 ? 'disabled opacity-50' : ''}
            class="size-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary transition-all">
            <span class="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
    `;

    // Páginas (limitar a 5 para no llenar)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        html += `
            <button onclick="changePage(${i}, ${JSON.stringify(dataToRender).replace(/"/g, '&quot;')})" 
                class="size-9 rounded-xl flex items-center justify-center transition-all text-xs font-bold ${currentPage === i ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}">
                ${i}
            </button>
        `;
    }

    // Botón siguiente
    html += `
        <button onclick="changePage(${currentPage + 1}, ${JSON.stringify(dataToRender).replace(/"/g, '&quot;')})" 
            ${currentPage === totalPages || totalPages === 0 ? 'disabled opacity-50' : ''}
            class="size-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary transition-all">
            <span class="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
    `;

    controlsContainer.innerHTML = html;
}

/**
 * Cambia la página actual
 */
window.changePage = function (page, dataToRender) {
    const totalPages = Math.ceil(dataToRender.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable(dataToRender);
}

/**
 * Abre el modal para crear o editar
 */
function abrirModalOrigen(origen = null) {
    const form = document.getElementById('formOrigen');
    const inputId = document.getElementById('origenId');
    const inputNombre = document.getElementById('name_origen');
    const title = document.getElementById('modalTitle');

    if (origen) {
        title.textContent = 'Editar Origen';
        inputId.value = origen.id;
        inputNombre.value = origen.nombre;
    } else {
        form.reset();
        title.textContent = 'Nuevo Origen';
        inputId.value = '0';
    }

    openModal('modalOrigen');
}

/**
 * Alias para compatibilidad con el onclick del botón "Nuevo"
 */
function editarOrigen(origen) {
    abrirModalOrigen(origen);
}

/**
 * Elimina un origen
 */
function eliminarOrigen(id) {
    Swal.fire({
        title: '¿Estás seguro?',
        text: "Esta acción no se puede deshacer",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
        color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch(`origen-contacto/delete/${id}`);
                const data = await response.json();

                if (data.status === 'success') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Eliminado',
                        text: data.message,
                        timer: 1500,
                        showConfirmButton: false
                    });
                    cargarOrigenes();
                } else {
                    Swal.fire('Error', data.message, 'error');
                }
            } catch (error) {
                console.error('Error al eliminar:', error);
            }
        }
    });
}
