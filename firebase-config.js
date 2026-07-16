/**
 * ============================================================================
 *  TERMÓMETRO DE LA FINAL — Configuración de Firebase
 * ============================================================================
 *
 *  Este archivo conecta la app con tu proyecto de Firebase (Firestore).
 *  Seguí estos pasos ANTES de abrir index.html:
 *
 *  1) CREAR EL PROYECTO
 *     - Entrá a https://console.firebase.google.com/
 *     - "Agregar proyecto" → ponele un nombre (ej: "termometro-final-2026")
 *     - Podés desactivar Google Analytics, no hace falta para este caso de uso.
 *
 *  2) CREAR LA APP WEB
 *     - Dentro del proyecto: ícono "</>" (Agregar app → Web)
 *     - Ponele un apodo (ej: "termometro-web") y registrala.
 *     - Firebase te va a mostrar un objeto `firebaseConfig` con claves como
 *       apiKey, authDomain, projectId, etc. Copiá esos valores y pegalos
 *       reemplazando los placeholders de FIREBASE_CONFIG más abajo.
 *
 *  3) HABILITAR FIRESTORE
 *     - En el menú lateral: "Compilación" → "Firestore Database"
 *     - "Crear base de datos"
 *     - Elegí una ubicación (ej: la más cercana a tu audiencia, ej. southamerica-east1)
 *     - Empezá en "modo producción" (las reglas las configuramos manualmente abajo).
 *
 *  4) REGLAS DE SEGURIDAD (Firestore → pestaña "Reglas")
 *     Reemplazá el contenido por esto y publicá:
 *
 *       rules_version = '2';
 *       service cloud.firestore {
 *         match /databases/{database}/documents {
 *           match /votos/{votoId} {
 *             allow read: if true;
 *             // Solo permitimos crear documentos (no editar ni borrar),
 *             // y validamos la forma básica del voto para evitar basura.
 *             allow create: if request.resource.data.keys().hasAll(
 *                              ['emotion_id', 'value', 'moment', 'timestamp']
 *                            )
 *                            && request.resource.data.emotion_id is string
 *                            && request.resource.data.value is number
 *                            && request.resource.data.moment is string;
 *             allow update, delete: if false;
 *           }
 *         }
 *       }
 *
 *     NOTA: `allow read, write: if true` a secas también funciona (y es lo más
 *     simple) porque esta app es de voto anónimo, sin datos sensibles ni
 *     autenticación. La versión de arriba es un poco más estricta (evita que
 *     cualquiera edite/borre votos ajenos) pero ambas son aceptables para este
 *     caso de uso público.
 *
 *  5) CREAR LA COLECCIÓN
 *     - No hace falta crearla a mano: en cuanto se emita el primer voto desde
 *       la app, Firestore crea automáticamente la colección `votos`.
 *
 *  6) PEGAR LAS CREDENCIALES
 *     - Reemplazá cada "REEMPLAZAR_..." de FIREBASE_CONFIG por el valor real
 *       que te dio Firebase en el paso 2.
 *
 * ============================================================================
 */

export const FIREBASE_CONFIG = {
  apiKey: "REEMPLAZAR_API_KEY",
  authDomain: "REEMPLAZAR_PROJECT_ID.firebaseapp.com",
  projectId: "REEMPLAZAR_PROJECT_ID",
  storageBucket: "REEMPLAZAR_PROJECT_ID.appspot.com",
  messagingSenderId: "REEMPLAZAR_SENDER_ID",
  appId: "REEMPLAZAR_APP_ID",
};
