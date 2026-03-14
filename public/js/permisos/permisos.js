const tabPerfiles = document.getElementById('tabPerfiles');
const tabUsuarios = document.getElementById('tabUsuarios');
const listaPerfiles = document.getElementById('listaPerfiles');
const listaUsuarios = document.getElementById('listaUsuarios');

// Tab Switching
tabPerfiles.addEventListener('click', () => {
    tabPerfiles.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-900', 'dark:text-white', 'shadow-sm');
    tabPerfiles.classList.remove('text-slate-500', 'dark:text-slate-400');
    tabUsuarios.classList.remove('bg-white', 'dark:bg-slate-700', 'text-slate-900', 'dark:text-white', 'shadow-sm');
    tabUsuarios.classList.add('text-slate-500', 'dark:text-slate-400');
    listaPerfiles.classList.remove('hidden');
    listaUsuarios.classList.add('hidden');
});

tabUsuarios.addEventListener('click', () => {
    tabUsuarios.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-900', 'dark:text-white', 'shadow-sm');
    tabUsuarios.classList.remove('text-slate-500', 'dark:text-slate-400');
    tabPerfiles.classList.remove('bg-white', 'dark:bg-slate-700', 'text-slate-900', 'dark:text-white', 'shadow-sm');
    tabPerfiles.classList.add('text-slate-500', 'dark:text-slate-400');
    listaUsuarios.classList.remove('hidden');
    listaPerfiles.classList.add('hidden');
});

// Item Selection (Profiles & Users)
function setupSelection(items, itemClass, activeProfileSpan = null) {
    items.forEach(item => {
        item.addEventListener('click', () => {
            selectItem(item, items, itemClass, activeProfileSpan);
        });
    });
}

function selectItem(item, allItems, itemClass, activeProfileSpan = null) {
    // Remove active state from all
    allItems.forEach(i => {
        i.classList.remove('bg-primary/10', 'border-primary/20');
        i.classList.add('border-transparent');

        const nameSpan = i.querySelector('.role-name, .user-name');
        if (nameSpan) {
            nameSpan.classList.remove('text-primary');
            if (itemClass === 'user-item' || itemClass === 'role-item') {
                nameSpan.classList.add('text-slate-900', 'dark:text-white');
            }
        }

        const icon = i.querySelector('.status-icon');
        if (icon) {
            icon.textContent = 'chevron_right';
            icon.classList.remove('text-primary', 'opacity-100');
            icon.classList.add('text-slate-400', 'opacity-0');
        }
    });

    // Set active state to clicked
    item.classList.add('bg-primary/10', 'border-primary/20');
    item.classList.remove('border-transparent');

    const nameSpan = item.querySelector('.role-name, .user-name');
    if (nameSpan) {
        nameSpan.classList.add('text-primary');
        nameSpan.classList.remove('text-slate-900', 'dark:text-white');

        // Update the header text if it's a profile
        if (activeProfileSpan && itemClass === 'role-item') {
            activeProfileSpan.textContent = nameSpan.textContent;
        }
    }

    const icon = item.querySelector('.status-icon');
    if (icon) {
        icon.textContent = 'check_circle';
        icon.classList.add('text-primary', 'opacity-100');
        icon.classList.remove('text-slate-400', 'opacity-0');
    }

    if (itemClass === 'role-item') {
        const idPerfil = item.getAttribute('data-id');
        if (idPerfil) cargarPermisosPorPerfil(idPerfil);
    }

    // Mobile: Show permissions view
    showPermissionsMobile();
}

async function cargarRoles() {
    const listaPerfiles = document.getElementById('listaPerfiles');
    const activeProfileHeader = document.getElementById('perfilActivoLabel');
    
    try {
        const resp = await fetch('permisos/lista-roles');
        const data = await resp.json();

        if (data.status === 'success' && data.result) {
            let html = '';
            data.result.forEach((role, index) => {
                const isActive = index === 0; // Marcar el primero como activo por defecto
                html += `
                <div class="role-item p-3 rounded-xl ${isActive ? 'bg-primary/10 border-primary/20' : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800/50'} cursor-pointer transition-all group" data-id="${role.id}">
                    <div class="flex items-center justify-between mb-1">
                        <span class="role-name text-sm font-bold ${isActive ? 'text-primary' : 'text-slate-900 dark:text-white'}">${role.nombre}</span>
                        <span class="status-icon material-symbols-outlined ${isActive ? 'text-primary opacity-100' : 'text-slate-400 opacity-0 group-hover:opacity-100'} text-sm">
                            ${isActive ? 'check_circle' : 'chevron_right'}
                        </span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${role.descripcion || 'Sin descripción disponible.'}</p>
                </div>`;
            });
            listaPerfiles.innerHTML = html;

            const newRoleItems = listaPerfiles.querySelectorAll('.role-item');
            setupSelection(newRoleItems, 'role-item', activeProfileHeader);
            
            // Si hay roles, actualizar el header con el primero y cargar sus permisos
            if (data.result.length > 0) {
                if (activeProfileHeader) activeProfileHeader.textContent = data.result[0].nombre;
                cargarPermisosPorPerfil(data.result[0].id);
            }
        }
    } catch (e) {
        console.error('Error cargando roles:', e);
        listaPerfiles.innerHTML = '<p class="text-xs text-red-500 p-4">Error al cargar perfiles</p>';
    }
}

async function cargarPermisosPorPerfil(idPerfil) {
    const inputOculto = document.getElementById('perfilIdHidden');
    if (inputOculto) inputOculto.value = idPerfil;

    const container = document.getElementById('modulosContainer');
    if (!container) return;

    container.innerHTML = `<div class="p-8 text-center text-slate-400 flex flex-col items-center">
        <span class="material-symbols-outlined animate-spin text-3xl">sync</span>
        <p class="mt-2 text-sm font-bold uppercase tracking-widest">Cargando permisos...</p>
    </div>`;

    try {
        const resp = await fetch(`permisos/get-row/${idPerfil}`);
        const data = await resp.json();

        if (data.status === 'success' || data.status === 200) {
            renderizarModulosPermisos(data.result);
        } else {
            container.innerHTML = `<p class="p-8 text-center text-red-500 text-sm font-bold">${data.message || 'Error cargando los permisos'}</p>`;
        }
    } catch(e) {
        console.error(e);
        container.innerHTML = `<p class="p-8 text-center text-red-500 text-sm font-bold">Error de conexión con el servidor.</p>`;
    }
}

function renderizarModulosPermisos(modulos) {
    const container = document.getElementById('modulosContainer');
    if (!modulos || modulos.length === 0) {
        container.innerHTML = '<p class="text-slate-500 p-8 text-sm text-center italic">No hay módulos configurados en el sistema.</p>';
        return;
    }

    let html = '';
    modulos.forEach(modulo => {
        let submodulosHtml = '';
        
        if (modulo.submodulos && modulo.submodulos.length > 0) {
            modulo.submodulos.forEach(sub => {
                let accionVer = null;
                let otrasAcciones = [];
                
                if (sub.acciones && sub.acciones.length > 0) {
                    accionVer = sub.acciones.find(a => a.accion_id == 1 || a.accion_id == '1');
                    otrasAcciones = sub.acciones.filter(a => a.accion_id != 1 && a.accion_id != '1');
                }

                let accionesHtml = '';
                if (otrasAcciones.length > 0) {
                    accionesHtml += `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">`;
                    otrasAcciones.forEach(acc => {
                        const isChecked = acc.seleccionado ? 'checked' : '';
                        accionesHtml += `
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <input type="checkbox" name="permisos[${sub.id}][]" value="${acc.accion_id}" ${isChecked}
                                class="permiso-checkbox rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800" />
                            <span class="text-[11px] font-bold text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 uppercase">${acc.nombre_accion}</span>
                        </label>`;
                    });
                    accionesHtml += `</div>`;
                } else if (!accionVer) {
                    accionesHtml = `<p class="text-[11px] text-slate-400 italic mt-1">Sin acciones configuradas</p>`;
                }

                // Generar checkbox principal del submódulo que ahora será la acción "Ver"
                let subCheckboxHtml = '';
                if (accionVer) {
                    const isChecked = accionVer.seleccionado ? 'checked' : '';
                    subCheckboxHtml = `<input type="checkbox" name="permisos[${sub.id}][]" value="${accionVer.accion_id}" ${isChecked} class="permiso-checkbox rounded border-slate-300 dark:border-slate-700 text-primary focus:ring-primary bg-white dark:bg-slate-800 size-3.5" />`;
                } else {
                    subCheckboxHtml = `<span class="size-3.5 inline-block"></span>`;
                }

                submodulosHtml += `
                <div class="space-y-2 py-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                    <div class="text-xs font-bold text-slate-700 dark:text-slate-300">
                        <label class="flex items-center gap-2 cursor-pointer w-fit">
                            ${subCheckboxHtml}
                            <span class="text-sm font-black text-slate-800 dark:text-slate-200">
                                ${sub.modulo} 
                                ${accionVer ? '<span class="text-slate-400 text-[10px] font-bold uppercase tracking-wide ml-1">(Ver)</span>' : ''}
                            </span>
                        </label>
                    </div>
                    <div class="pl-6">
                        ${accionesHtml}
                    </div>
                </div>`;
            });
        } else {
            submodulosHtml = `<p class="text-xs text-slate-500 italic">No hay submódulos disponibles para este módulo.</p>`;
        }

        html += `
        <div class="module-container bg-slate-50 dark:bg-slate-900/40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-all mb-4">
            <div class="module-header flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onclick="toggleModuleCustom(this)">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">${modulo.icono || 'folder'}</span>
                    <span class="font-bold text-sm tracking-tight">${modulo.modulo}</span>
                </div>
                <span class="module-chevron material-symbols-outlined text-slate-400 transition-transform duration-300 rotate-0">expand_more</span>
            </div>
            <div class="module-content px-6 pb-6 pt-2 space-y-2 overflow-hidden transition-all duration-300 border-t border-slate-200 dark:border-slate-800">
                ${submodulosHtml}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

function toggleModuleCustom(headerElement) {
    const content = headerElement.nextElementSibling;
    const chevron = headerElement.querySelector('.module-chevron');
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        chevron.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('hidden');
        chevron.style.transform = 'rotate(-90deg)';
    }
}

function toggleAllSubActions(mainCheckbox) {
    const container = mainCheckbox.closest('.space-y-2');
    if (container) {
        const checkboxes = container.querySelectorAll('.permiso-checkbox');
        checkboxes.forEach(cb => cb.checked = mainCheckbox.checked);
    }
}

function showPermissionsMobile() {
    if (window.innerWidth < 1024) {
        const main = document.getElementById('mainPermissions');
        main.classList.remove('mobile-hidden');
        main.classList.add('mobile-visible');
        // Scroll to top
        main.scrollTop = 0;
    }
}

function hidePermissionsMobile() {
    const main = document.getElementById('mainPermissions');
    main.classList.add('mobile-hidden');
    main.classList.remove('mobile-visible');
}

document.addEventListener('DOMContentLoaded', () => {
    const userItems = document.querySelectorAll('.user-item');
    setupSelection(userItems, 'user-item');
    cargarRoles();

    const formPermisos = document.getElementById('formPermisos');
    if (formPermisos) {
        formPermisos.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idPerfil = document.getElementById('perfilIdHidden').value;
            if (!idPerfil) return;

            // Recopilar los checkboxes marcados
            const marcados = document.querySelectorAll('.permiso-checkbox:checked');
            
            // Aquí puedes ver cuántos permisos vas a enviar antes de la lógica final del servidor
            console.log("Perfil ID a guardar:", idPerfil);
            console.log("Número de permisos seleccionados:", marcados.length);

            // TODO: Hacer fetch a la URL de guardar permisos
        });
    }
});