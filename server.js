// server.js
const express = require('express');
const mongoose = require('mongoose'); 
const cors = require('cors'); 
const app = express();

// Import route modules
const orderRoutes = require('./routes/orderRoutes'); 
const inquiryRoutes = require('./routes/inquiryRoutes'); 
const adminProductRoutes = require('./routes/adminProductRoutes'); 
const publicProductRoutes = require('./routes/publicProductRoutes'); // Import public product routes

const port = process.env.PORT || 3001; 
const SENDER_EMAIL_USER = process.env.SENDER_EMAIL_USER; 
const SENDER_EMAIL_PASS = process.env.SENDER_EMAIL_PASS; 
const OWNER_EMAIL = process.env.OWNER_EMAIL;       
const COMPANY_NAME = 'Gamma Ortho Instruments';

// --- Environment Variables for CORS ---
const CUSTOMER_FRONTEND_URL = process.env.FRONTEND_URL; 
const ADMIN_FRONTEND_URL = process.env.ADMIN_FRONTEND_URL; 

console.log("--------------------------------------------------");
console.log("Backend Server Starting...");
console.log("PORT from env:", process.env.PORT, "Effective port:", port);
console.log("CUSTOMER_FRONTEND_URL for CORS (from env):", CUSTOMER_FRONTEND_URL);
console.log("ADMIN_FRONTEND_URL for CORS (from env):", ADMIN_FRONTEND_URL);
console.log("MONGODB_URI configured:", process.env.MONGODB_URI ? "Yes" : "No - Database connection will fail!");
console.log("SENDER_EMAIL_USER configured:", SENDER_EMAIL_USER ? "Yes" : "No - Email sending will fail if credentials missing");
console.log("OWNER_EMAIL configured:", OWNER_EMAIL ? "Yes" : "No - Owner emails will fail if missing");

// --- Construct allowedOrigins array ---
const allowedOrigins = [];
if (CUSTOMER_FRONTEND_URL) {
    allowedOrigins.push(CUSTOMER_FRONTEND_URL.trim());
    console.log(`Added CUSTOMER_FRONTEND_URL to allowedOrigins: ${CUSTOMER_FRONTEND_URL.trim()}`);
} else {
    console.warn("CUSTOMER_FRONTEND_URL (env.FRONTEND_URL) is not set.");
}
if (ADMIN_FRONTEND_URL) {
    allowedOrigins.push(ADMIN_FRONTEND_URL.trim());
    console.log(`Added ADMIN_FRONTEND_URL to allowedOrigins: ${ADMIN_FRONTEND_URL.trim()}`);
} else {
    console.warn("ADMIN_FRONTEND_URL is not set.");
}

console.log("Final allowedOrigins list:", allowedOrigins);
console.log("--------------------------------------------------");


// --- Database Connection ---
if (!process.env.MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI environment variable is not set. Server cannot start without database connection string.");
    process.exit(1); 
} else {
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => console.log('Successfully connected to MongoDB database via Mongoose.'))
      .catch(err => {
        console.error('MongoDB connection error:', err.message);
        console.error('Full MongoDB connection error object:', err);
        process.exit(1); 
      });
    
    mongoose.connection.on('error', err => {
        console.error('MongoDB runtime error:', err);
    });
}

// --- Configure CORS ---
const corsOptions = {
  origin: function (origin, callback) {
    console.log(`CORS Middleware: Request from origin: ${origin}. Allowed list: [${allowedOrigins.join(', ')}]`);
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.length === 0) { 
      console.log(`CORS Middleware: Origin ${origin} ALLOWED.`);
      callback(null, true);
    } else {
      console.error(`CORS Middleware: Origin ${origin} DENIED.`);
      callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", 
  allowedHeaders: ['Content-Type', 'Authorization'], 
  credentials: true, 
  optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); 


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (SENDER_EMAIL_USER && SENDER_EMAIL_PASS) {
    console.log("Nodemailer credentials are set for emailService.");
} else {
    console.warn("Email credentials not found. Email sending will be disabled via emailService.");
}

// --- API Routes ---
app.use('/api/orders', orderRoutes);       
app.use('/api/inquiry', inquiryRoutes);    
app.use('/api/admin/products', adminProductRoutes); 
app.use('/api/products', publicProductRoutes); // <-- MOUNTED PUBLIC PRODUCT ROUTES

// Test route
app.get('/api/test', (req, res) => {
  console.log("GET request to /api/test received from origin:", req.headers.origin);
  const dbState = mongoose.connection.readyState;
  let dbStatus = 'Disconnected';
  if (dbState === 1) dbStatus = 'Connected';
  if (dbState === 2) dbStatus = 'Connecting';
  if (dbState === 3) dbStatus = 'Disconnecting';
  res.json({ message: `Hello from ${COMPANY_NAME} Backend! DB Status: ${dbStatus}` });
});

// --- Start the Server ---
app.listen(port, () => {
  console.log(`${COMPANY_NAME} backend server running on http://localhost:${port} (or Render assigned port)`);
});
