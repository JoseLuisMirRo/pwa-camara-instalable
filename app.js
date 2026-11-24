// app.js
// Instalabilidad (beforeinstallprompt + guía iOS) y acceso ético a cámara frontal/trasera.
// Sin async/await: toda la asincronía con .then() / .catch() / .finally().

const btnInstalar = document.getElementById('btn-instalar');
const guiaIOS = document.getElementById('instrucciones-ios');
const visorVideo = document.getElementById('visor-camara');
const visorVacio = document.getElementById('visor-vacio');
const mensajeEstado = document.getElementById('mensaje-estado');
const avisoPermiso = document.getElementById('aviso-permiso');
const avisoLente = document.getElementById('aviso-lente');
const btnPrepararCamara = document.getElementById('btn-preparar-camara');
const btnConfirmarPermiso = document.getElementById('btn-confirmar-permiso');
const btnCancelarPermiso = document.getElementById('btn-cancelar-permiso');
const btnAlternarCamara = document.getElementById('btn-alternar-camara');
const btnApagarCamara = document.getElementById('btn-apagar-camara');

/* ======================================================
   FASE 1: INSTALABILIDAD
   ====================================================== */

/* ---------- Service Worker (requisito para instalar) ---------- */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then((registro) => {
      console.log('[SW] Registrado con scope:', registro.scope);
    })
    .catch((error) => {
      console.error('[SW] Error al registrar:', error);
    });
}

/* ---------- Fragmento B: capturar el evento de instalación (Android/Chrome) ---------- */

let eventoInstalacionDiferido = null;

window.addEventListener('beforeinstallprompt', (event) => {
  // Evita que el mini-banner automático aparezca antes de tiempo
  event.preventDefault();
  eventoInstalacionDiferido = event;

  // Muestra el botón propio de instalación
  btnInstalar.hidden = false;
});

btnInstalar.addEventListener('click', () => {
  if (!eventoInstalacionDiferido) return;

  // Abre el diálogo nativo de instalación (solo se puede usar una vez por evento)
  eventoInstalacionDiferido.prompt();

  eventoInstalacionDiferido.userChoice
    .then((resultado) => {
      console.log('[Instalación] Respuesta del usuario:', resultado.outcome);
      if (resultado.outcome === 'accepted') {
        btnInstalar.hidden = true;
      }
    })
    .catch((error) => {
      console.error('[Instalación] Error en el diálogo:', error);
    })
    .finally(() => {
      // El evento ya se consumió; si el usuario rechazó, Chrome volverá a dispararlo más tarde
      eventoInstalacionDiferido = null;
    });
});

// Se dispara cuando la app quedó instalada (por el botón propio o por el menú del navegador)
window.addEventListener('appinstalled', () => {
  console.log('[Instalación] PWA instalada correctamente');
  btnInstalar.hidden = true;
  eventoInstalacionDiferido = null;
});

/* ---------- iOS: no existe beforeinstallprompt → guía manual ---------- */

function verificarEntornoIOS(){
  // iPadOS 13+ se presenta como "Macintosh"; se distingue por tener pantalla táctil
  const esIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const estaInstalada = window.navigator.standalone === true ||
                        window.matchMedia('(display-mode: standalone)').matches;

  // En iPhone y todavía dentro del navegador: mostrar los pasos manuales
  if (esIOS && !estaInstalada) {
    if (guiaIOS) guiaIOS.hidden = false;
  }
}

/* ======================================================
   FASE 2: CÁMARA CON PRE-PERMISO
   ====================================================== */

let streamActual = null;
let modoCamaraActual = 'environment'; // 'environment' = trasera | 'user' = frontal

function nombreLente(modo){
  return modo === 'environment' ? 'Trasera' : 'Frontal';
}

function actualizarMensajeEstado(texto){
  mensajeEstado.textContent = texto;
}

// Habilita o deshabilita los controles según si hay cámara encendida
function actualizarControles(camaraEncendida){
  btnAlternarCamara.disabled = !camaraEncendida;
  btnApagarCamara.disabled = !camaraEncendida;
  btnPrepararCamara.disabled = camaraEncendida;
  visorVacio.hidden = camaraEncendida;
}

/* ---------- Fragmento C: liberar el hardware ---------- */

function detenerCamaraActiva(){
  if (streamActual) {
    streamActual.getTracks().forEach((track) => {
      track.stop();
    });
    streamActual = null;
  }
}

/* ---------- Fragmento D: encender la cámara y diagnosticar errores ---------- */

function iniciarCamara(modo){
  // Siempre liberar el sensor anterior: iOS/Android no abren dos lentes a la vez
  detenerCamaraActiva();

  // getUserMedia solo existe en contextos seguros (HTTPS o localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    actualizarMensajeEstado('Este navegador no permite acceder a la cámara. Abre la app desde HTTPS.');
    actualizarControles(false);
    return Promise.resolve();
  }

  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  actualizarMensajeEstado(`Encendiendo cámara ${nombreLente(modo).toLowerCase()}...`);
  btnAlternarCamara.disabled = true; // evita doble clic mientras se abre el sensor

  return navigator.mediaDevices.getUserMedia(restricciones)
    .then((stream) => {
      streamActual = stream;
      visorVideo.srcObject = stream;
      visorVideo.classList.toggle('espejo', modo === 'user');
      actualizarControles(true);
      actualizarMensajeEstado(`Cámara activa (${nombreLente(modo)})`);
    })
    .catch((error) => {
      visorVideo.srcObject = null;
      actualizarControles(false);

      if (error.name === 'NotAllowedError') {
        actualizarMensajeEstado('Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador.');
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        actualizarMensajeEstado('No se detectó el sensor de cámara solicitado en este dispositivo.');
      } else if (error.name === 'NotReadableError') {
        actualizarMensajeEstado('La cámara está ocupada por otra aplicación o no se liberó a tiempo. Intenta de nuevo.');
      } else {
        actualizarMensajeEstado(`Error al acceder al hardware: ${error.message}`);
      }
    });
}

/* ---------- Fragmento E: flujo de consentimiento previo ---------- */

// Paso 1: "Solicitar Acceso a Cámara" -> solo se muestra el aviso explicativo
btnPrepararCamara.addEventListener('click', () => {
  avisoLente.textContent = nombreLente(modoCamaraActual).toLowerCase();
  avisoPermiso.hidden = false;
  avisoPermiso.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// Paso 2: "Aceptar y Encender Cámara" -> ahora sí se pide el permiso nativo
btnConfirmarPermiso.addEventListener('click', () => {
  avisoPermiso.hidden = true;
  iniciarCamara(modoCamaraActual);
});

// El usuario decide no continuar: no se llama a getUserMedia, así nunca se bloquea el permiso
btnCancelarPermiso.addEventListener('click', () => {
  avisoPermiso.hidden = true;
  actualizarMensajeEstado('Cámara apagada. Puedes activarla cuando quieras.');
});

/* ---------- Alternar lente ---------- */

btnAlternarCamara.addEventListener('click', () => {
  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  iniciarCamara(modoCamaraActual);
});

/* ---------- Apagar ---------- */

btnApagarCamara.addEventListener('click', () => {
  detenerCamaraActiva();
  visorVideo.srcObject = null;
  visorVideo.classList.remove('espejo');
  actualizarControles(false);
  actualizarMensajeEstado('Cámara apagada. El sensor fue liberado.');
});

// Si el usuario cambia de app o bloquea el teléfono, se libera el sensor
document.addEventListener('visibilitychange', () => {
  if (document.hidden && streamActual) {
    detenerCamaraActiva();
    visorVideo.srcObject = null;
    actualizarControles(false);
    actualizarMensajeEstado('Cámara apagada al salir de la app. Vuelve a encenderla cuando quieras.');
  }
});

/* ---------- Inicio ---------- */

verificarEntornoIOS();
actualizarControles(false);
