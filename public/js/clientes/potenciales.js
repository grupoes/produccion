/**
 * Agrega dinámicamente campos de contacto en el modal
 */

/**
 * Agrega dinámicamente campos de contacto en el modal
 */
function agregarContacto() {
    const contenedor = document.getElementById('contenedorContactos');
    const nuevoId = Date.now();

    const div = document.createElement('div');
    div.className = 'contacto-item grid grid-cols-12 gap-2 p-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-800 relative group animate-in fade-in slide-in-from-top-2 duration-300';
    div.id = `contacto-${nuevoId}`;

    div.innerHTML = `
        <div class="col-span-12 md:col-span-4 leading-none">
            <input name="nombres[]" placeholder="Nombre" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
        </div>
        <div class="col-span-12 md:col-span-4 leading-none">
            <input name="apellidos[]" placeholder="Apellidos" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
        </div>
        <div class="col-span-10 md:col-span-3 leading-none">
            <input name="celular[]" placeholder="Celular" class="w-full bg-white dark:bg-background-dark border-none rounded-lg px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary shadow-sm" type="text" />
        </div>
        <div class="col-span-2 md:col-span-1 flex items-center justify-center">
            <button type="button" onclick="eliminarContacto('${nuevoId}')" class="text-red-400 hover:text-red-500 transition-colors p-1">
                <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
        </div>
    `;

    contenedor.appendChild(div);

    // Scroll al final del contenedor
    contenedor.scrollTo({
        top: contenedor.scrollHeight,
        behavior: 'smooth'
    });
}

/**
 * Elimina un campo de contacto específico
 */
function eliminarContacto(id) {
    const item = document.getElementById(`contacto-${id}`);
    if (item) {
        item.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            item.remove();
        }, 300);
    }
}

// Inicialización de Quill Editor
let quill;
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('editorApuntes')) {
        // Aseguramos Quill global para el plugin
        window.Quill = Quill;

        // Detectar constructor (ImageResize se expone como global por el script unpkg)
        let IRConstructor = window.ImageResize || (typeof ImageResize !== 'undefined' ? ImageResize : null);

        if (IRConstructor && IRConstructor.default) {
            IRConstructor = IRConstructor.default;
        }

        const quillModules = {
            toolbar: [
                ['bold', 'italic', 'underline'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['image', 'link'],
                ['clean']
            ]
        };

        if (IRConstructor) {
            try {
                // Registrar solo si no está registrado
                if (!Quill.import('modules/imageResize')) {
                    Quill.register('modules/imageResize', IRConstructor);
                }

                // Configurar el módulo completo
                quillModules.imageResize = {
                    displaySize: true,
                    modules: ['Resize', 'DisplaySize', 'Toolbar']
                };
                console.log('Módulo ImageResize detectado y configurado.');
            } catch (e) {
                console.warn('Error al configurar ImageResize:', e);
            }
        } else {
            console.error('No se detectó el script de redimensionamiento de imagen.');
        }

        // Crear instancia del editor
        quill = new Quill('#editorApuntes', {
            theme: 'snow',
            placeholder: 'Escriba aquí los detalles adicionales o pegue una imagen...',
            modules: quillModules
        });
    }
});

// Gestión del envío del formulario
document.addEventListener('submit', async (e) => {
    if (e.target.id === 'formNuevoProspecto') {
        e.preventDefault();

        // Obtener contenido de Quill si existe, y evitar enviar tags vacíos si no hay texto
        let apuntesContent = quill ? quill.root.innerHTML : '';
        if (apuntesContent === '<p><br></p>') apuntesContent = '';

        const formData = new FormData(e.target);
        formData.append('contenido', apuntesContent);

        try {
            const response = await fetch('prospectos/crear', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (data.status === 'success') {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: '¡Éxito!',
                        text: 'Prospecto guardado correctamente',
                        icon: 'success',
                        confirmButtonColor: '#3085d6',
                        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#545454'
                    }).then(() => {
                        closeModal('modalNuevoProspecto');
                        if (quill) quill.setContents([]);
                        e.target.reset();
                        // Refrescar tabla si se implementa cargarProspectos()
                        if (typeof cargarProspectos === 'function') {
                            cargarProspectos();
                        } else {
                            location.reload();
                        }
                    });
                } else {
                    alert('Prospecto guardado correctamente');
                    closeModal('modalNuevoProspecto');
                    location.reload();
                }
            } else {
                let errorMsg = data.message || 'Error al guardar el prospecto';
                if (typeof data.message === 'object') {
                    errorMsg = Object.values(data.message).join('\n');
                }
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Error',
                        text: errorMsg,
                        icon: 'error',
                        confirmButtonColor: '#3085d6',
                        background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                        color: document.documentElement.classList.contains('dark') ? '#fff' : '#545454'
                    });
                } else {
                    alert('Error: ' + errorMsg);
                }
            }
        } catch (error) {
            console.error('Error enviando formulario:', error);
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Error de servidor',
                    text: 'Se produjo un problema al intentar guardar los datos.',
                    icon: 'error',
                    confirmButtonColor: '#3085d6',
                    background: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#545454'
                });
            } else {
                alert('Ocurrió un error en el servidor o problema de red.');
            }
        }
    }
});

// Lógica para los Buscadores Interactivos (Search Selects)
document.addEventListener('DOMContentLoaded', () => {
    /**
     * Configura un buscador interactivo para un select personalizado
     */
    function setupSearchSelect(inputId, resultsId, optionsClass, hiddenId, containerId) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        const options = document.querySelectorAll(optionsClass);
        const hidden = document.getElementById(hiddenId);

        if (input && results) {
            // Mostrar resultados al enfocar
            input.addEventListener('focus', () => {
                results.classList.remove('hidden');
            });

            // Filtrar mientras se escribe
            input.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                let hasResults = false;

                options.forEach(option => {
                    const text = option.textContent.toLowerCase();
                    if (text.includes(term)) {
                        option.classList.remove('hidden');
                        hasResults = true;
                    } else {
                        option.classList.add('hidden');
                    }
                });

                // Si no hay resultados y hay texto, ocultar. Si no hay texto, mostrar todo.
                results.classList.toggle('hidden', !hasResults && term !== '');
            });

            // Seleccionar una opción
            options.forEach(option => {
                option.addEventListener('click', () => {
                    input.value = option.textContent.trim();
                    if (hidden) hidden.value = option.dataset.value || option.textContent.trim();
                    results.classList.add('hidden');
                });
            });

            // Cerrar al hacer clic fuera
            document.addEventListener('click', (e) => {
                const container = document.getElementById(containerId);
                if (container && !container.contains(e.target)) {
                    results.classList.add('hidden');
                }
            });
        }
    }

    // Inicializar buscadores
    setupSearchSelect('carreraSearchInput', 'carreraResults', '.carrera-option', 'selectedCarreraId', 'searchCarreraContainer');

    // Escuchar cambios en el selector de roles
    const selectRol = document.getElementById('rol_asignado');
    if (selectRol) {
        selectRol.addEventListener('change', (e) => {
            const rolId = e.target.value;
            if (rolId) {
                cargarTareasYUsuariosPorRol(rolId);
            } else {
                // Limpiar si no hay rol seleccionado
                tareasDelRolActual = [];
                const taskList = document.getElementById('taskResultsList');
                if (taskList) taskList.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Seleccione un rol...</div>';

                const selectUser = document.getElementById('personal_responsable');
                if (selectUser) selectUser.innerHTML = '<option value="">Asignar personal...</option>';
            }
        });
    }

    // Escuchar cambios en el selector de tipo de tarea
    const selectTipoTarea = document.getElementById('tipo_tarea');
    if (selectTipoTarea) {
        selectTipoTarea.addEventListener('change', () => {
            renderizarTareasPorTipo();
        });
    }

    // Cargar Datos Dinámicos
    cargarOrigenesContacto();
    cargarRoles();
    cargarUniversidades();
});

let tareasDelRolActual = [];

/**
 * Carga las tareas y usuarios asociados a un rol específico
 */
async function cargarTareasYUsuariosPorRol(rolId) {
    const taskList = document.getElementById('taskResultsList');
    const selectUser = document.getElementById('personal_responsable');

    if (!taskList || !selectUser) return;

    taskList.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Cargando tareas...</div>';
    selectUser.innerHTML = '<option value="">Cargando personal...</option>';

    try {
        const response = await fetch(`tareas/get-by-rol/${rolId}`);
        const data = await response.json();

        if (data.status === 'success' && data.result) {
            // Llenar Usuarios (Personal Responsable)
            let htmlUsers = '<option value="">Asignar personal...</option>';
            if (data.result.users && data.result.users.length > 0) {
                data.result.users.forEach(user => {
                    htmlUsers += `<option value="${user.id}">${user.nombres} ${user.apellidos}</option>`;
                });
            } else {
                htmlUsers = '<option value="">Sin personal disponible</option>';
            }
            selectUser.innerHTML = htmlUsers;

            // Llenar Tareas
            if (data.result.tareas && data.result.tareas.length > 0) {
                tareasDelRolActual = data.result.tareas;
            } else {
                tareasDelRolActual = [];
            }
            renderizarTareasPorTipo();
        } else {
            taskList.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error al cargar tareas</div>';
            selectUser.innerHTML = '<option value="">Asignar personal...</option>';
        }
    } catch (error) {
        console.error('Error cargando tareas y usuarios:', error);
        taskList.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error de conexión</div>';
        selectUser.innerHTML = '<option value="">Asignar personal...</option>';
    }
}

/**
 * Renderiza las tareas filtrando por el tipo seleccionado
 */
function renderizarTareasPorTipo() {
    const taskList = document.getElementById('taskResultsList');
    const tipoSelect = document.getElementById('tipo_tarea');
    if (!taskList) return;

    const tipoFiltro = tipoSelect ? tipoSelect.value : "";

    // Filtrar tareas según la selección
    let tareasFiltradas = tareasDelRolActual;
    if (tipoFiltro !== "") {
        tareasFiltradas = tareasDelRolActual.filter(t => t.prioridad == tipoFiltro);
    }

    let htmlTasks = '';
    if (tareasFiltradas.length > 0) {
        tareasFiltradas.forEach(tarea => {
            htmlTasks += `
                <button type="button" class="task-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-value="${tarea.id}">
                    ${tarea.nombre}
                </button>`;
        });
        taskList.innerHTML = htmlTasks;

        // Reinicializar eventos del buscador de tareas eliminando el input existente para evitar duplicidad
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

/**
 * Carga los roles dinámicamente desde el servidor
 */
async function cargarRoles() {
    const selectRol = document.getElementById('rol_asignado');
    if (!selectRol) return;

    try {
        const response = await fetch('permisos/lista-roles');
        const data = await response.json();

        if (data.status === 'success' && data.result) {
            data.result.forEach(rol => {
                const option = document.createElement('option');
                option.value = rol.id;
                option.textContent = rol.nombre;
                selectRol.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error cargando roles:', error);
    }
}

/**
 * Carga los orígenes de contacto dinámicamente
 */
async function cargarOrigenesContacto() {
    const selectOrigen = document.getElementById('id_origen');
    if (!selectOrigen) return;

    try {
        const response = await fetch('origen-contacto/get-all');
        const data = await response.json();

        if (data.status === 'success' && data.result) {
            data.result.forEach(origen => {
                const option = document.createElement('option');
                option.value = origen.id;
                option.textContent = origen.nombre;
                selectOrigen.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error cargando orígenes de contacto:', error);
    }
}

/**
 * Obtiene las instituciones desde el servidor y las muestra en el buscador
 */
async function cargarUniversidades() {
    const listContainer = document.getElementById('uniResultsList');
    if (!listContainer) return;

    try {
        const response = await fetch('instituciones/get-all');
        const data = await response.json();

        if (data.status === 'success' && data.result) {
            let html = '';
            data.result.forEach(uni => {
                const label = `${uni.nombre} - ${uni.abreviatura}`;
                html += `
                    <button type="button" 
                        class="uni-option w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" 
                        data-value="${uni.id}">
                        ${label}
                    </button>`;
            });

            listContainer.innerHTML = html;

            // Una vez cargadas, configurar el comportamiento del buscador de universidades
            // Nota: usamos un pequeño timeout para asegurar que el DOM se haya actualizado
            setTimeout(() => {
                setupSearchSelectStatic('uniSearchInput', 'uniResults', '.uni-option', 'selectedUniId', 'searchUniContainer');
            }, 0);

        } else {
            listContainer.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error al cargar universidades</div>';
        }
    } catch (error) {
        console.error('Error cargando universidades:', error);
        listContainer.innerHTML = '<div class="p-3 text-center text-xs text-red-500">Error de conexión</div>';
    }
}

/**
 * Versión estática de setupSearchSelect para elementos dinámicos
 */
function setupSearchSelectStatic(inputId, resultsId, optionsClass, hiddenId, containerId) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);
    const options = document.querySelectorAll(optionsClass);
    const hidden = document.getElementById(hiddenId);

    if (input && results) {
        // Mostrar resultados al enfocar
        input.addEventListener('focus', () => {
            results.classList.remove('hidden');
        });

        // Filtrar mientras se escribe
        input.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            let hasResults = false;

            options.forEach(option => {
                const text = option.textContent.toLowerCase();
                if (text.includes(term)) {
                    option.classList.remove('hidden');
                    hasResults = true;
                } else {
                    option.classList.add('hidden');
                }
            });

            results.classList.toggle('hidden', !hasResults && term !== '');
        });

        // Seleccionar una opción
        options.forEach(option => {
            option.onclick = null; // Limpiar previos
            option.onclick = () => {
                input.value = option.textContent.trim();
                if (hidden) hidden.value = option.dataset.value;
                results.classList.add('hidden');
            };
        });

        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            const container = document.getElementById(containerId);
            if (container && !container.contains(e.target)) {
                results.classList.add('hidden');
            }
        });
    }
}

// Cerrar modal al hacer click en el backdrop
document.addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') {
        const modal = e.target.closest('[id^="modal"]');
        if (modal) {
            closeModal(modal.id);
        }
    }
});
