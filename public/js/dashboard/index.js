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

    // Close other submenus
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
        // Maintain primary color for button if needed
    } else {
        submenu.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

// Drag and Drop Implementation
const cards = document.querySelectorAll('.kanban-card');
const columns = document.querySelectorAll('.kanban-column-content');

cards.forEach(card => {
    card.addEventListener('dragstart', () => {
        card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
    });
});

columns.forEach(column => {
    column.addEventListener('dragover', e => {
        e.preventDefault();
        column.classList.add('drag-over');

        const draggingCard = document.querySelector('.dragging');
        const afterElement = getDragAfterElement(column, e.clientY);

        if (afterElement == null) {
            column.appendChild(draggingCard);
        } else {
            column.insertBefore(draggingCard, afterElement);
        }
    });

    column.addEventListener('dragleave', () => {
        column.classList.remove('drag-over');
    });

    column.addEventListener('drop', e => {
        e.preventDefault();
        column.classList.remove('drag-over');

        // Update column counters (optional but recommended)
        updateColumnCounters();
    });
});

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateColumnCounters() {
    const columnContainers = document.querySelectorAll('.kanban-column');
    columnContainers.forEach(container => {
        const content = container.querySelector('.kanban-column-content');
        const counter = container.querySelector('span[class*="rounded-full font-bold"]');
        if (content && counter) {
            counter.innerText = content.children.length;
        }
    });
}