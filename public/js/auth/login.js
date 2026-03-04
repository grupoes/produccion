const togglePassword = document.querySelector('#togglePassword');
const password = document.querySelector('#password');

togglePassword.addEventListener('click', function (e) {
    const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
    password.setAttribute('type', type);

    this.children[0].textContent = type === 'password' ? 'visibility' : 'visibility_off';
});

const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(loginForm);

    fetch("/auth/login", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        headers: {
            "X-Requested-With": "XMLHttpRequest",
        },
    })
        .then((res) => res.json())
        .then((data) => {
            if (data.status == "error") {
                alert(data.message);
                return false;
            }

            window.location.href = "/dashboard";
        })
        .catch((err) => {
            console.error("Error en fetch:", err);
            alert("Error en la conexión: " + (err.message || err));
        });
});