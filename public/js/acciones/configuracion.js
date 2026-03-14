document.addEventListener('DOMContentLoaded', () => {
    cargarConfiguracionModuloAcciones();

    const searchConfig = document.getElementById('searchConfig');
    if (searchConfig) {
        searchConfig.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            filtrarModulosConfig(term);
        });
    }

    const formConfig = document.getElementById('formConfigAcciones');
    if (formConfig) {
        formConfig.addEventListener('submit', guardarConfiguracion);
    }
});

let modulosConfig = [];
let accionesCatalogo = [];
let moduloSeleccionado = null;

async function cargarConfiguracionModuloAcciones() {
    const tbody = document.getElementById('listaConfiguracion');
    if (!tbody) return;

    try {
        // Cargar módulos y catálogo de acciones en paralelo
        const [respModulos, respAcciones] = await Promise.all([
            fetch('modulos/get-all'),
            fetch('acciones/get-all')
        ]);

        const dataModulos = await respModulos.json();
        const dataAcciones = await respAcciones.json();

        if (dataModulos.status === 'success') {
            modulosConfig = dataModulos.result || [];
            accionesCatalogo = dataAcciones.result || [];
            renderizarTablaConfiguracion(modulosConfig);
        } else {
            tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-red-500">Error al cargar datos</td></tr>`;
        }
    } catch (error) {
        console.error('Error:', error);
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-slate-400 italic">No se pudo cargar la configuración</td></tr>`;
    }
}

function renderizarTablaConfiguracion(modulos) {
    const tbody = document.getElementById('listaConfiguracion');
    if (modulos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-slate-400 italic">No se encontraron módulos</td></tr>`;
        return;
    }

    // Organizar: Padres primero, luego sus hijos inmediatamente debajo
    const padres = modulos.filter(m => m.idpadre == 0).sort((a, b) => (a.orden || 0) - (b.orden || 0));

    let html = '';
    padres.forEach(p => {
        // Renderizar Padre (Sin botón de configurar)
        html += `
        <tr class="bg-slate-50/50 dark:bg-slate-800/20 border-l-4 border-slate-300 dark:border-slate-700">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-9 rounded-xl bg-white dark:bg-neutral-dark flex items-center justify-center text-slate-400 shadow-sm">
                        <span class="material-symbols-outlined text-[18px]">${p.icono || 'folder'}</span>
                    </div>
                    <span class="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">${p.modulo}</span>
                </div>
            </td>
            <td class="px-6 py-4"><span class="text-[11px] text-slate-400 font-medium">Módulo Raíz</span></td>
            <td class="px-6 py-4 text-center">—</td>
            <td class="px-6 py-4 text-right">
                <span class="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">No configurable</span>
            </td>
        </tr>`;

        // Buscar e hijos de este padre
        const hijos = modulos.filter(h => h.idpadre == p.id).sort((a, b) => (a.orden || 0) - (b.orden || 0));

        hijos.forEach(h => {
            const accionesAsignadas = h.acciones_habilitadas || [];
            html += `
            <tr class="hover:bg-primary/5 transition-colors group">
                <td class="px-6 py-4 pl-12">
                    <div class="flex items-center gap-3">
                        <div class="size-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors border border-slate-100 dark:border-slate-700">
                            <span class="material-symbols-outlined text-[16px]">${h.icono || 'subdirectory_arrow_right'}</span>
                        </div>
                        <span class="text-sm font-bold text-slate-700 dark:text-slate-300">${h.modulo}</span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <code class="text-[10px] px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-slate-400 font-mono">${h.url || '#'}</code>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-wrap gap-1">
                        ${accionesAsignadas.length > 0
                    ? accionesAsignadas.map(a => `<span class="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-black border border-primary/10 uppercase">${a.nombre_accion}</span>`).join('')
                    : `<span class="text-[10px] text-slate-400 italic">Sin acciones</span>`
                }
                    </div>
                </td>
                <td class="px-6 py-4 text-right">
                    <button onclick="configurarModulo(${h.id})" class="h-9 px-4 flex items-center gap-2 bg-white dark:bg-neutral-dark border border-slate-200 dark:border-slate-700 text-primary hover:border-primary rounded-xl text-xs font-bold transition-all ml-auto shadow-sm">
                        <span class="material-symbols-outlined text-[16px]">tune</span>
                        Gestionar
                    </button>
                </td>
            </tr>`;
        });
    });

    tbody.innerHTML = html;
}

function filtrarModulosConfig(term) {
    const filtered = modulosConfig.filter(m =>
        m.modulo.toLowerCase().includes(term) ||
        (m.url && m.url.toLowerCase().includes(term))
    );
    renderizarTablaConfiguracion(filtered);
}

async function configurarModulo(id) {
    moduloSeleccionado = modulosConfig.find(m => m.id == id);
    if (!moduloSeleccionado) return;

    // Actualizar Header del Modal
    document.getElementById('moduloNombreTitle').textContent = moduloSeleccionado.modulo;
    document.getElementById('moduloIconoTitle').textContent = moduloSeleccionado.icono || 'widgets';

    // Rellenar ID visual e input oculto
    const badgeId = document.getElementById('moduloIdBadge');
    if (badgeId) {
        badgeId.textContent = `ID#${moduloSeleccionado.id}`;
        badgeId.classList.remove('hidden');
    }
    const inputId = document.getElementById('moduloIdModal');
    if (inputId) inputId.value = moduloSeleccionado.id;

    // Generar Grid de Acciones (loading state)
    const grid = document.getElementById('gridAcciones');
    grid.innerHTML = `
        <div class="col-span-full py-10 text-center text-slate-400 flex flex-col items-center gap-2">
            <span class="material-symbols-outlined animate-spin">sync</span>
            <span class="text-xs font-bold uppercase tracking-widest">Obteniendo acciones...</span>
        </div>`;

    abrirModalConfig();

    try {
        const resp = await fetch(`acciones/get-by-modulo/${id}`);
        const data = await resp.json();

        grid.innerHTML = ''; // Limpiar loader

        // Verificamos "success" o código HTTP 200 basándonos en tu API
        if (data.status === 'success' || data.status == 200) {
            const accionesServer = data.result || [];
            
            if (accionesServer.length === 0) {
                grid.innerHTML = `<div class="col-span-full py-6 text-center text-slate-400 text-sm italic">No hay acciones disponibles para configurar.</div>`;
                return;
            }

            accionesServer.forEach(accion => {
                const isSelected = accion.seleccionado;

                const cardAction = `
                <label class="relative group cursor-pointer">
                    <input type="checkbox" value="${accion.id}" name="acciones[]" class="sr-only peer" ${isSelected ? 'checked' : ''}>
                    <div class="flex items-center gap-3 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-background-dark transition-all duration-300
                                peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:shadow-sm">
                        
                        <div class="size-6 rounded-lg border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all
                                    peer-checked:border-primary peer-checked:bg-primary text-white">
                            <span class="material-symbols-outlined text-[16px] scale-0 transition-transform peer-checked:scale-100">check</span>
                        </div>
                        
                        <div class="flex flex-col">
                            <span class="text-[13px] font-bold text-slate-700 dark:text-slate-300 transition-colors peer-checked:text-primary capitalize">
                                ${accion.nombre_accion}
                            </span>
                            <span class="text-[10px] text-slate-400 font-medium">Acción del sistema</span>
                        </div>
                    </div>
                </label>`;
                
                grid.insertAdjacentHTML('beforeend', cardAction);
            });
        } else {
            grid.innerHTML = `<div class="col-span-full py-6 text-center text-red-500 text-sm">Error: ${data.message || 'No se pudieron cargar las acciones'}</div>`;
        }
    } catch (error) {
        console.error('Error al obtener acciones por módulo:', error);
        grid.innerHTML = `<div class="col-span-full py-6 text-center text-red-500 text-sm">Error de conexión al obtener acciones del módulo.</div>`;
    }
}

function abrirModalConfig() {
    const modal = document.getElementById('modalConfigAcciones');
    const backdrop = document.getElementById('modalBackdropCfg');
    const content = document.getElementById('modalContentCfg');

    modal.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.replace('opacity-0', 'opacity-100');
        content.classList.replace('scale-95', 'scale-100');
        content.classList.replace('opacity-0', 'opacity-100');
    }, 10);
}

function closeModal(id) {
    const modal = document.getElementById(id);
    const backdrop = modal.querySelector('[id^="modalBackdrop"]');
    const content = modal.querySelector('[id^="modalContent"]');

    if (backdrop) backdrop.classList.replace('opacity-100', 'opacity-0');
    if (content) {
        content.classList.replace('scale-100', 'scale-95');
        content.classList.replace('opacity-100', 'opacity-0');
    }

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

async function guardarConfiguracion(e) {
    if (e) e.preventDefault();

    const hiddenId = document.getElementById('moduloIdModal').value;
    if (!hiddenId) return;

    const checkboxes = document.querySelectorAll('#gridAcciones input[type="checkbox"]:checked');
    const accionesIds = Array.from(checkboxes).map(cb => cb.value);

    const isDark = document.documentElement.classList.contains('dark');

    try {
        Swal.fire({
            title: 'Actualizando...',
            didOpen: () => Swal.showLoading(),
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#fff' : '#545454'
        });

        const formData = new FormData();
        formData.append('id', hiddenId); // Enviando el id del módulo
        accionesIds.forEach(id => formData.append('acciones[]', id));

        const resp = await fetch('acciones/save-config', {
            method: 'POST',
            body: formData
        });

        const data = await resp.json();

        if (data.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: 'Configuración Guardada',
                text: `Se han actualizado las acciones para el módulo ${moduloSeleccionado.modulo}`,
                timer: 2000,
                showConfirmButton: false,
                background: isDark ? '#1e293b' : '#fff',
                color: isDark ? '#fff' : '#545454'
            });
            closeModal('modalConfigAcciones');
            cargarConfiguracionModuloAcciones(); // Recargar para reflejar cambios
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.message || 'No se pudo guardar la configuración.',
                background: isDark ? '#1e293b' : '#fff',
                color: isDark ? '#fff' : '#545454'
            });
        }
    } catch (e) {
        console.error(e);
        Swal.fire({
            icon: 'error',
            title: 'Error de Servidor',
            text: 'Ha ocurrido un problema al comunicarse con el servidor.',
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#fff' : '#545454'
        });
    }
}
