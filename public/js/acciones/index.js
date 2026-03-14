document.addEventListener('DOMContentLoaded', () => {
    cargarAcciones();

    const formAccion = document.getElementById('formAccion');
    if (formAccion) {
        formAccion.addEventListener('submit', guardarAccion);
    }

    const searchAccion = document.getElementById('searchAccion');
    if (searchAccion) {
        searchAccion.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            filtrarAcciones(term);
        });
    }
});

let allAcciones = [];

async function cargarAcciones() {
    const tbody = document.getElementById('listaAcciones');
    if (!tbody) return;

    try {
        const resp = await fetch('acciones/get-all');
        const data = await resp.json();

        if (data.status === 'success') {
            allAcciones = data.result || [];
            renderizarAcciones(allAcciones);
        } else {
            tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-10 text-center text-red-500">Error al cargar datos</td></tr>`;
        }
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-10 text-center text-slate-400 italic">No se pudieron cargar las acciones</td></tr>`;
    }
}

function renderizarAcciones(acciones) {
    const tbody = document.getElementById('listaAcciones');
    if (acciones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="px-6 py-10 text-center text-slate-400 italic">No hay acciones registradas</td></tr>`;
        return;
    }

    let html = '';
    acciones.forEach(a => {
        html += `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
            <td class="px-6 py-4 text-sm font-bold text-slate-400">#${a.id}</td>
            <td class="px-6 py-4">
                <span class="text-sm font-bold text-slate-900 dark:text-white">${a.nombre_accion}</span>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editarAccion(${a.id})" class="p-2 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onclick="eliminarAccion(${a.id})" class="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;

    const info = document.getElementById('paginationInfo');
    if (info) info.textContent = `Mostrando ${acciones.length} acción${acciones.length !== 1 ? 'es' : ''}`;
}

function abrirModalAccion() {
    const form = document.getElementById('formAccion');
    form.reset();
    document.getElementById('accionId').value = '0';
    document.getElementById('modalTitle').textContent = 'Nueva Acción';

    if (typeof openModal === 'function') {
        openModal('modalAccion');
    } else {
        document.getElementById('modalAccion').classList.remove('hidden');
        setTimeout(() => {
            document.getElementById('modalBackdrop').classList.replace('opacity-0', 'opacity-100');
            document.getElementById('modalContent').classList.replace('scale-95', 'scale-100');
            document.getElementById('modalContent').classList.replace('opacity-0', 'opacity-100');
        }, 10);
    }
}

async function guardarAccion(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const isDark = document.documentElement.classList.contains('dark');

    try {
        Swal.fire({
            title: 'Guardando...',
            didOpen: () => Swal.showLoading(),
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#fff' : '#545454'
        });

        const resp = await fetch('acciones/save', {
            method: 'POST',
            body: formData
        });

        const data = await resp.json();

        if (data.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: 'La acción se ha guardado correctamente.',
                timer: 1500,
                showConfirmButton: false,
                background: isDark ? '#1e293b' : '#fff',
                color: isDark ? '#fff' : '#545454'
            });

            closeModal('modalAccion');
            cargarAcciones();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.message || 'No se pudo guardar la acción',
                background: isDark ? '#1e293b' : '#fff',
                color: isDark ? '#fff' : '#545454'
            });
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error de servidor',
            text: 'No se pudo conectar con el servidor',
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#fff' : '#545454'
        });
    }
}

function editarAccion(id) {
    const accion = allAcciones.find(a => a.id == id);
    if (!accion) return;

    document.getElementById('accionId').value = accion.id;
    document.getElementById('nombreAccion').value = accion.nombre;

    document.getElementById('modalTitle').textContent = 'Editar Acción';

    abrirModalAccion(); // Reutiliza la función para mostrar el modal
}

async function eliminarAccion(id) {
    const isDark = document.documentElement.classList.contains('dark');
    const result = await Swal.fire({
        title: '¿Estás seguro?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#135bec',
        cancelButtonColor: '#ef4444',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: isDark ? '#1e293b' : '#fff',
        color: isDark ? '#fff' : '#545454'
    });

    if (result.isConfirmed) {
        try {
            const resp = await fetch(`acciones/delete/${id}`);
            const data = await resp.json();

            if (data.status === 'success') {
                Swal.fire({
                    icon: 'success',
                    title: 'Eliminado',
                    timer: 1500,
                    showConfirmButton: false,
                    background: isDark ? '#1e293b' : '#fff',
                    color: isDark ? '#fff' : '#545454'
                });
                cargarAcciones();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

function filtrarAcciones(term) {
    const filtered = allAcciones.filter(a =>
        a.nombre.toLowerCase().includes(term)
    );
    renderizarAcciones(filtered);
}

// Global functions if not present
if (typeof closeModal !== 'function') {
    window.closeModal = function (id) {
        const modal = document.getElementById(id);
        const backdrop = modal.querySelector('#modalBackdrop');
        const content = modal.querySelector('#modalContent');

        if (backdrop) backdrop.classList.replace('opacity-100', 'opacity-0');
        if (content) {
            content.classList.replace('scale-100', 'scale-95');
            content.classList.replace('opacity-100', 'opacity-0');
        }

        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    }
}
