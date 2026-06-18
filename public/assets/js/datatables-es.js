// Soportar jQuery DataTables y el nuevo DataTables 2.0 Vanilla
window.DATATABLES_ES_CONFIG = {
  processing: "Procesando...",
  lengthMenu: "Mostrar _MENU_ registros",
  zeroRecords: "No se encontraron resultados",
  emptyTable: "Ningún dato disponible en esta tabla",
  info: "Mostrando registros del _START_ al _END_ de un total de _TOTAL_ registros",
  infoEmpty: "Mostrando registros del 0 al 0 de un total de 0 registros",
  infoFiltered: "(filtrado de un total de _MAX_ registros)",
  infoPostFix: "",
  search: "Buscar:",
  url: "",
  infoThousands: ",",
  loadingRecords: "Cargando...",
  paginate: {
    first: '<i class="ti ti-chevrons-left"></i>',
    last: '<i class="ti ti-chevrons-right"></i>',
    next: '<i class="ti ti-chevron-right"></i>',
    previous: '<i class="ti ti-chevron-left"></i>'
  },
  aria: {
    sortAscending: ": Activar para ordenar la columna de manera ascendente",
    sortDescending: ": Activar para ordenar la columna de manera descendente"
  }
};

if (typeof $ !== 'undefined' && $.fn && $.fn.dataTable) {
  $.extend(true, $.fn.dataTable.defaults, { language: window.DATATABLES_ES_CONFIG });
}
if (typeof DataTable !== 'undefined' && DataTable.defaults) {
  Object.assign(DataTable.defaults, { language: window.DATATABLES_ES_CONFIG });
}
