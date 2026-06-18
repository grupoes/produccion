/**
 * Utilidad para formatear fechas a la zona horaria de Perú (America/Lima)
 */

export const formatToLimaTime = (dateInput) => {
  if (!dateInput) return "Fecha no disponible";

  const date = new Date(dateInput);

  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
};

export const formatToLimaDateOnly = (dateInput) => {
  if (!dateInput) return "Fecha no disponible";

  const date = new Date(dateInput);

  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};
