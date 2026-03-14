document.addEventListener('DOMContentLoaded', () => {
    cargarModulos();
    cargarModulosPadre();

    const formModulo = document.getElementById('formModulo');
    if (formModulo) {
        formModulo.addEventListener('submit', guardarModulo);
    }

    const searchModulo = document.getElementById('searchModulo');
    if (searchModulo) {
        searchModulo.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            filtrarModulos(term);
        });
    }
});

let allModulos = [];

async function cargarModulos() {
    const tbody = document.getElementById('listaModulos');
    if (!tbody) return;

    try {
        const resp = await fetch('modulos/get-all');
        const data = await resp.json();

        if (data.status === 'success') {
            allModulos = data.result || [];
            renderizarModulos(allModulos);
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-500">Error al cargar datos</td></tr>`;
        }
    } catch (error) {
        console.error('Error:', error);
        // Fallback for demo if no backend yet
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 italic">No se pudieron cargar los módulos (API no disponible)</td></tr>`;
    }
}

function renderizarModulos(modulos) {
    const tbody = document.getElementById('listaModulos');
    if (modulos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 italic">No hay módulos registrados</td></tr>`;
        return;
    }

    let html = '';
    modulos.forEach(m => {
        html += `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
            <td class="px-6 py-4 text-sm font-bold text-slate-400">${m.orden || 0}</td>
            <td class="px-6 py-4">
                <div class="flex flex-col">
                    <span class="text-sm font-bold text-slate-900 dark:text-white">${m.modulo}</span>
                    <span class="text-[10px] text-slate-400 uppercase tracking-widest">${m.idpadre == 0 ? 'Principal' : 'Submódulo'}</span>
                </div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">${m.url || '—'}</td>
            <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary text-[20px]">${m.icono || 'extension'}</span>
                    <span class="text-xs text-slate-400 font-mono">${m.icono || '—'}</span>
                </div>
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500">
                    ${m.modulo || (m.idpadre == 0 ? 'Ninguno' : '#' + m.idpadre)}
                </span>
            </td>
            <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editarModulo(${m.id})" class="p-2 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onclick="eliminarModulo(${m.id})" class="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;

    const info = document.getElementById('paginationInfo');
    if (info) info.textContent = `Mostrando ${modulos.length} módulo${modulos.length !== 1 ? 's' : ''}`;
}

async function cargarModulosPadre() {
    const select = document.getElementById('id_padre');
    if (!select) return;

    try {
        const resp = await fetch('modulos/get-padres');
        const data = await resp.json();

        if (data.status === 'success' && data.result) {
            // Limpiar excepto el primero
            select.innerHTML = '<option value="0">Ninguno (Módulo Principal)</option>';
            data.result.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.modulo;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error cargando módulos padre:', e);
    }
}

function abrirModalModulo() {
    const form = document.getElementById('formModulo');
    form.reset();
    document.getElementById('moduloId').value = '0';
    document.getElementById('modalTitle').textContent = 'Nuevo Módulo';

    if (typeof openModal === 'function') {
        openModal('modalModulo');
    }
}

async function guardarModulo(e) {
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

        const resp = await fetch('modulos/save', {
            method: 'POST',
            body: formData
        });

        const data = await resp.json();

        if (data.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: '¡Éxito!',
                text: 'El módulo se ha guardado correctamente.',
                timer: 1500,
                showConfirmButton: false,
                background: isDark ? '#1e293b' : '#fff',
                color: isDark ? '#fff' : '#545454'
            });

            if (typeof closeModal === 'function') {
                closeModal('modalModulo');
            }
            cargarModulos();
            cargarModulosPadre(); // Refrescar lista de padres
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.message || 'No se pudo guardar el módulo',
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

function editarModulo(id) {
    const modulo = allModulos.find(m => m.id == id);
    if (!modulo) return;

    document.getElementById('moduloId').value = modulo.id;
    document.getElementById('nombre').value = modulo.nombre;
    document.getElementById('url').value = modulo.url || '';
    document.getElementById('icono').value = modulo.icono || '';
    document.getElementById('id_padre').value = modulo.id_padre || 0;
    document.getElementById('orden').value = modulo.orden || 1;

    document.getElementById('modalTitle').textContent = 'Editar Módulo';

    if (typeof openModal === 'function') {
        openModal('modalModulo');
    }
}

async function eliminarModulo(id) {
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
            const resp = await fetch(`modulos/delete/${id}`);
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
                cargarModulos();
                cargarModulosPadre();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }
}


function filtrarModulos(term) {
    const filtered = allModulos.filter(m =>
        m.nombre.toLowerCase().includes(term) ||
        (m.url && m.url.toLowerCase().includes(term))
    );
    renderizarModulos(filtered);
}

function actualizarInterfazPadre(esPadre) {
    const container = document.getElementById('container_id_padre');
    const select = document.getElementById('id_padre');
    if (!container || !select) return;

    if (esPadre == '1') {
        // Bloquear visualmente pero no usando el atributo 'disabled'
        container.classList.add('opacity-40', 'pointer-events-none', 'grayscale-[0.5]');
        select.value = '0'; // Forzar a 'Ninguno' si es padre
    } else {
        // Restaurar estado normal
        container.classList.remove('opacity-40', 'pointer-events-none', 'grayscale-[0.5]');
    }
}
