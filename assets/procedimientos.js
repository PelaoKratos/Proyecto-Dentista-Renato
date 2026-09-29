const procedureList = document.querySelector("#procedureList");
const procedureForm = document.querySelector("#procedureForm");
const procedureSearch = document.querySelector("#procedureSearch");
const procedureStatus = document.querySelector("#procedureStatus");
const cancelProcedureEdit = document.querySelector("#cancelProcedureEdit");
const newProcedure = document.querySelector("#newProcedure");
const retryProcedures = document.querySelector("#retryProcedures");
let procedures = [];
let editingProcedureId = null;
let savingProcedure = false;

function normalizeProcedure(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function renderProcedures() {
  const query = normalizeProcedure(procedureSearch.value);
  const visible = procedures.filter(item => normalizeProcedure(`${item.name} ${item.description || ""}`).includes(query));
  document.querySelector("#procedureCount").textContent = `${visible.length} procedimientos`;
  procedureList.innerHTML = visible.map(item => `
    <article class="procedure-item" data-procedure-id="${item.id}">
      <div><h3>${DentalAPI.escapeHtml(item.name)}</h3><p>${DentalAPI.escapeHtml(item.description || "Sin descripcion")}</p><strong>${item.default_price == null ? "Sin precio base" : DentalAPI.money(item.default_price)}</strong></div>
      <button class="text-button" type="button" data-edit-procedure="${item.id}" ${savingProcedure ? "disabled" : ""}>Editar</button>
    </article>`).join("") || `<p class="empty-state">${query ? "No hay procedimientos que coincidan con la busqueda." : "No hay procedimientos. Crea el primero desde el formulario."}</p>`;
}

function openProcedureForm(item = null) {
  if (savingProcedure) return;
  editingProcedureId = item?.id ?? null;
  procedureForm.reset();
  procedureForm.elements.name.value = item?.name || "";
  procedureForm.elements.description.value = item?.description || "";
  procedureForm.elements.default_price.value = item?.default_price ?? "";
  document.querySelector("#procedureFormTitle").textContent = item ? "Editar procedimiento" : "Nuevo procedimiento";
  procedureForm.querySelector("button[type='submit']").textContent = item ? "Guardar cambios" : "Crear procedimiento";
  cancelProcedureEdit.hidden = !item;
  procedureStatus.textContent = "";
  procedureForm.scrollIntoView({ behavior: "smooth", block: "center" });
  procedureForm.elements.name.focus({ preventScroll: true });
}

async function loadProcedures() {
  retryProcedures.hidden = true;
  try {
    procedures = await DentalAPI.get("/api/treatment-catalog");
    renderProcedures();
  } catch (error) {
    procedureList.innerHTML = `<p class="empty-state">No se pudo cargar el catalogo: ${DentalAPI.escapeHtml(error.message)}</p>`;
    retryProcedures.hidden = false;
  }
}

newProcedure.addEventListener("click", () => openProcedureForm());
cancelProcedureEdit.addEventListener("click", () => openProcedureForm());
procedureSearch.addEventListener("input", renderProcedures);
retryProcedures.addEventListener("click", loadProcedures);
procedureList.addEventListener("click", event => {
  const button = event.target.closest("[data-edit-procedure]");
  if (button) openProcedureForm(procedures.find(item => item.id === Number(button.dataset.editProcedure)));
});

procedureForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (savingProcedure) return;
  const name = procedureForm.elements.name.value.trim();
  const price = Number(procedureForm.elements.default_price.value);
  if (!name || !Number.isFinite(price) || price < 0) {
    procedureStatus.textContent = "Ingresa un nombre y un precio valido.";
    return;
  }
  const id = editingProcedureId;
  const payload = { name, description: procedureForm.elements.description.value.trim() || null, default_price: price };
  savingProcedure = true;
  [...procedureForm.elements, newProcedure].forEach(control => { control.disabled = true; });
  renderProcedures();
  procedureStatus.textContent = "Guardando procedimiento...";
  try {
    const saved = id ? await DentalAPI.put(`/api/treatment-catalog/${id}`, payload) : await DentalAPI.post("/api/treatment-catalog", payload);
    procedures = procedures.filter(item => item.id !== saved.id).concat(saved).sort((a, b) => a.name.localeCompare(b.name, "es"));
    editingProcedureId = saved.id;
    document.querySelector("#procedureFormTitle").textContent = "Editar procedimiento";
    procedureForm.querySelector("button[type='submit']").textContent = "Guardar cambios";
    cancelProcedureEdit.hidden = false;
    procedureSearch.value = "";
    procedureStatus.textContent = id ? "Procedimiento actualizado." : "Procedimiento creado. Ya esta disponible para nuevos tratamientos y citas.";
  } catch (error) {
    procedureStatus.textContent = error.message;
  } finally {
    savingProcedure = false;
    [...procedureForm.elements, newProcedure].forEach(control => { control.disabled = false; });
    renderProcedures();
  }
});

loadProcedures();
