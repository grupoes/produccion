document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginButton = document.getElementById("loginButton");
  const emailInput = document.getElementById("userEmail");
  const passwordInput = document.getElementById("userPassword");

  if (!loginForm) return;

  const setLoading = (loading) => {
    if (!loginButton) return;
    loginButton.disabled = loading;
    loginButton.classList.toggle("loading", loading);
  };

  const showError = (message) => {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.style.display = "block";
    emailInput?.classList.add("error");
    passwordInput?.classList.add("error");
  };

  const clearError = () => {
    if (!loginError) return;
    loginError.style.display = "none";
    loginError.textContent = "";
    emailInput?.classList.remove("error");
    passwordInput?.classList.remove("error");
  };

  const clearFieldError = (input) => {
    input?.classList.remove("error");
    if (loginError?.style.display !== "none") {
      loginError.style.display = "none";
      loginError.textContent = "";
    }
  };

  emailInput?.addEventListener("input", () => clearFieldError(emailInput));
  passwordInput?.addEventListener("input", () => clearFieldError(passwordInput));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const usuario = emailInput?.value.trim();
    const clave = passwordInput?.value;

    if (!usuario || !clave) {
      showError("Todos los campos son obligatorios.");
      if (!usuario) emailInput?.classList.add("error");
      if (!clave) passwordInput?.classList.add("error");
      return;
    }

    setLoading(true);

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
        showError(data.error || "Credenciales inválidas. Intenta de nuevo.");
        return;
      }

      window.location.href = "/admin";
    } catch (error) {
      showError("Error de conexión. Verifica tu red e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  });
});
