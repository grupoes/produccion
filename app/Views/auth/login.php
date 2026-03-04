<!DOCTYPE html>

<html class="dark" lang="es">

<head>
    <meta charset="utf-8" />
    <meta content="width=device-width, initial-scale=1.0" name="viewport" />
    <title>GrupoEs - Industrial Production System Login</title>
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&amp;display=swap"
        rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@100..700,0..1&amp;display=swap"
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
                    },
                    fontFamily: {
                        "display": ["Inter", "sans-serif"]
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
</head>

<body class="font-display bg-background-dark text-slate-100 min-h-screen flex items-center justify-center p-4">
    <div
        class="relative w-full bg-white dark:bg-slate-900/80 rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg">
        <div class="flex flex-col justify-center p-6 bg-transparent lg:p-10">
            <div class="mb-6 text-center">
                <div class="flex flex-col items-center justify-center mb-4">
                    <img src="img/logo_es.png" alt="Grupo Es Consultores Logo"
                        class="h-16 w-auto mb-2 drop-shadow-sm brightness-0 invert" />
                </div>
                <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">Bienvenido de nuevo</h2>
                <p class="text-slate-500 dark:text-slate-400">Ingrese sus credenciales para acceder al sistema</p>
            </div>
            <form id="loginForm" class="space-y-4">
                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">Correo
                        electrónico</label>
                    <div class="relative group">
                        <div
                            class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                            <span class="material-symbols-outlined text-[20px]">mail</span>
                        </div>
                        <input
                            class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg py-2.5 pl-11 pr-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            placeholder="ejemplo@grupoes.com" name="email" type="email" />
                    </div>
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">Contraseña</label>
                    <div class="relative group">
                        <div
                            class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary transition-colors">
                            <span class="material-symbols-outlined text-[20px]">lock</span>
                        </div>
                        <input id="password"
                            class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg py-2.5 pl-11 pr-12 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            placeholder="••••••••" name="password" type="password" />
                        <button id="togglePassword"
                            class="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            type="button">
                            <span class="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                    </div>
                </div>
                <div class="flex items-center justify-between py-1">
                    <label class="flex items-center cursor-pointer group">
                        <input
                            class="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary dark:border-slate-700 dark:bg-slate-800"
                            id="remember" type="checkbox" />
                        <span
                            class="ml-2 text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">Recordarme</span>
                    </label>
                    <a class="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                        href="#">¿Olvidaste tu contraseña?</a>
                </div>
                <button
                    class="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-lg shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transform active:scale-[0.98] transition-all"
                    type="submit">
                    <span>Iniciar Sesión</span>
                    <span class="material-symbols-outlined">login</span>
                </button>
            </form>
            <div class="mt-6 flex flex-col items-center gap-4">
                <div class="flex gap-4">
                    <p class="text-xs text-slate-400">© 2026 GrupoEs Consultores</p>
                </div>
            </div>
        </div>
    </div>
    <script src="js/auth/login.js"></script>
</body>

</html>