<?= $this->extend('layouts/main') ?>

<?= $this->section('content') ?>

<div class="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark p-8">
    <div class="max-w-7xl mx-auto flex flex-col gap-8">
        <div class="flex flex-wrap items-center justify-between gap-4">
            <h2 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Gestión de
                Usuarios</h2>
            <button
                class="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold text-sm transition-all shadow-lg shadow-primary/20">
                <span class="material-symbols-outlined text-[20px]">person_add</span>
                <span>Nuevo Usuario</span>
            </button>
        </div>
        <div
            class="bg-white dark:bg-neutral-dark rounded-xl border border-slate-200 dark:border-border-dark overflow-hidden shadow-sm">
            <div
                class="p-4 border-b border-slate-200 dark:border-border-dark bg-slate-50/50 dark:bg-slate-800/20">
                <div class="relative max-w-md">
                    <span
                        class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                    <input
                        class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-background-dark border border-slate-200 dark:border-border-dark rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
                        placeholder="Buscar por nombre, correo o rol..." type="text" />
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr
                            class="bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-bold tracking-widest">
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">#</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Rol</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Nombre
                                Completo</th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Celular
                            </th>
                            <th class="px-6 py-4 border-b border-slate-200 dark:border-border-dark">Correo
                            </th>
                            <th
                                class="px-6 py-4 border-b border-slate-200 dark:border-border-dark text-right">
                                Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-border-dark whitespace-nowrap">
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                            <td class="px-6 py-4 text-sm font-medium text-slate-400">101</td>
                            <td class="px-6 py-4">
                                <span
                                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/20 text-primary uppercase">
                                    Admin
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="size-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                        <img alt="Carlos Rodríguez" class="size-full object-cover"
                                            data-alt="Portrait of an adult male employee"
                                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCw3YNZTZ1eaUs3M9hnLARwWR7J0RDm25AwA6GGjWuhshTa3k88TVLE-nyuyAWWmceqbgi2pff9iCRRmcyiWfjS88fWry5mmimgYBdX7FU-6pMnvhhC-tf2dmoDDXMuND9y84QvGa3YB-TfLmhOIyZAeFOPjNBD6lL_j-kKc5GCNbPCk7mbCl7-tcQE-ysGEpU6fay1jGRNHuMNBFCf8Ag-zKXXrhkihVqZ05UuRBduUHm2C5210OVrpDPHgSzlbkSK7e0xhjYNNLtd" />
                                    </div>
                                    <span class="text-sm font-semibold text-slate-900 dark:text-white">Carlos Rodríguez</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">+54 11 1234-5678</td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">carlos.r@empresa.com</td>
                            <td class="px-6 py-4 text-right">
                                <div
                                    class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors"
                                        title="Editar">
                                        <span class="material-symbols-outlined text-[20px]">edit</span>
                                    </button>
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                                        title="Eliminar">
                                        <span class="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                            <td class="px-6 py-4 text-sm font-medium text-slate-400">102</td>
                            <td class="px-6 py-4">
                                <span
                                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-500 uppercase">
                                    Supervisor
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="size-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                        <img alt="Elena Martínez" class="size-full object-cover"
                                            data-alt="Portrait of an adult female employee"
                                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCS4rNe8p-3fHEBOy2dYna6vI6USU2LqGSvE3MgW9SkIUKead3Ltj1I9vYKukgt788a5IVspN1LaV93_1WQMiMPv3uS7LRICvYNOB6P11xJR18-W3Ai_18oEX6hUEc28WBhW2OlLQ2K11M-MZ4K4lATyS1dA6l8uZUOayeb6feQGLFSendE_aB9QzUj6dZlnCJSuhqyEKWSEv5z5mpozp8QMnW0kwppxqWOuAz44zh_3OfISidwqWKLdfQnlu6A1gYuDG0y1I5tH01n" />
                                    </div>
                                    <span class="text-sm font-semibold text-slate-900 dark:text-white">Elena Martínez</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">+54 11 8765-4321</td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">elena.m@empresa.com</td>
                            <td class="px-6 py-4 text-right">
                                <div
                                    class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors"
                                        title="Editar">
                                        <span class="material-symbols-outlined text-[20px]">edit</span>
                                    </button>
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                                        title="Eliminar">
                                        <span class="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                            <td class="px-6 py-4 text-sm font-medium text-slate-400">103</td>
                            <td class="px-6 py-4">
                                <span
                                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-500 uppercase">
                                    Operator
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="size-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                        <img alt="Juan Pérez" class="size-full object-cover"
                                            data-alt="Portrait of a young male worker"
                                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuD96wydNN76aPXWK_fKZ7fKuMCsRFIoTGu2SIB9m_4ze5eNXUEwsycXAaOVmisZn-PU201Z_RdUbSXFArn1n6Mpf5dMUmj00xOkGCLlhMlUJZitj_SFXSlee1CL6WJ7_LGbIJP7HS_dc1jhg42VutJwKR7pQLSu83sO2z1lFqr_XEkhbFNtbf22XFWE2lUNoojjrcKLOugSOJu6HWHj4edCAUAX-EMj40q0pIN2431yyEtZp8KetZM8PtxPlJv2XIFFZKPnP4HWuM7I" />
                                    </div>
                                    <span class="text-sm font-semibold text-slate-900 dark:text-white">Juan Pérez</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">+54 11 5555-0199</td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">juan.p@empresa.com</td>
                            <td class="px-6 py-4 text-right">
                                <div
                                    class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors"
                                        title="Editar">
                                        <span class="material-symbols-outlined text-[20px]">edit</span>
                                    </button>
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                                        title="Eliminar">
                                        <span class="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                            <td class="px-6 py-4 text-sm font-medium text-slate-400">104</td>
                            <td class="px-6 py-4">
                                <span
                                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-500 uppercase">
                                    Operator
                                </span>
                            </td>
                            <td class="px-6 py-4">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="size-8 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                        <img alt="Sofia Gomez" class="size-full object-cover"
                                            data-alt="Portrait of a female operator"
                                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDt65XARmIYSXJAkVd1O0Ik8bV-Whwvjdfj2ZHWQKRh0FuV4ksz4yaxlnFH8IkJPf4OqgRNhbU-XJYqfSicLb79YJgjgrfDPt_SWI_d57a_xMA6XGwvloAawPYi1fZAyJ1IEFVgtcu9rvadCTzVM7ClhOVyRTJQbzvPYIJZx-9d8w2zrQokmZ0l5OunrDelbS6sAEhPIJw8o0sI3GnL1_1baTC8Z5oY30UCFQdi5CAl7a16T0nqc0SmdPkoLcxAghoKbkLqyjrPQAFh" />
                                    </div>
                                    <span class="text-sm font-semibold text-slate-900 dark:text-white">Sofía Gomez</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">+54 11 4444-2211</td>
                            <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">sofia.g@empresa.com</td>
                            <td class="px-6 py-4 text-right">
                                <div
                                    class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-colors"
                                        title="Editar">
                                        <span class="material-symbols-outlined text-[20px]">edit</span>
                                    </button>
                                    <button
                                        class="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                                        title="Eliminar">
                                        <span class="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div
                class="px-6 py-4 border-t border-slate-200 dark:border-border-dark flex items-center justify-between">
                <span class="text-xs font-medium text-slate-500">Mostrando 4 de 24 usuarios</span>
                <div class="flex items-center gap-1">
                    <button
                        class="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>
                    <button
                        class="size-8 rounded-lg flex items-center justify-center bg-primary text-white text-xs font-bold">1</button>
                    <button
                        class="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-bold">2</button>
                    <button
                        class="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-bold">3</button>
                    <button
                        class="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span class="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
<?= $this->endSection() ?>

<?= $this->section('js') ?>
<script src="<?= base_url('js/usuario/index.js') ?>"></script>
<?= $this->endSection() ?>