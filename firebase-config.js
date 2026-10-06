/**
 * ============================================================================
 *  TERMÓMETRO DEL 10 — DESPEDIDA DE LIONEL MESSI
 *  Configuración de Conexión a Firebase (Firestore)
 * ============================================================================
 *
 *  Partido: Argentina vs. Benin
 *  Fecha: Martes 6 de Octubre
 *  Sede: Estadio Mas Monumental (River Plate)
 *
 *  Pasos para conectar tu base de datos:
 *
 *  1) CREAR PROYECTO EN FIREBASE
 *     - Ingresá a https://console.firebase.google.com/
 *     - Creá un proyecto (ej: "despedida-messi-termometro").
 *
 *  2) CREAR APP WEB
 *     - Dentro de tu proyecto, hacé click en el ícono de Web (</>).
 *     - Copiá los valores de `firebaseConfig` y pegalos abajo en FIREBASE_CONFIG.
 *
 *  3) HABILITAR FIRESTORE
 *     - En el menú lateral: Compilación -> Firestore Database.
 *     - Creá la base de datos (por ejemplo en modo de producción).
 *
 *  4) REGLAS DE SEGURIDAD (Pestaña "Reglas" en Firestore):
 *     Pegá lo siguiente y presioná "Publicar":
 *
 *       rules_version = '2';
 *       service cloud.firestore {
 *         match /databases/{database}/documents {
 *           match /votos_messi/{votoId} {
 *             allow read: if true;
 *             allow create: if request.resource.data.keys().hasAll(['emotion_id', 'value', 'timestamp'])
 *                           && request.resource.data.emotion_id in [
 *                                'tristeza_infinita',
 *                                'nostalgia_lagrimas',
 *                                'piel_gallina',
 *                                'gratitud_eterna',
 *                                'ganas_brindis',
 *                                'alegria_incontenible'
 *                              ]
 *                           && request.resource.data.value is number
 *                           && (!('message' in request.resource.data) || request.resource.data.message == null || request.resource.data.message is string);
 *             allow update, delete: if false;
 *           }
 *         }
 *       }
 *
 *  5) LISTO:
 *     - La app detectará automáticamente las credenciales.
 *     - Mientras no estén configuradas, la app funcionará en "Modo Simulación Local"
 *       permitiendo votar y ver todas las animaciones sin romperse.
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
