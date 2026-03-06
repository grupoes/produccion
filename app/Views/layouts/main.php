<!DOCTYPE html>

<html class="dark" lang="es">

<head>
    <meta charset="utf-8" />
    <meta content="width=device-width, initial-scale=1.0" name="viewport" />
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap"
        rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;display=swap"
        rel="stylesheet" />
    <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap"
        rel="stylesheet" />
    <script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        "primary": "#135bec",
                        "background-light": "#f6f6f8",
                        "background-dark": "#101622",
                        "neutral-dark": "#1a2233",
                        "border-dark": "#2d3748",
                    },
                    fontFamily: {
                        "display": ["Inter"]
                    },
                    borderRadius: {
                        "DEFAULT": "0.25rem",
                        "lg": "0.5rem",
                        "xl": "0.75rem",
                        "full": "9999px"
                    },
                },
            },
        }
    </script>
    <title>Admin Permissions Panel</title>
    <style>
        .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #1e293b;
            border-radius: 10px;
        }

        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #334155;
        }

        /* Sidebar Toggle & Responsive Styles */
        aside {
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease;
        }

        .sidebar-collapsed {
            width: 80px !important;
        }

        .sidebar-collapsed .logo-text,
        .sidebar-collapsed .menu-label,
        .sidebar-collapsed .expand-icon,
        .sidebar-collapsed .submenu,
        .sidebar-collapsed .user-info {
            display: none !important;
        }

        .sidebar-collapsed .module-item button {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
        }

        .sidebar-collapsed .module-item button div {
            margin-right: 0 !important;
            justify-content: center;
        }

        .sidebar-collapsed .module-item button span.material-symbols-outlined {
            margin: 0;
        }

        /* Mobile Overlay */
        @media (max-width: 1024px) {
            #mainSidebar {
                position: fixed;
                height: 100vh;
                z-index: 50;
                transform: translateX(-100%);
                width: 256px !important;
            }

            #mainSidebar.mobile-open {
                transform: translateX(0);
            }

            #sidebarBackdrop.active {
                display: block;
            }

            .header-title-centered {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
            }

            #innerSidebar {
                width: 100% !important;
                position: relative;
                transform: none;
                height: 100% !important;
            }

            #mainPermissions.mobile-hidden {
                display: none;
            }

            #mainPermissions.mobile-visible {
                display: block;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 30;
                background: white;
            }

            .dark #mainPermissions.mobile-visible {
                background: #101622;
            }
        }
    </style>
</head>

<body class="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 antialiased">
    <div class="flex h-screen overflow-hidden relative">
        <!-- Sidebar Backdrop for Mobile -->
        <div id="sidebarBackdrop" class="fixed inset-0 bg-black/50 z-40 hidden transition-opacity duration-300"
            onclick="toggleSidebar()"></div>

        <!-- Sidebar Navigation -->
        <aside id="mainSidebar"
            class="w-64 border-r border-primary/20 bg-background-light dark:bg-background-dark flex flex-col z-50">
            <div class="p-6 flex items-center gap-3 shrink-0">
                <div class="bg-primary p-2 rounded-lg shrink-0">
                    <span class="material-symbols-outlined text-white">factory</span>
                </div>
                <h1 class="text-xl font-bold tracking-tight logo-text">Grupo ES</h1>
            </div>
            <nav class="flex-1 px-4 space-y-2 py-4 overflow-y-auto custom-scrollbar">
                <?= $this->include('layouts/menu') ?>
            </nav>
            <div class="p-4 border-t border-primary/10 shrink-0">
                <div class="flex items-center gap-3 p-2">
                    <div
                        class="size-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                        <img alt="User avatar" data-alt="User profile avatar illustration"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAwtxm2XhsjkN8EsChGmf9r9y_WUIGILohmsjB3D8220NJJuRgE7R4sg83kUL1gtWCfKZ-_UqXrGjwAPPZy-mg_G5ny3JBf-zs-taUPqzb9I19xUGbNbEga-yNUucSaBo2mwTr579iDmME1ZFrLw784ZtE45E8_oHf64Z-k5fo9roLMYFBomSDj5SVZIwIq3MC7yxuXJaH9w9C-V7ZOW01KyG_lYewaPo06X5_wuVvOq6OxtP3-JChxPhj6l1v7XGSSVtuyCPYDGXbg" />
                    </div>
                    <div class="user-info">
                        <p class="text-sm font-semibold">Admin User</p>
                        <p class="text-xs text-slate-500">Dept. Producción</p>
                    </div>
                </div>
            </div>
        </aside>
        <!-- Main Content Wrapper -->
        <div class="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark">
            <!-- Header -->
            <?= $this->include('layouts/header') ?>
            <!-- Inner Layout -->
            <main id="content-page" class="flex-1 flex flex-col min-h-0">
                <?= $this->renderSection('content') ?>
            </main>
        </div>
    </div>
    <script src="<?= base_url('js/main.js') ?>"></script>
    <?= $this->renderSection('js') ?>

</body>

</html>