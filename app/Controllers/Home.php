<?php

namespace App\Controllers;

class Home extends BaseController
{
    public function index(): string
    {
        return view('dashboard/index');
    }

    public function index2(): string
    {
        return view('dashboard/index2');
    }
}
