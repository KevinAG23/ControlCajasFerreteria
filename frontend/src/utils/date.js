// Centralized timezone-safe formatting helper for Ecuador local time (America/Guayaquil, UTC-5)

export const getEcuadorDateString = (dateInput) => {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
  } catch (e) {
    console.error("Error formatting date:", e);
    return "";
  }
};

export const getEcuadorTimeString = (dateInput) => {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  try {
    return d.toLocaleTimeString("es-EC", {
      timeZone: "America/Guayaquil",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch (e) {
    console.error("Error formatting time:", e);
    return "";
  }
};

export const getEcuadorDateTimeString = (dateInput) => {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  try {
    return d.toLocaleString("es-EC", {
      timeZone: "America/Guayaquil",
      hour12: false
    });
  } catch (e) {
    console.error("Error formatting datetime:", e);
    return "";
  }
};

export const getEcuadorTimeStringWithSeconds = (dateInput) => {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  try {
    return d.toLocaleTimeString("es-EC", {
      timeZone: "America/Guayaquil",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  } catch (e) {
    console.error("Error formatting time with seconds:", e);
    return "";
  }
};
