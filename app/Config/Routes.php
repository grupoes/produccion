<?php

use CodeIgniter\Router\RouteCollection;

/**
 * @var RouteCollection $routes
 */
$routes->get('/', 'Auth::index');
$routes->post('/auth/login', 'Auth::login');
$routes->get('/auth/logout', 'Auth::logout');

$routes->get('dashboard', 'Home::index');

$routes->get('permisos', 'Permisos::index');
$routes->get('permisos/lista-roles', 'Permisos::listaRoles');
$routes->post('permisos/guardar-rol', 'Permisos::guardarRol');
$routes->get('permisos/eliminar-rol/(:num)', 'Permisos::eliminarRol/$1');


$routes->get('usuarios', 'Usuario::index');

$routes->get('potenciales-clientes', 'Clientes::potenciales');
$routes->post('prospectos/crear', 'Clientes::saveProspecto');
$routes->get('prospecto/get-all', 'Clientes::getProspectos');
$routes->get('prospecto/get-row/(:num)', 'Clientes::getProspecto/$1');

$routes->get('instituciones', 'Instituciones::index');
$routes->post('instituciones/save', 'Instituciones::save');
$routes->get('instituciones/get-all', 'Instituciones::getInstituciones');
$routes->get('instituciones/delete/(:num)', 'Instituciones::delete/$1');

$routes->get('origen-contacto', 'Origen::index');
$routes->post('origen-contacto/save', 'Origen::create');
$routes->get('origen-contacto/get-all', 'Origen::getOrigenes');
$routes->get('origen-contacto/delete/(:num)', 'Origen::delete/$1');

$routes->get('tareas', 'Tareas::index');
$routes->post('tareas/save', 'Tareas::create');
$routes->post('categorias/save', 'Tareas::createType');
$routes->get('categorias/get-all', 'Tareas::getAllCategories');
$routes->get('tareas/get-all', 'Tareas::getAllTareas');
$routes->get('categorias/delete/(:num)', 'Tareas::deleteType/$1');
$routes->get('tareas/delete/(:num)', 'Tareas::delete/$1');
$routes->get('tareas/get-row/(:num)', 'Tareas::getTarea/$1');
$routes->get('tareas/get-by-rol/(:num)', 'Clientes::getTareaByRol/$1');

$routes->get('actividades', 'Actividades::getActividades');
$routes->get('getActividadRow/(:num)', 'Actividades::getActividadRow/$1');
$routes->post('update-link-drive', 'Actividades::updateLinkDrive');
$routes->post('getEstadosActividades', 'Actividades::getEstadosActividades');
$routes->get('get-ultimo-horario/(:num)', 'Actividades::traer_ultimo_horario_usuario/$1');

$routes->post('update-estado-tarea', 'Actividades::updateEstadoTarea');

$routes->get('horario/get-by-id/(:num)', 'Horario::getHorarioById/$1');
$routes->get('horario/get-usuario', 'Horario::getHorarioUsuario');

$routes->get('usuarios', 'Usuario::index');
$routes->get('consulta-dni/(:any)/(:any)', 'Usuario::api_dni_ruc/$1/$2');
$routes->post('save-user', 'Usuario::create');
$routes->get('usuarios/get-all', 'Usuario::getUsers');
$routes->get('usuario/get-row/(:num)', 'Usuario::getUser/$1');
$routes->get('usuario/delete/(:num)', 'Usuario::delete/$1');

$routes->get('reportes-eficiencia', 'Home::index2');
