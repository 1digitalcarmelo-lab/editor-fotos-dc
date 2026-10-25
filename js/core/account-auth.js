// Formularios y control de acceso compartidos por las apps estáticas de Digital Carmelo.
// Las credenciales del cliente son públicas; el permiso se consulta a la RPC de Apps Core.
import { canAccessProduct, getProductAccess } from './product-access.js';

export function createProductAuth({
  supabase, productSlug, returnUrl, authTitle, whatsappUrl,
  injectStyles, mountAccountMenu, onAuthorized = async () => {},
}) {
const PRODUCT_SLUG = productSlug;
const AUTH_RETURN_URL = returnUrl;
const SUITE_URL = "https://suite.digitalcarmelo.com/";
const WHATSAPP_URL = whatsappUrl;
let root = document.getElementById("dc-auth-root");
if (!root) {
  root = document.createElement("div");
  root.id = "dc-auth-root";
  document.body.prepend(root);
}
let authorizationRun = 0;
let documentUserId = null;
let documentInvalidated = false;
const SIGNOUT_INTENT = `dc_${productSlug}_signed_out`;
try { sessionStorage.removeItem("dc_plan"); } catch { /* sin almacenamiento */ }
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[ch]);

function clearApplicationAuth() {
  documentInvalidated ||= Boolean(documentUserId);
  authorizationRun += 1;
  delete window.DC_ACCESS_STATE;
  delete window.DC_PRODUCT_ACCESS;
  delete window.DC_AUTH_CONTEXT;
  document.body.classList.add("dc-auth-pending");
  document.body.classList.remove("dc-sidebar-active", "dc-sidebar-expanded");
  document.querySelector(".dc-account")?.remove();
  document.querySelectorAll('dialog[open]').forEach(dialog => {
    dialog.close?.();
    dialog.remove();
  });
  document.getElementById("app")?.replaceChildren();
  window.dispatchEvent(new Event("dc:auth-cleared"));
}

async function unlockApp(email, run) {
  const isCurrent = () => run === authorizationRun && !passwordRecoveryActive && !documentInvalidated &&
    window.DC_AUTH_CONTEXT?.userId === documentUserId;
  try {
    await onAuthorized(window.DC_AUTH_CONTEXT, isCurrent);
  } catch (error) {
    console.error("No pudimos cargar la herramienta:", error);
    if (isCurrent()) {
      clearApplicationAuth();
      renderLogin("Tu acceso fue validado, pero no pudimos cargar la herramienta. Recarga la página.", email);
    }
    return false;
  }
  if (!isCurrent()) return false;
  document.body.classList.remove("dc-auth-pending");
  root.replaceChildren();
  root.style.display = "none";
  mountAccountMenu(email);
  return true;
}

const EYE_ICON = `
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;

function passwordField({
  id,
  label,
  autocomplete,
}) {
  return `
    <label
      class="dc-auth-label"
      for="${id}"
    >
      ${label}
    </label>

    <div class="dc-password-wrap">
      <input
        class="dc-auth-input"
        id="${id}"
        type="password"
        autocomplete="${autocomplete}"
        ${autocomplete === "current-password" ? "" : 'minlength="8"'}
        required
      >

      <button
        type="button"
        class="dc-password-toggle"
        data-password-toggle="${id}"
        aria-label="Mostrar contraseña"
        title="Mostrar contraseña"
      >
        ${EYE_ICON}
      </button>
    </div>
  `;
}

function authActions(content) {
  return `
    <div
      style="
        display:flex;
        justify-content:center;
        align-items:center;
        flex-wrap:wrap;
        gap:8px 14px;
        margin-top:18px;
      "
    >
      ${content}
    </div>
  `;
}

function authScreen({
  title,
  copy,
  form,
  actions = "",
}) {
    document.body.classList.add(
    "dc-auth-pending"
  );

  root.style.display = "block";

  root.innerHTML = `
    <div class="dc-auth-screen">
      <div class="dc-auth-card">

        <p class="dc-auth-eyebrow">
          DIGITAL CARMELO · SUITE POTENCIADORA
        </p>

        <h1 class="dc-auth-title">
          ${title}
        </h1>

        <p class="dc-auth-copy">
          ${copy}
        </p>

        ${form}

        ${actions}

        <a
  class="dc-auth-link"
  href="${SUITE_URL}"
  style="
    display:block;
    text-align:center;
  "
>
  ← Volver a la Suite
</a>

      </div>
    </div>
  `;
}

function setAuthMessage(
  message,
  type = "error"
) {
  const box =
    document.getElementById(
      "dc-auth-message"
    );

  if (!box) return;

  box.textContent = message;
  box.hidden = !message;

  const success =
    type === "success";

  box.style.color =
    success
      ? "#baf4cc"
      : "";

  box.style.borderColor =
    success
      ? "rgba(80,200,120,.45)"
      : "";

  box.style.background =
    success
      ? "rgba(40,150,80,.12)"
      : "";
}

function bindPasswordControls() {
  const toggles =
    document.querySelectorAll(
      "[data-password-toggle]"
    );

  toggles.forEach((toggle) => {
    toggle.addEventListener(
      "click",
      () => {
        const input =
          document.getElementById(
            toggle.dataset.passwordToggle
          );

        if (!input) return;

        const showing =
          input.type === "text";

        input.type =
          showing
            ? "password"
            : "text";

        const label =
          showing
            ? "Mostrar contraseña"
            : "Ocultar contraseña";

        toggle.setAttribute(
          "aria-label",
          label
        );

        toggle.setAttribute(
          "title",
          label
        );
      }
    );
  });

  const passwordInputs =
    document.querySelectorAll(
      '.dc-password-wrap input[type="password"], .dc-password-wrap input[type="text"]'
    );

  const capsWarning =
    document.getElementById(
      "dc-caps-warning"
    );

  const updateCapsWarning =
    (event) => {
      if (
        !capsWarning ||
        typeof event.getModifierState !==
          "function"
      ) {
        return;
      }

      capsWarning.hidden =
        !event.getModifierState(
          "CapsLock"
        );
    };

  passwordInputs.forEach((input) => {
    input.addEventListener(
      "keydown",
      updateCapsWarning
    );

    input.addEventListener(
      "keyup",
      updateCapsWarning
    );

    input.addEventListener(
      "blur",
      () => {
        if (capsWarning) {
          capsWarning.hidden = true;
        }
      }
    );
  });
}

function capsWarning() {
  return `
    <p
      id="dc-caps-warning"
      class="dc-auth-error"
      hidden
      style="margin-top:10px"
    >
      ¡OJO! Bloq Mayús activado.
    </p>
  `;
}

function messageBox() {
  return `
    <div
      class="dc-auth-error"
      id="dc-auth-message"
      hidden
    ></div>
  `;
}

/* =========================================================
   INGRESAR
========================================================= */

function renderLogin(
  message = "",
  savedEmail = "",
  messageType = "error"
) {
  if (!root) return;

  authScreen({
    title: authTitle,

    copy:
      "Ingresa con el email y la contraseña asociados a tu cuenta de Digital Carmelo.",

    form: `
      <form id="dc-auth-form">

        <label
          class="dc-auth-label"
          for="dc-auth-email"
        >
          Email
        </label>

        <input
          class="dc-auth-input"
          id="dc-auth-email"
          type="email"
          autocomplete="email"
          required
        >

        ${passwordField({
          id: "dc-auth-password",
          label: "Contraseña",
          autocomplete:
            "current-password",
        })}

        ${capsWarning()}

        <button
          class="dc-auth-button"
          id="dc-auth-submit"
          type="submit"
        >
          Ingresar
        </button>

        ${messageBox()}

      </form>
    `,

        actions: `
      <div
        style="
          margin-top:22px;
          text-align:center;
        "
      >
        <a
          href="#"
          class="dc-auth-link"
          id="dc-auth-forgot"
          style="
            margin-top:0;
            font-size:16px;
            font-weight:800;
          "
        >
          ¿Olvidaste tu contraseña?
        </a>

        <p
          style="
            margin:26px 0 12px;
            color:#ffffff;
            font-size:15px;
          "
        >
          ¿Es tu primera vez en Digital Carmelo?
        </p>

        <a
          href="#"
          id="dc-auth-create"
          style="
            width:100%;
            min-height:52px;
            display:flex;
            align-items:center;
            justify-content:center;
            border:1px solid rgba(212,162,76,.65);
            border-radius:14px;
            color:#f2d188;
            font-size:16px;
            font-weight:800;
            text-decoration:none;
            box-sizing:border-box;
          "
        >
          Crear mi cuenta gratis
        </a>
      </div>
    `,
  });

  const emailInput =
    document.getElementById(
      "dc-auth-email"
    );

  emailInput.value =
    savedEmail;

  bindPasswordControls();

  setAuthMessage(
    message,
    messageType
  );

  document
    .getElementById(
      "dc-auth-create"
    )
    ?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        renderCreateAccount(
          emailInput.value.trim()
        );
      }
    );

  document
    .getElementById(
      "dc-auth-forgot"
    )
    ?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        renderForgotPassword(
          emailInput.value.trim()
        );
      }
    );

  document
    .getElementById(
      "dc-auth-form"
    )
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const email =
          emailInput.value.trim();

        const password =
          document.getElementById(
            "dc-auth-password"
          ).value;

        const button =
          document.getElementById(
            "dc-auth-submit"
          );

        button.disabled = true;
        button.textContent =
          "Ingresando...";

        authorizationRun += 1; // El ingreso explícito cancela el intento SSO anterior.
        const { error } =
          await supabase.auth
            .signInWithPassword({
              email,
              password,
            });

        if (error) {
          button.disabled = false;
          button.textContent =
            "Ingresar";

          setAuthMessage(
            "No pudimos iniciar sesión. Revisa el email y la contraseña."
          );

          return;
        }

        try { sessionStorage.removeItem(SIGNOUT_INTENT); } catch { /* sin persistencia */ }
        await checkAccess();
      }
    );
}

/* =========================================================
   CREAR CUENTA
========================================================= */

function renderCreateAccount(
  savedEmail = ""
) {
  if (!root) return;
  authorizationRun += 1;

  authScreen({
    title: "Crear mi cuenta",

    copy:
      "Crea tu cuenta gratis para guardar tus proyectos y continuar cuando quieras.",

    form: `
      <form id="dc-create-form">

        <label
          class="dc-auth-label"
          for="dc-create-email"
        >
          Email
        </label>

        <input
          class="dc-auth-input"
          id="dc-create-email"
          type="email"
          autocomplete="email"
          required
        >

        ${passwordField({
          id: "dc-create-password",
          label: "Contraseña",
          autocomplete:
            "new-password",
        })}

        ${passwordField({
          id: "dc-create-confirm",
          label:
            "Confirma tu contraseña",
          autocomplete:
            "new-password",
        })}

        ${capsWarning()}

        <button
          class="dc-auth-button"
          id="dc-create-submit"
          type="submit"
        >
          Crear cuenta
        </button>

        ${messageBox()}

      </form>
    `,

    actions: authActions(`
      <a
        href="#"
        class="dc-auth-link"
        id="dc-back-login"
      >
        Ya tengo una cuenta
      </a>
    `),
  });

  const emailInput =
    document.getElementById(
      "dc-create-email"
    );

  emailInput.value =
    savedEmail;

  bindPasswordControls();

  document
    .getElementById(
      "dc-back-login"
    )
    ?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        renderLogin(
          "",
          emailInput.value.trim()
        );
      }
    );

  document
    .getElementById(
      "dc-create-form"
    )
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const email =
          emailInput.value.trim();

        const password =
          document.getElementById(
            "dc-create-password"
          ).value;

        const confirmation =
          document.getElementById(
            "dc-create-confirm"
          ).value;

        if (
          password !==
          confirmation
        ) {
          setAuthMessage(
            "Las contraseñas no coinciden."
          );

          document
            .getElementById(
              "dc-create-confirm"
            )
            .focus();

          return;
        }

        const button =
          document.getElementById(
            "dc-create-submit"
          );

        button.disabled = true;
        button.textContent =
          "Creando cuenta...";

        const {
          data,
          error,
        } =
          await supabase.auth
            .signUp({
              email,
              password,
              options: {
                emailRedirectTo:
                  AUTH_RETURN_URL,
              },
            });

        if (error) {
          button.disabled = false;
          button.textContent =
            "Crear cuenta";

          setAuthMessage(
            "No pudimos crear la cuenta. Revisa los datos o intenta nuevamente."
          );

          return;
        }

        if (data.session) {
          await checkAccess();
          return;
        }

        renderLogin(
          "Cuenta creada. Revisa tu correo para confirmar el registro y luego ingresa.",
          email,
          "success"
        );
      }
    );
}

/* =========================================================
   OLVIDÉ MI CONTRASEÑA
========================================================= */

function renderForgotPassword(
  savedEmail = ""
) {
  if (!root) return;
  authorizationRun += 1;

  authScreen({
    title: "Recuperar contraseña",

    copy:
      "Escribe tu email y te enviaremos un enlace para crear una contraseña nueva.",

    form: `
      <form id="dc-forgot-form">

        <label
          class="dc-auth-label"
          for="dc-forgot-email"
        >
          Email
        </label>

        <input
          class="dc-auth-input"
          id="dc-forgot-email"
          type="email"
          autocomplete="email"
          required
        >

        <button
          class="dc-auth-button"
          id="dc-forgot-submit"
          type="submit"
        >
          Enviar enlace
        </button>

        ${messageBox()}

      </form>
    `,

    actions: authActions(`
      <a
        href="#"
        class="dc-auth-link"
        id="dc-forgot-back"
      >
        Volver al ingreso
      </a>
    `),
  });

  const emailInput =
    document.getElementById(
      "dc-forgot-email"
    );

  emailInput.value =
    savedEmail;

  document
    .getElementById(
      "dc-forgot-back"
    )
    ?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();

        renderLogin(
          "",
          emailInput.value.trim()
        );
      }
    );

  document
    .getElementById(
      "dc-forgot-form"
    )
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const email =
          emailInput.value.trim();

        const button =
          document.getElementById(
            "dc-forgot-submit"
          );

        button.disabled = true;
        button.textContent =
          "Enviando...";

        const { error } =
          await supabase.auth
            .resetPasswordForEmail(
              email,
              {
                redirectTo:
                  AUTH_RETURN_URL,
              }
            );

        button.disabled = false;
        button.textContent =
          "Enviar enlace";

        if (error) {
          setAuthMessage(
            "No pudimos enviar el enlace. Espera un momento e intenta nuevamente."
          );

          return;
        }

        setAuthMessage(
          "Si existe una cuenta con ese email, recibirás un enlace para crear una contraseña nueva.",
          "success"
        );
      }
    );
}

/* =========================================================
   CONTRASEÑA NUEVA
========================================================= */

function renderNewPassword() {
  if (!root) return;

  authScreen({
    title: "Crear contraseña nueva",

    copy:
      "Escribe y confirma la contraseña que usarás para ingresar.",

    form: `
      <form id="dc-new-password-form">

        ${passwordField({
          id: "dc-new-password",
          label:
            "Contraseña nueva",
          autocomplete:
            "new-password",
        })}

        ${passwordField({
          id: "dc-new-confirm",
          label:
            "Confirma tu contraseña",
          autocomplete:
            "new-password",
        })}

        ${capsWarning()}

        <button
          class="dc-auth-button"
          id="dc-new-password-submit"
          type="submit"
        >
          Guardar contraseña
        </button>

        ${messageBox()}

      </form>
    `,
  });

  bindPasswordControls();

  document
    .getElementById(
      "dc-new-password-form"
    )
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const password =
          document.getElementById(
            "dc-new-password"
          ).value;

        const confirmation =
          document.getElementById(
            "dc-new-confirm"
          ).value;

        if (
          password !==
          confirmation
        ) {
          setAuthMessage(
            "Las contraseñas no coinciden. Revísalas e intenta nuevamente."
          );

          document
            .getElementById(
              "dc-new-confirm"
            )
            .focus();

          return;
        }

        const button =
          document.getElementById(
            "dc-new-password-submit"
          );

        button.disabled = true;
        button.textContent =
          "Guardando...";

        const { error } =
          await supabase.auth
            .updateUser({
              password,
            });

        if (error) {
          button.disabled = false;
          button.textContent =
            "Guardar contraseña";

          setAuthMessage(
            "No pudimos guardar la contraseña. Abre nuevamente el enlace recibido por email."
          );

          return;
        }

        await supabase.auth.signOut();
        passwordRecoveryActive = false;
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        renderLogin(
          "Contraseña actualizada. Ya puedes ingresar.",
          "",
          "success"
        );
      }
    );
}

/* =========================================================
   HERRAMIENTA DISPONIBLE PARA SUMAR
========================================================= */

function renderLocked(email = "") {
  if (!root) return;

  root.style.display = "block";

  root.innerHTML = `
    <div class="dc-auth-screen">
      <div class="dc-auth-card dc-auth-center">

        <span class="dc-auth-lock">
          ✨
        </span>

        <p class="dc-auth-eyebrow">
          DIGITAL CARMELO · SUITE POTENCIADORA
        </p>

        <div class="dc-product-chip">
          ${escapeHtml(authTitle)}
        </div>

        <h1 class="dc-auth-title">
  Sigue creando
</h1>

<p class="dc-auth-copy">
  Esta herramienta también forma parte del ecosistema Digital Carmelo.
  Puedes incorporarla a tu cuenta cuando lo decidas y continuar creando
  con más posibilidades dentro de la Suite.
</p>

       <a
  href="${WHATSAPP_URL}"
  class="dc-auth-cta"
  target="_blank"
  rel="noopener noreferrer"
>
  Quiero seguir creando
</a>

        <a
          class="dc-auth-link"
          href="${SUITE_URL}"
        >
          ← Volver a la Suite
        </a>

        ${
          email
            ? `
              <p class="dc-auth-account">
                Cuenta: ${escapeHtml(email)}
              </p>
            `
            : ""
        }

        <a
          href="#"
          id="dc-auth-other-account"
          class="dc-auth-link"
        >
          Ingresar con otra cuenta
        </a>

      </div>
    </div>
  `;

  document
    .getElementById(
      "dc-auth-other-account"
    )
    ?.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        const { error } =
          await supabase.auth
            .signOut();

        if (error) {
          console.error(
            "Error cerrando sesión:",
            error
          );

          return;
        }

        renderLogin();
      }
    );
}
const SUITE_ORIGIN =
  "https://suite.digitalcarmelo.com";

const SUITE_AUTH_BRIDGE =
  `${SUITE_ORIGIN}/auth/bridge`;

async function getSuiteSession(expectedRun) {
  try {
    if (sessionStorage.getItem(SIGNOUT_INTENT) === "1") return null;
  } catch { return null; }
    if (
    window.location.origin !==
    new URL(AUTH_RETURN_URL).origin
  ) {
    return null;
  }
  return new Promise((resolve) => {
    const iframe =
      document.createElement("iframe");

    iframe.src = SUITE_AUTH_BRIDGE;
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");

    let finished = false;
    let timer = null;

    const cleanup = () => {
      window.removeEventListener(
        "message",
        onMessage
      );

      if (timer) {
        window.clearTimeout(timer);
      }

      iframe.remove();
    };

    const finish = (session) => {
      if (finished) return;

      finished = true;
      cleanup();
      resolve(session);
    };

    const onMessage = async (event) => {
      if (finished || expectedRun !== authorizationRun) { finish(null); return; }
      if (event.origin !== SUITE_ORIGIN) {
        return;
      }

      if (event.source !== iframe.contentWindow) {
        return;
      }

      if (
        event.data?.type ===
        "DC_AUTH_BRIDGE_READY"
      ) {
        iframe.contentWindow?.postMessage(
          {
            type: "DC_AUTH_REQUEST",
          },
          SUITE_ORIGIN
        );

        return;
      }

      if (
        event.data?.type !==
        "DC_AUTH_RESPONSE"
      ) {
        return;
      }

      const bridgeSession =
        event.data?.session;

      if (
        !bridgeSession?.access_token ||
        !bridgeSession?.refresh_token
      ) {
        finish(null);
        return;
      }

      const {
        data,
        error,
      } = await supabase.auth.setSession({
        access_token:
          bridgeSession.access_token,
        refresh_token:
          bridgeSession.refresh_token,
      });

      if (error) {
        console.error(
          "Error conectando sesión de la Suite:",
          error
        );

        finish(null);
        return;
      }

      finish(data.session ?? null);
    };

    window.addEventListener(
      "message",
      onMessage
    );

    timer = window.setTimeout(
      () => finish(null),
      5000
    );

    document.body.appendChild(iframe);
  });
}
/* =========================================================
   VERIFICAR ACCESO
========================================================= */

async function checkAccess() {
  if (documentInvalidated) {
    window.location.reload();
    return false;
  }
const run = ++authorizationRun;
let {
  data: { session },
  error: sessionError,
} =
  await supabase.auth
    .getSession();

if (sessionError) {
  console.error(
    "Error leyendo sesión local:",
    sessionError
  );
}
if (run !== authorizationRun || passwordRecoveryActive) return false;
if (!session) {
  renderLogin();
  session =
    await getSuiteSession(run);
}

if (run !== authorizationRun || passwordRecoveryActive) return false;

if (!session) {
  if (!document.getElementById("dc-auth-form")) renderLogin();
  return false;
}

  const { data, error } =
    await getProductAccess(supabase, PRODUCT_SLUG);

  if (run !== authorizationRun || passwordRecoveryActive) return false;

  if (error) {
    console.error(
      "Error verificando acceso:",
      error
    );

    clearApplicationAuth();
    renderLogin("No pudimos verificar el acceso. Intenta nuevamente.", session.user.email || "");
    return false;
  }

  const access =
    Array.isArray(data)
      ? data[0]
      : data;

  const allowed =
    canAccessProduct(access, { allowFree: true });
  if (passwordRecoveryActive) return false;
  if (allowed) {
  if (documentUserId && documentUserId !== session.user.id) {
    clearApplicationAuth();
    window.location.reload();
    return false;
  }
  documentUserId = session.user.id;
  window.DC_ACCESS_STATE = access.access_state;
  window.DC_PRODUCT_ACCESS = access;
  window.DC_AUTH_CONTEXT = {
    userId: session.user.id,
    email: session.user.email,
    access,
  };

  window.dispatchEvent(new CustomEvent("dc:auth-ready", {
    detail: { userId: session.user.id, email: session.user.email, access },
  }));
  return await unlockApp(session.user.email || "", run);
}

  clearApplicationAuth();
  renderLocked(session.user.email || "");
  return false;
}

const recoveryParams =
  new URLSearchParams(
    window.location.hash.slice(1)
  );

let passwordRecoveryActive =
  recoveryParams.get("type") ===
  "recovery";

supabase.auth.onAuthStateChange(
  (event, nextSession) => {
    if (event === "SIGNED_OUT") {
      try { sessionStorage.setItem(SIGNOUT_INTENT, "1"); } catch { /* ingreso manual disponible */ }
      clearApplicationAuth();
      // El formulario de recuperación presenta su propio resultado.
      if (!passwordRecoveryActive) {
        window.setTimeout(() => renderLogin(), 0);
      }
      return;
    }

    if (
      event === "SIGNED_IN" &&
      documentUserId &&
      (documentInvalidated || documentUserId !== nextSession?.user?.id)
    ) {
      clearApplicationAuth();
      // Un documento nuevo evita conservar cierres/temporizadores de la cuenta anterior.
      window.location.reload();
      return;
    }

    if (
      event !==
      "PASSWORD_RECOVERY"
    ) {
      return;
    }

    passwordRecoveryActive = true;
    clearApplicationAuth();

    window.setTimeout(
      () => {
        renderNewPassword();
      },
      0
    );
  }
);


injectStyles();
const layout = document.createElement("style");
layout.textContent = `
  body.dc-auth-pending #app,body.dc-auth-pending .brand-footer,body.dc-auth-pending .suite-promo{display:none!important}
  #dc-auth-root{position:fixed;inset:0;z-index:999999;width:100%;height:100vh;height:100dvh;overflow-y:auto;overscroll-behavior:contain}
  #dc-auth-root [hidden]{display:none!important}
  #dc-auth-root .dc-auth-screen{position:relative;inset:auto;min-height:100vh;min-height:100dvh;width:100%;box-sizing:border-box}
  .dc-auth-title-nowrap{white-space:nowrap}
  @media(max-height:760px){#dc-auth-root .dc-auth-screen{align-items:flex-start;padding-top:24px;padding-bottom:24px}}
`;
document.head.appendChild(layout);
if (passwordRecoveryActive) renderNewPassword();
return {
  requireAccess: checkAccess,
  getSupabase: () => supabase,
};
}

