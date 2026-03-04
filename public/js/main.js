// Accordion Modules Logic
const moduleHeaders = document.querySelectorAll('.module-header');

moduleHeaders.forEach(header => {
    header.addEventListener('click', () => {
        const container = header.parentElement;
        const content = container.querySelector('.module-content');
        const chevron = header.querySelector('.module-chevron');

        // Toggle Content
        content.classList.toggle('hidden');

        // Rotate Chevron
        if (content.classList.contains('hidden')) {
            chevron.style.transform = 'rotate(-90deg)';
        } else {
            chevron.style.transform = 'rotate(0deg)';
        }
    });
});

// User Dropdown Logic
const userDropdownButton = document.getElementById('userDropdownButton');
const userDropdownMenu = document.getElementById('userDropdownMenu');

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

    // Close other submenus first (optional, but requested behavior often implies this)
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
    } else {
        submenu.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

userDropdownButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = userDropdownMenu.classList.contains('hidden');

    if (isHidden) {
        userDropdownMenu.classList.remove('hidden');
        // Force a reflow to trigger transition
        userDropdownMenu.offsetHeight;
        userDropdownMenu.classList.remove('scale-95', 'opacity-0');
        userDropdownMenu.classList.add('scale-100', 'opacity-100');
    } else {
        hideDropdown();
    }
});

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const backdrop = modal.querySelector('#modalBackdrop');
    const content = modal.querySelector('#modalContent');
    modal.classList.remove('hidden');
    modal.offsetHeight;
    if (backdrop) {
        backdrop.classList.remove('opacity-0');
        backdrop.classList.add('opacity-100');
    }
    if (content) {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const backdrop = modal.querySelector('#modalBackdrop');
    const content = modal.querySelector('#modalContent');
    if (backdrop) {
        backdrop.classList.remove('opacity-100');
        backdrop.classList.add('opacity-0');
    }
    if (content) {
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
    }
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }, 300);
}

function hideDropdown() {
    userDropdownMenu.classList.remove('scale-100', 'opacity-100');
    userDropdownMenu.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        userDropdownMenu.classList.add('hidden');
    }, 200);
}

document.addEventListener('click', (e) => {
    if (!userDropdownMenu.contains(e.target) && !userDropdownButton.contains(e.target)) {
        hideDropdown();
    }
});

function logout(e) {
    if (e) e.preventDefault();
    fetch('/auth/logout')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/';
            }
        })
        .catch(err => {
            console.error('Error al cerrar sesión:', err);
            window.location.href = '/';
        });
}