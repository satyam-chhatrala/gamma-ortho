// server.js
// REMOVED: require('dotenv').config(); 

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors'); 
const multer = require('multer'); // Added multer require for inquiry form
const app = express();

// Import route modules
const orderRoutes = require('./routes/orderRoutes'); // Ensure this line is present and correct
const inquiryRoutes = require('./routes/inquiryRoutes'); // Ensure this line is present and correct

// Environment variables are expected to be set by the hosting platform (e.g., Render.com)
const port = process.env.PORT || 3001; 
const SENDER_EMAIL_USER = process.env.SENDER_EMAIL_USER; 
const SENDER_EMAIL_PASS = process.env.SENDER_EMAIL_PASS; 
const OWNER_EMAIL = process.env.OWNER_EMAIL;       
const COMPANY_NAME = 'Gamma Ortho Instruments';
const FRONTEND_URL = process.env.FRONTEND_URL; 

console.log("--------------------------------------------------");
console.log("Backend Server Starting...");
console.log("PORT from env:", process.env.PORT, "Effective port:", port);
console.log("FRONTEND_URL for CORS (from env):", FRONTEND_URL);
console.log("SENDER_EMAIL_USER configured:", SENDER_EMAIL_USER ? "Yes" : "No - Email sending will fail if credentials missing");
console.log("OWNER_EMAIL configured:", OWNER_EMAIL ? "Yes" : "No - Owner emails will fail if missing");
console.log("--------------------------------------------------");


// Configure CORS
if (!FRONTEND_URL) {
    console.warn("WARNING: FRONTEND_URL environment variable is not set on the hosting platform. CORS might be too permissive or fail in production.");
    app.use(cors()); 
    app.options('*', cors()); // Handle preflight requests for all routes
    console.log("CORS configured to allow all origins due to missing FRONTEND_URL.");
} else {
    const corsOptions = {
      origin: FRONTEND_URL, 
      optionsSuccessStatus: 200 
    };
    app.use(cors(corsOptions));
    // Explicitly handle preflight for specific routes if needed, or rely on global
    app.options('/api/orders/place-order', cors(corsOptions)); 
    app.options('/api/inquiry/submit', cors(corsOptions));
    console.log(`CORS configured to allow origin: ${FRONTEND_URL}`);
}

// Middleware to parse JSON request bodies - This should come AFTER CORS middleware
app.use(express.json());
// Middleware to parse URL-encoded data (for form submissions not using FormData/JSON)
app.use(express.urlencoded({ extended: true }));


// Nodemailer Transporter Configuration (Moved to emailService.js, but keeping a reference for clarity if needed)
// The actual transporter is now initialized and used within emailService.js
// This section is more for conceptual understanding of where credentials are used.
if (SENDER_EMAIL_USER && SENDER_EMAIL_PASS) {
    console.log("Nodemailer credentials (SENDER_EMAIL_USER, SENDER_EMAIL_PASS) are set in environment.");
} else {
    console.warn("Email credentials (SENDER_EMAIL_USER or SENDER_EMAIL_PASS) not found. Email sending will be disabled via emailService.");
}


// --- API Routes ---
app.use('/api/orders', orderRoutes);       // Mount order routes
app.use('/api/inquiry', inquiryRoutes);    // Mount inquiry routes


// Test route (can be kept for basic server health check)
app.get('/api/test', (req, res) => {
  console.log("GET request to /api/test received");
  res.json({ message: `Hello from ${COMPANY_NAME} Backend! CORS should be working.` });
});


// --- Start the Server ---
app.listen(port, () => {
  console.log(`${COMPANY_NAME} backend server running on http://localhost:${port} (or Render assigned port)`);
});
