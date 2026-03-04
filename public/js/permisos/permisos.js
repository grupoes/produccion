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
            // Remove active state from all
            items.forEach(i => {
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

            // Mobile: Show permissions view
            showPermissionsMobile();
        });
    });
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

const roleItems = document.querySelectorAll('.role-item');
const userItems = document.querySelectorAll('.user-item');
const activeProfileHeader = document.querySelector('.max-w-4xl span.text-primary');

setupSelection(roleItems, 'role-item', activeProfileHeader);
setupSelection(userItems, 'user-item');