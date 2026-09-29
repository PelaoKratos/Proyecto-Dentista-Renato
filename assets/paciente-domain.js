/* Funciones puras del dominio de la ficha del paciente. */
(() => {
  const toothDescription = (code) => {
    const value = String(code || "");
    const quadrant = value.charAt(0);
    const position = value.charAt(1);
    const positions = { 1: "Incisivo central", 2: "Incisivo lateral", 3: "Canino", 4: "Primer premolar", 5: "Segundo premolar", 6: "Primer molar", 7: "Segundo molar", 8: "Tercer molar" };
    const quadrants = { 1: "superior derecho", 2: "superior izquierdo", 3: "inferior izquierdo", 4: "inferior derecho" };
    return positions[position] && quadrants[quadrant] ? `${positions[position]} ${quadrants[quadrant]}` : "Pieza dental seleccionada";
  };
  const catalogGroup = (name) => {
    const value = String(name || "").toLowerCase();
    if (value.includes("limpieza") || value.includes("evaluacion")) return "Preventivo";
    if (value.includes("extraccion") || value.includes("implante")) return "Cirugia";
    if (value.includes("resina")) return "Restauracion";
    if (value.includes("endodoncia")) return "Endodoncia";
    if (value.includes("corona") || value.includes("protesis") || value.includes("plano")) return "Protesis";
    if (value.includes("blanqueamiento") || value.includes("carilla")) return "Estetico";
    return "Periodontal";
  };
  function ageFromBirthDate(birthDate) {
    if (!birthDate) return "Edad sin registrar";
    const birth = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return "Edad sin registrar";
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
    return `${age} anos`;
  }
  function totalTreatments(summary) {
    return summary.treatments.reduce((total, treatment) => total + Number(treatment.final_price ?? treatment.estimated_price ?? 0), 0);
  }
  function totalPayments(summary) {
    return summary.payments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  }
  function balance(summary) {
    return Math.max(totalTreatments(summary) - totalPayments(summary), 0);
  }
  function treatmentTotal(treatment) {
    return Number(treatment.final_price ?? treatment.estimated_price ?? 0);
  }
  function treatmentPaid(summary, treatmentId) {
    return summary.payments
      .filter((payment) => Number(payment.patient_treatment_id) === Number(treatmentId))
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);
  }
  function treatmentBalance(summary, treatment) {
    return Math.max(treatmentTotal(treatment) - treatmentPaid(summary, treatment.id), 0);
  }
  function paymentState(total, paid) {
    if (total <= 0 && paid <= 0) return "Sin presupuesto";
    if (paid <= 0) return "Pendiente";
    if (paid < total) return "Parcial";
    return "Pagado";
  }
  function paymentStateClass(total, paid) {
    const state = paymentState(total, paid);
    if (state === "Pagado") return "success";
    if (state === "Parcial") return "warning";
    return "";
  }
  function progressForStatus(status) {
    if (status === "completed") return 100;
    if (status === "in_progress") return 62;
    if (status === "cancelled") return 0;
    return 22;
  }
  function dateKey(value) {
    return String(value || "").slice(0, 10) || "sin-fecha";
  }
  function attachmentTypeLabel(type) {
    const labels = {
      radiography: "Radiografia",
      photo: "Foto clinica",
      document: "Documento",
      other: "Otro"
    };
    return labels[type] || type || "Adjunto";
  }
  window.PatientDomain = Object.freeze({ toothDescription, catalogGroup, ageFromBirthDate, totalTreatments, totalPayments, balance, treatmentTotal, treatmentPaid, treatmentBalance, paymentState, paymentStateClass, progressForStatus, dateKey, attachmentTypeLabel });
})();
