<?php

namespace App\Controllers;

class Tareas extends BaseController
{
    public function index()
    {
        if (!session()->get('isLoggedIn')) {
            return redirect()->to(base_url());
        }

        $ruta = getenv('URL_BACKEND') . 'permisos/lista-roles';

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['message']['error']
            ]);
        }

        $roles = $data['result'];

        return view('tareas/index', compact('roles'));
    }

    public function create()
    {
        $tareaId = $this->request->getPost('tareaId');
        $tareaCategoria = $this->request->getPost('tareaCategoria');
        $tareaNombre = $this->request->getPost('tareaNombre');
        $tareaHoras = $this->request->getPost('tareasHoras');
        $tareasRoles = $this->request->getPost('roles');
        $prioridad = $this->request->getPost('prioridad');

        $ruta = getenv('URL_BACKEND') . 'tareas/save';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id' => $tareaId,
                'categoriaId' => $tareaCategoria,
                'nombre' => $tareaNombre,
                'horasEstimadas' => $tareaHoras,
                'roles' => $tareasRoles,
                'prioridad' => $prioridad
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function getTarea($id)
    {
        $ruta = getenv('URL_BACKEND') . 'tareas/get/' . $id;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function getAllTareas()
    {
        $ruta = getenv('URL_BACKEND') . 'tareas/all';

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function createType()
    {
        $categoriaId = $this->request->getPost('categoriaId');
        $categoriaNombre = $this->request->getPost('categoriaNombre');
        $categoriaColor = $this->request->getPost('categoriaColor');

        $ruta = getenv('URL_BACKEND') . 'tareas/type-save';

        $client = \Config\Services::curlrequest();

        $response = $client->post($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false,
            'json' => [
                'id' => $categoriaId,
                'nombre' => $categoriaNombre,
                'color' => $categoriaColor
            ]
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function getAllCategories()
    {
        $ruta = getenv('URL_BACKEND') . 'tareas/type-all';

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'result' => $data['result']
        ]);
    }

    public function deleteType($id)
    {
        $ruta = getenv('URL_BACKEND') . 'tareas/delete-type/' . $id;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message']
        ]);
    }

    public function delete($id)
    {
        $ruta = getenv('URL_BACKEND') . 'tareas/delete/' . $id;

        $client = \Config\Services::curlrequest();

        $response = $client->get($ruta, [
            'headers' => [
                'Accept' => 'application/json'
            ],
            'http_errors' => false
        ]);

        $data = json_decode($response->getBody(), true);

        if (!$data || $data['status'] == 500 || $data['status'] == 400) {
            return $this->response->setJSON([
                'status' => 'error',
                'message' => $data['messages']['error']
            ]);
        }

        return $this->response->setJSON([
            'status' => 'success',
            'message' => $data['message'],
            'id' => $data['id']
        ]);
    }
}
