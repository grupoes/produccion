document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (loginError) {
      loginError.style.display = "none";
      loginError.textContent = "";
    }

    const usuario = document.getElementById("userEmail")?.value.trim();
    const clave = document.getElementById("userPassword")?.value;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ usuario, clave }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (loginError) {
          loginError.style.display = "block";
          loginError.textContent = data.error || "Error de inicio de sesión.";
        }
        return;
      }

      window.location.href = "/admin";
    } catch (error) {
      if (loginError) {
        loginError.style.display = "block";
        loginError.textContent =
          "No se pudo conectar al servidor. Intenta de nuevo.";
      }
    }
  });
});
