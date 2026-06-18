export const requireAuth = (req, res, next) => {
  // Verificamos si existe la sesión y si el usuario está logueado
  if (req.session && req.session.user) {
    return next();
  }
  
  // Si no hay sesión, redirigimos a la página de login ("/")
  return res.redirect("/");
};
