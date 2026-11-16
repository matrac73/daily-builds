import { generatePassword, validateEmail, validatePassword, validateUsername } from "./validators.js";

const VALIDATORS = { username: validateUsername, email: validateEmail, password: validatePassword };
const FIELD_NAMES = Object.keys(VALIDATORS);

const form = document.querySelector("#signup-form");
const submitButton = document.querySelector("#submit");
const formStatus = document.querySelector("#form-status");
const passwordInput = form.elements.password;
const toggleButton = document.querySelector("#toggle-password");
const success = document.querySelector("#success");

/** Fields the user has already left: errors stay quiet until then, so typing isn't nagged. */
const touched = new Set();

function renderPasswordRules(checks) {
  for (const { id, count, required, ok } of checks) {
    const item = document.querySelector(`[data-check="${id}"]`);
    item.classList.toggle("ok", ok);
    item.querySelector(".count").textContent = required > 0 ? `${count}/${required}` : String(count);
  }
}

/** Updates one field's visual state and returns whether it is valid. */
function renderField(name) {
  const input = form.elements[name];
  const result = VALIDATORS[name](input.value);
  const showError = touched.has(name) && !result.valid;

  const field = form.querySelector(`[data-field="${name}"]`);
  field.classList.toggle("is-valid", result.valid);
  field.classList.toggle("is-invalid", showError);
  input.setAttribute("aria-invalid", String(showError));
  document.querySelector(`#${name}-error`).textContent = showError ? result.errors[0] : "";

  if (name === "password") renderPasswordRules(result.checks);
  return result.valid;
}

/** Re-validates everything, gates the submit button, and returns whether the form is valid. */
function render() {
  const invalidCount = FIELD_NAMES.filter((name) => !renderField(name)).length;
  submitButton.disabled = invalidCount > 0;
  formStatus.textContent =
    invalidCount === 0
      ? "Everything checks out. You can create your account."
      : `${invalidCount} ${invalidCount === 1 ? "field still needs" : "fields still need"} a valid value.`;
  return invalidCount === 0;
}

function setPasswordVisible(visible) {
  passwordInput.type = visible ? "text" : "password";
  toggleButton.textContent = visible ? "Hide" : "Show";
  toggleButton.setAttribute("aria-pressed", String(visible));
}

form.addEventListener("input", render);

form.addEventListener("focusout", (event) => {
  if (event.target.name in VALIDATORS && event.target.value !== "") {
    touched.add(event.target.name);
    render();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  // The button is disabled while invalid, but Enter-key or scripted submits must be gated too.
  FIELD_NAMES.forEach((name) => touched.add(name));
  if (!render()) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  document.querySelector("#success-name").textContent = form.elements.username.value;
  form.hidden = true;
  success.hidden = false;
  success.focus();
});

toggleButton.addEventListener("click", () => setPasswordVisible(passwordInput.type === "password"));

document.querySelector("#generate-password").addEventListener("click", () => {
  passwordInput.value = generatePassword();
  setPasswordVisible(true);
  render();
});

document.querySelector("#restart").addEventListener("click", () => {
  form.reset();
  touched.clear();
  setPasswordVisible(false);
  success.hidden = true;
  form.hidden = false;
  render();
  form.elements.username.focus();
});

render();
