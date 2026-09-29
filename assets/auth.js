const form = document.querySelector("#authForm");
const title = document.querySelector("#authTitle");
const description = document.querySelector("#authDescription");
const password = document.querySelector("#password");
const confirmation = document.querySelector("#confirmPassword");
const confirmationLabel = document.querySelector("#confirmLabel");
const submit = document.querySelector("#authSubmit");
const message = document.querySelector("#authMessage");
let setupRequired = false;

function destination() {
  const next = new URLSearchParams(location.search).get("next") || "/index.html";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/index.html";
}

async function loadAuthStatus() {
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo consultar el estado del servidor.");
    const status = await response.json();
    if (status.authenticated) {
      location.replace(destination());
      return;
    }
    setupRequired = status.setup_required;
    title.textContent = setupRequired ? "Configurar acceso" : "Ingresar a la consulta";
    description.textContent = setupRequired
      ? "Crea una clave de al menos 12 caracteres. La necesitarás cada vez que venza la sesión."
      : "Ingresa la clave de administrador para ver los datos de la consulta.";
    confirmation.hidden = !setupRequired;
    confirmationLabel.hidden = !setupRequired;
    confirmation.required = setupRequired;
    password.autocomplete = setupRequired ? "new-password" : "current-password";
    submit.textContent = setupRequired ? "Crear clave e ingresar" : "Ingresar";
    form.hidden = false;
    password.focus();
  } catch (error) {
    description.textContent = error.message;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  if (setupRequired && password.value !== confirmation.value) {
    message.textContent = "Las claves no coinciden.";
    return;
  }
  submit.disabled = true;
  try {
    const response = await fetch(setupRequired ? "/api/auth/setup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo ingresar.");
    location.replace(destination());
  } catch (error) {
    message.textContent = error.message;
    submit.disabled = false;
  }
});

loadAuthStatus();
