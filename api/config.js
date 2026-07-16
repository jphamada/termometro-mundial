export default function handler(req, res) {
  // Retornamos las credenciales desde las variables de entorno de Vercel
  res.status(200).json({
    apiKey: process.env.FIREBASE_API_KEY || "REEMPLAZAR_API_KEY",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || ""
  });
}
