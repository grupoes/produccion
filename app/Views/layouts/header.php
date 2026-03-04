<header
    class="h-16 flex items-center justify-between px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-sm z-10 shrink-0 relative">
    <div class="flex items-center gap-4">
        <button onclick="toggleSidebar()"
            class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <span class="material-symbols-outlined">menu</span>
        </button>
        <h2 class="text-lg font-bold tracking-tight lg:block hidden">Sistema Mia</h2>
    </div>
    <!-- Centered Title for Mobile -->
    <h2 class="text-lg font-bold tracking-tight lg:hidden header-title-centered">Sistema Mia</h2>

    <div class="flex items-center gap-4">
        <div class="relative max-w-xs lg:block hidden">
            <span
                class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input
                class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary"
                placeholder="Global search..." type="text" />
        </div>
        <div class="relative inline-block text-left" id="userMenu">
            <button type="button"
                class="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
                id="userDropdownButton">
                <div class="flex flex-col items-end mr-1 lg:block hidden">
                    <span class="text-sm font-bold text-slate-900 dark:text-white leading-tight">Carlos
                        Admin</span>
                    <span
                        class="text-[10px] text-slate-500 font-medium lowercase first-letter:uppercase">Administrador</span>
                </div>
                <div
                    class="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden border-2 border-primary/20 shadow-inner">
                    <span class="material-symbols-outlined text-xl">person</span>
                </div>
            </button>
            <!-- Dropdown Menu -->
            <div id="userDropdownMenu"
                class="hidden absolute right-0 mt-3 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden transform origin-top-right transition-all duration-200 scale-95 opacity-0">
                <div class="p-2 space-y-1">
                    <!-- Mobile User Info Item -->
                    <div class="lg:hidden px-4 py-3 border-b border-slate-100 dark:border-slate-800 mb-1">
                        <p class="text-sm font-bold text-slate-900 dark:text-white">Carlos Admin</p>
                        <p class="text-xs text-slate-500">Administrador</p>
                    </div>
                    <a href="#"
                        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors">
                        <span class="material-symbols-outlined text-lg">account_circle</span>
                        <span>Mi Perfil</span>
                    </a>
                    <a href="#"
                        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors">
                        <span class="material-symbols-outlined text-lg">settings</span>
                        <span>Configuración</span>
                    </a>
                    <div class="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2"></div>
                    <a href="#" onclick="logout(event)"
                        class="flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <span class="material-symbols-outlined text-lg">logout</span>
                        <span>Cerrar Sesión</span>
                    </a>
                </div>
            </div>
        </div>
    </div>
</header>