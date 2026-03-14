<?= $this->extend('layouts/main') ?>

<?= $this->section('content') ?>

<style>
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }

    /* Input focus ring */
    .input-field {
        width: 100%;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 0.75rem;
        padding: 0.625rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        outline: none;
        transition: all 0.15s;
        color: #1e293b;
    }
    .input-field:focus { border-color: #135bec; box-shadow: 0 0 0 3px rgba(19, 91, 236, 0.12); }

    .label-field {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .1em;
        color: #94a3b8;
        margin-bottom: 6px;
        display: block;
    }
</style>

<div class="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark p-8">
    <div class="max-w-7xl mx-auto flex flex-col gap-8">
        <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Gestión de Usuarios</h2>
            <button id="btnNuevoUsuario" onclick="openModal('modalNuevoUsuario')"
                class="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold text-sm transition-all shadow-lg shadow-primary/20">
                <span class="material-symbols-outlined text-[20px]">person_add</span>
                <span>Nuevo Usuario</span>
            </button>
        </div>
        <div class="bg-white dark:bg-neutral-dark rounded-xl border border-slate-200 dark:border-border-dark overflow-hidden shadow-sm">
            <div class="p-4 border-b border-slate-200 dark:border-border-dark bg-slate-50/50 dark:bg-slate-800/20">
                <div class="relative max-w-md">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                    <input
                        class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                        placeholder="Buscar por nombre, correo o rol..." type="text" />
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-bold tracking-widest">
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">#</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Rol</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Nombre Completo</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Celular</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Correo</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="tablaUsuarios" class="divide-y divide-slate-100 dark:divide-border-dark whitespace-nowrap">
                        <tr>
                            <td colspan="6" class="px-6 py-12 text-center">
                                <div class="flex flex-col items-center gap-3 text-slate-400">
                                    <span class="material-symbols-outlined text-[36px] animate-spin">progress_activity</span>
                                    <span class="text-sm font-medium">Cargando usuarios...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="px-6 py-4 border-t border-slate-200 dark:border-border-dark flex items-center justify-between">
                <span class="text-xs font-medium text-slate-500">Mostrando usuarios</span>
                <div class="flex items-center gap-1">
                    <button class="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>
                    <button class="size-8 rounded-lg flex items-center justify-center bg-primary text-white text-xs font-bold">1</button>
                    <button class="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!--  MODAL: NUEVO / EDITAR USUARIO                         -->
<!-- ═══════════════════════════════════════════════════════ -->
<div id="modalNuevoUsuario" class="fixed inset-0 z-[60] hidden overflow-y-auto overflow-x-hidden">
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-slate-900/60 transition-opacity opacity-0 cursor-pointer" id="modalBackdrop" onclick="closeModal('modalNuevoUsuario')"></div>

    <!-- Content wrapper -->
    <div class="relative flex min-h-screen items-center justify-center p-4">
        <div class="relative w-full max-w-2xl transform rounded-3xl bg-white dark:bg-neutral-dark shadow-2xl transition-all scale-95 opacity-0 duration-300" id="modalContent">

            <!-- ── Header ── -->
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-border-dark px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="size-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined text-[22px]">person_add</span>
                    </div>
                    <div>
                        <h3 id="usuarioModalTitle" class="text-lg font-black text-slate-900 dark:text-white leading-none">Nuevo Usuario</h3>
                        <p class="text-[13px] text-slate-500 mt-0.5">Completa los datos del nuevo usuario</p>
                    </div>
                </div>
                <button type="button" onclick="closeModal('modalNuevoUsuario')"
                    class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <!-- ── Body ── -->
            <form id="formNuevoUsuario" novalidate>
                <input type="hidden" id="usuario_id" name="usuarioId" value="0">

                <div class="px-6 py-5 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-5">

                    <!-- Sección: Documento de Identidad -->
                    <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[16px]">badge</span>
                            Documento de Identidad
                        </p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Tipo de Documento -->
                            <div>
                                <label for="tipo_documento" class="label-field">Tipo de Documento</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">article</span>
                                    <select id="tipo_documento" name="tipoDocumento" required
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 focus:border-primary appearance-none cursor-pointer"
                                        style="box-shadow:none">
                                        <option value="">Seleccionar...</option>
                                        <option value="DNI">DNI</option>
                                        <option value="CE">Carnet de Extranjería</option>
                                        <option value="PASAPORTE">Pasaporte</option>
                                        <option value="RUC">RUC</option>
                                        <option value="OTRO">Otro</option>
                                    </select>
                                </div>
                            </div>
                            <!-- Número de Documento -->
                            <div>
                                <label for="numero_documento" class="label-field">N° de Documento</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">pin</span>
                                    <input type="text" id="numero_documento" name="numeroDocumento" required
                                        placeholder="Ej: 12345678"
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-primary">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Sección: Datos Personales -->
                    <div class="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[16px]">person</span>
                            Datos Personales
                        </p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Nombres -->
                            <div>
                                <label for="nombres" class="label-field">Nombres</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">drive_file_rename_outline</span>
                                    <input type="text" id="nombres" name="nombres" required
                                        placeholder="Ej: Juan Carlos"
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-primary">
                                </div>
                            </div>
                            <!-- Apellidos -->
                            <div>
                                <label for="apellidos" class="label-field">Apellidos</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">drive_file_rename_outline</span>
                                    <input type="text" id="apellidos" name="apellidos" required
                                        placeholder="Ej: Pérez García"
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-primary">
                                </div>
                            </div>
                            <!-- Fecha de Nacimiento -->
                            <div>
                                <label for="fecha_nacimiento" class="label-field">Fecha de Nacimiento</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">cake</span>
                                    <input type="date" id="fecha_nacimiento" name="fechaNacimiento" required
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 focus:border-primary cursor-pointer">
                                </div>
                            </div>
                            <!-- Número de Celular -->
                            <div>
                                <label for="celular" class="label-field">Número de Celular</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">phone_iphone</span>
                                    <input type="tel" id="celular" name="celular" required
                                        placeholder="Ej: 987654321"
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-primary">
                                </div>
                            </div>
                        </div>

                        <!-- Rol -->
                        <div>
                            <label for="rol_id" class="label-field">Rol del Usuario</label>
                            <div class="relative">
                                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">manage_accounts</span>
                                <select id="rol_id" name="rol_id" required
                                    class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 focus:border-primary appearance-none cursor-pointer">
                                    <option value="">Seleccionar rol...</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Sección: Acceso al Sistema -->
                    <div class="bg-primary/5 p-4 rounded-2xl border border-primary/20 space-y-4">
                        <p class="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <span class="material-symbols-outlined text-[16px]">lock</span>
                            Acceso al Sistema
                        </p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <!-- Correo -->
                            <div>
                                <label for="correo" class="label-field">Correo Electrónico</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">alternate_email</span>
                                    <input type="email" id="correo" name="correo" required
                                        placeholder="usuario@empresa.com"
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-primary">
                                </div>
                            </div>
                            <!-- Contraseña -->
                            <div>
                                <label for="contrasena" class="label-field">Contraseña</label>
                                <div class="relative">
                                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">key</span>
                                    <input type="password" id="contrasena" name="password"
                                        placeholder="Mín. 8 caracteres"
                                        class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-primary">
                                    <button type="button" id="togglePassword"
                                        class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors">
                                        <span class="material-symbols-outlined text-[20px]" id="iconPassword">visibility</span>
                                    </button>
                                </div>
                                <p class="text-[10px] text-slate-400 mt-1.5 px-1">Deja vacío para mantener la contraseña actual al editar.</p>
                            </div>
                        </div>
                    </div>

                </div>

                <!-- ── Footer ── -->
                <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-border-dark bg-slate-50 dark:bg-slate-800/50 rounded-b-3xl">
                    <button type="button" onclick="closeModal('modalNuevoUsuario')"
                        class="px-5 py-2.5 rounded-xl font-bold text-sm bg-white dark:bg-neutral-dark border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
                        Cancelar
                    </button>
                    <button type="submit"
                        class="px-6 py-2.5 rounded-xl font-bold text-sm bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
                        <span class="material-symbols-outlined text-[18px]">save</span>
                        Guardar Usuario
                    </button>
                </div>
            </form>

        </div>
    </div>
</div>

<?= $this->endSection() ?>

<?= $this->section('js') ?>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="<?= base_url('js/usuario/index.js') ?>"></script>
<script>
    // ── Helpers de color por rol ──
    const rolColors = {
        1: { bg: 'bg-primary/20',    text: 'text-primary' },
        2: { bg: 'bg-emerald-500/20', text: 'text-emerald-600' },
        3: { bg: 'bg-amber-500/20',  text: 'text-amber-600' },
    };

    // ── Cargar tabla de usuarios ──
    async function cargarUsuarios() {
        const tbody = document.getElementById('tablaUsuarios');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center">
            <div class="flex flex-col items-center gap-3 text-slate-400">
                <span class="material-symbols-outlined text-[36px] animate-spin">progress_activity</span>
                <span class="text-sm font-medium">Cargando usuarios...</span>
            </div></td></tr>`;

        try {
            const resp = await fetch('usuarios/get-all');
            const data = await resp.json();

            if (data.status !== 'success' || !data.result || data.result.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-14 text-center">
                    <div class="flex flex-col items-center gap-3 text-slate-400">
                        <span class="material-symbols-outlined text-[44px]">group_off</span>
                        <span class="text-sm font-semibold">No hay usuarios registrados</span>
                    </div></td></tr>`;
                return;
            }

            let html = '';
            data.result.forEach(u => {
                const c = rolColors[u.rol_id] || { bg: 'bg-slate-200', text: 'text-slate-600' };
                const nombre = `${u.nombres || ''} ${u.apellidos || ''}`.trim();
                const ini = nombre ? nombre.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase() : '?';
                html += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td class="px-6 py-4 text-sm font-medium text-slate-400">${u.id}</td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${c.bg} ${c.text}">${u.rol || 'Sin rol'}</span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                            <div class="size-8 rounded-full bg-primary/10 flex items-center justify-center ${c.text} font-bold text-xs flex-shrink-0">${ini}</div>
                            <span class="text-sm font-semibold text-slate-900 dark:text-white">${nombre}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">${u.celular || '—'}</td>
                    <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">${u.correo || '—'}</td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="eliminarUsuario(${u.id})"
                                class="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar">
                                <span class="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                        </div>
                    </td>
                </tr>`;
            });
            tbody.innerHTML = html;
            document.querySelector('.text-xs.font-medium.text-slate-500').textContent =
                `Mostrando ${data.result.length} usuario${data.result.length !== 1 ? 's' : ''}`;
        } catch (err) {
            console.error('Error cargando usuarios:', err);
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400 text-sm">Error al cargar usuarios</td></tr>`;
        }
    }

    // ── Eliminar usuario ──
    async function eliminarUsuario(id) {
        const isDark = document.documentElement.classList.contains('dark');
        const result = await Swal.fire({
            title: '¿Eliminar usuario?', text: 'Esta acción no se puede deshacer.',
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#ef4444', cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
            background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#545454'
        });
        if (!result.isConfirmed) return;
        try {
            const resp = await fetch(`usuario/delete/${id}`);
            const data = await resp.json();
            if (data.status === 'success') {
                Swal.fire({ icon: 'success', title: '¡Eliminado!', timer: 1500, showConfirmButton: false,
                    background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#545454' });
                cargarUsuarios();
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: data.message || 'No se pudo eliminar', confirmButtonColor: '#135bec' });
            }
        } catch (err) { console.error(err); }
    }

    // ── Toggle mostrar/ocultar contraseña ──
    document.getElementById('togglePassword').addEventListener('click', () => {
        const input = document.getElementById('contrasena');
        const icon  = document.getElementById('iconPassword');
        if (input.type === 'password') {
            input.type = 'text';
            icon.textContent = 'visibility_off';
        } else {
            input.type = 'password';
            icon.textContent = 'visibility';
        }
    });

    // ── Cargar roles al abrir el modal (lazy) ──
    async function cargarRolesUsuario() {
        const sel = document.getElementById('rol_id');
        if (!sel || sel.options.length > 1) return;
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
        } catch (e) { console.error('Error cargando roles:', e); }
    }

    // ── Abrir modal Nuevo Usuario ──
    document.getElementById('btnNuevoUsuario').addEventListener('click', () => {
        document.getElementById('formNuevoUsuario').reset();
        document.getElementById('usuario_id').value = '0';
        document.getElementById('usuarioModalTitle').textContent = 'Nuevo Usuario';
        document.getElementById('contrasena').placeholder = 'Mín. 8 caracteres';
        // restaurar tipo password por si se había toggleado
        document.getElementById('contrasena').type = 'password';
        document.getElementById('iconPassword').textContent = 'visibility';
        cargarRolesUsuario();
    });

    // ── Envío del formulario → save-user ──
    document.getElementById('formNuevoUsuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isDark = document.documentElement.classList.contains('dark');
        const formData = new FormData(e.target);

        try {
            Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });

            const resp = await fetch('save-user', { method: 'POST', body: formData });
            const data = await resp.json();

            if (data.status === 'success') {
                Swal.fire({
                    icon: 'success', title: '¡Guardado!',
                    text: 'El usuario fue creado correctamente.',
                    confirmButtonColor: '#135bec', timer: 2000, showConfirmButton: false,
                    background: isDark ? '#1e293b' : '#fff',
                    color: isDark ? '#fff' : '#545454'
                }).then(() => {
                     // Solo al terminar SweetAlert, escondemos nuestro modal local
                    closeModal('modalNuevoUsuario');
                    cargarUsuarios();
                });
            } else {
                let msg = data.message || 'Error al guardar el usuario';
                if (typeof msg === 'object') msg = Object.values(msg).join('\n');
                Swal.fire({
                    icon: 'error', title: 'Error', text: msg,
                    confirmButtonColor: '#135bec',
                    background: isDark ? '#1e293b' : '#fff',
                    color: isDark ? '#fff' : '#545454'
                });
            }
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'Error de servidor', text: 'No se pudo conectar con el servidor.', confirmButtonColor: '#135bec' });
        }
    });

    // ── Cargar usuarios al iniciar ──
    document.addEventListener('DOMContentLoaded', cargarUsuarios);
</script>
<?= $this->endSection() ?>