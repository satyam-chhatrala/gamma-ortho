// server.js
const express = require('express');
const mongoose = require('mongoose'); // Import Mongoose
const cors = require('cors'); 
const app = express();

// Import route modules
const orderRoutes = require('./routes/orderRoutes'); 
const inquiryRoutes = require('./routes/inquiryRoutes'); 
const adminProductRoutes = require('./routes/adminProductRoutes'); 

const port = process.env.PORT || 3001; 
const SENDER_EMAIL_USER = process.env.SENDER_EMAIL_USER; 
const SENDER_EMAIL_PASS = process.env.SENDER_EMAIL_PASS; 
const OWNER_EMAIL = process.env.OWNER_EMAIL;       
const COMPANY_NAME = 'Gamma Ortho Instruments';
const FRONTEND_URL = process.env.FRONTEND_URL; 
const MONGODB_URI = process.env.MONGODB_URI; // For MongoDB connection string

console.log("--------------------------------------------------");
console.log("Backend Server Starting...");
console.log("PORT from env:", process.env.PORT, "Effective port:", port);
console.log("FRONTEND_URL for CORS (from env):", FRONTEND_URL);
console.log("MONGODB_URI configured:", MONGODB_URI ? "Yes" : "No - Database connection will fail!");
console.log("SENDER_EMAIL_USER configured:", SENDER_EMAIL_USER ? "Yes" : "No - Email sending will fail if credentials missing");
console.log("OWNER_EMAIL configured:", OWNER_EMAIL ? "Yes" : "No - Owner emails will fail if missing");
console.log("--------------------------------------------------");

// --- Database Connection ---
if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI environment variable is not set. Server cannot start without database connection string.");
    process.exit(1); // Exit if DB connection string is critical and not set
} else {
    mongoose.connect(MONGODB_URI, {
        // useNewUrlParser: true, // No longer needed since Mongoose 6+
        // useUnifiedTopology: true, // No longer needed since Mongoose 6+
        // useCreateIndex: true, // No longer supported
        // useFindAndModify: false // No longer supported
    })
      .then(() => console.log('Successfully connected to MongoDB database via Mongoose.'))
      .catch(err => {
        console.error('MongoDB connection error:', err.message);
        console.error('Full MongoDB connection error object:', err);
        process.exit(1); // Exit if DB connection fails on startup
      });
    
    mongoose.connection.on('error', err => {
        console.error('MongoDB runtime error:', err);
    });
}

// Configure CORS
if (!FRONTEND_URL) {
    console.warn("WARNING: FRONTEND_URL environment variable is not set on the hosting platform. CORS might be too permissive or fail in production.");
    app.use(cors()); 
    app.options('*', cors()); 
    console.log("CORS configured to allow all origins due to missing FRONTEND_URL.");
} else {
    const corsOptions = {
      origin: FRONTEND_URL, 
      optionsSuccessStatus: 200 
    };
    app.use(cors(corsOptions));
    app.options('/api/orders/place-order', cors(corsOptions)); 
    app.options('/api/inquiry/submit', cors(corsOptions));
    app.options('/api/admin/products', cors(corsOptions)); 
    app.options('/api/admin/products/:id', cors(corsOptions)); 
    console.log(`CORS configured to allow origin: ${FRONTEND_URL}`);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Nodemailer Transporter (Logic is in emailService.js, this is just a log)
if (SENDER_EMAIL_USER && SENDER_EMAIL_PASS) {
    console.log("Nodemailer credentials are set for emailService.");
} else {
    console.warn("Email credentials not found. Email sending will be disabled via emailService.");
}

// --- API Routes ---
app.use('/api/orders', orderRoutes);       
app.use('/api/inquiry', inquiryRoutes);    
app.use('/api/admin/products', adminProductRoutes); 

// Test route
app.get('/api/test', (req, res) => {
  console.log("GET request to /api/test received");
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
