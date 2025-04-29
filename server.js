// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors'); // Import CORS package
const app = express();

// Environment variables should be used for sensitive data in production
const port = process.env.PORT || 3001; 
const SENDER_EMAIL_USER = process.env.SENDER_EMAIL_USER; 
const SENDER_EMAIL_PASS = process.env.SENDER_EMAIL_PASS; 
const OWNER_EMAIL = process.env.OWNER_EMAIL;       
const COMPANY_NAME = 'Gamma Ortho Instruments';
const FRONTEND_URL = process.env.FRONTEND_URL; // Will be read from Render environment

console.log("--------------------------------------------------");
console.log("Backend Server Starting...");
console.log("Attempting to configure CORS for origin:", FRONTEND_URL);
console.log("SENDER_EMAIL_USER configured:", SENDER_EMAIL_USER ? "Yes" : "No - Email sending will fail");
console.log("OWNER_EMAIL configured:", OWNER_EMAIL ? "Yes" : "No - Owner emails will fail");
console.log("--------------------------------------------------");


// Configure CORS
if (!FRONTEND_URL) {
    console.error("FATAL ERROR: FRONTEND_URL environment variable is not set. CORS will likely fail.");
}
const corsOptions = {
  origin: FRONTEND_URL, // Dynamically set from environment variable
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

// Middleware to parse JSON request bodies
app.use(express.json());

// Optional: Explicitly handle OPTIONS requests for the specific route if general CORS isn't enough
// This is often handled by the `cors` middleware itself, but can be added for explicitness.
app.options('/api/place-order', cors(corsOptions)); 


// Nodemailer Transporter Configuration
let transporter;
if (SENDER_EMAIL_USER && SENDER_EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail', 
      auth: {
        user: SENDER_EMAIL_USER,
        pass: SENDER_EMAIL_PASS 
      }
    });
    console.log("Nodemailer transporter configured successfully.");
} else {
    console.warn("Email credentials (SENDER_EMAIL_USER or SENDER_EMAIL_PASS) not found in environment variables. Email sending will be disabled.");
    transporter = {
        sendMail: () => {
            console.error("Dummy transporter: sendMail called, but emails are disabled due to missing credentials.");
            return Promise.resolve({ messageId: 'dummy-id-no-email-sent-due-to-missing-credentials' });
        }
    };
}


// API Endpoint to Handle New Orders
app.post('/api/place-order', async (req, res) => {
  console.log("Received POST request on /api/place-order");
  console.log("Request body:", req.body);
  try {
    const orderData = req.body;
    
    if (!orderData || !orderData.orderItems || !orderData.customerEmail || !orderData.customerName) {
      console.error("Validation Error: Missing required order data.");
      return res.status(400).json({ message: 'Missing required order data.' });
    }
    if (!SENDER_EMAIL_USER || !SENDER_EMAIL_PASS || !transporter.sendMail) { // Check if transporter is functional
        console.error('Email service not properly configured. Cannot send order emails.');
        return res.status(503).json({ message: 'Order received, but email notification service is currently unavailable.' });
    }

    // --- Prepare Email for Customer ---
    let customerEmailHtml = `
      <h1>Thank you for your order, ${orderData.customerName}!</h1>
      <p>We've received your order inquiry from ${COMPANY_NAME}. We will contact you shortly to confirm the details and proceed with your order.</p>
      <h2>Order Summary:</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
        <thead style="background-color: #f2f2f2;">
          <tr>
            <th style="text-align: left;">Product</th>
            <th style="text-align: left;">Dimension</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Base Price/Unit</th>
            <th style="text-align: right;">GST/Unit</th>
            <th style="text-align: right;">Total/Unit (Incl. GST)</th>
            <th style="text-align: right;">Subtotal (Incl. GST)</th>
          </tr>
        </thead>
        <tbody>
    `;
    orderData.orderItems.forEach(productGroup => {
        productGroup.variants.forEach(variant => {
            customerEmailHtml += `
              <tr>
                <td>${productGroup.baseProductName}</td>
                <td>${variant.dimension}</td>
                <td style="text-align: center;">${variant.quantity}</td>
                <td style="text-align: right;">${variant.basePrice.toFixed(2)} Rs</td>
                <td style="text-align: right;">${(variant.basePrice * variant.gstRate).toFixed(2)} Rs (${(variant.gstRate * 100).toFixed(0)}%)</td>
                <td style="text-align: right;">${variant.priceIncGst.toFixed(2)} Rs</td>
                <td style="text-align: right;">${(variant.priceIncGst * variant.quantity).toFixed(2)} Rs</td>
              </tr>
            `;
        });
    });
    customerEmailHtml += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6" style="text-align: right; font-weight: bold; padding-top: 10px;">Total Order Value:</td>
            <td style="font-weight: bold; text-align: right; padding-top: 10px;">${orderData.totalOrderValue}</td>
          </tr>
        </tfoot>
      </table>
      <h3>Your Details:</h3>
      <p>Name: ${orderData.customerName}</p>
      <p>Email: ${orderData.customerEmail}</p>
      <p>Mobile: ${orderData.mobileCode} ${orderData.mobileNumber}</p>
      ${orderData.whatsappNumber ? `<p>WhatsApp: ${orderData.whatsappCode} ${orderData.whatsappNumber}</p>` : ''}
      <p>Address: ${orderData.address}, ${orderData.city}, ${orderData.state}, ${orderData.pincode}, ${orderData.country}</p>
      <p>Thank you for choosing ${COMPANY_NAME}!</p>
    `;

    const customerMailOptions = {
      from: `"${COMPANY_NAME}" <${SENDER_EMAIL_USER}>`,
      to: orderData.customerEmail,
      subject: `Your Order Confirmation from ${COMPANY_NAME} (#${Date.now().toString().slice(-6)})`,
      html: customerEmailHtml
    };

    // --- Prepare Email for Owner/Manager ---
    let ownerEmailHtml = `
      <h1>New Order Received! (#${Date.now().toString().slice(-6)})</h1>
      <p>A new order inquiry has been placed on the ${COMPANY_NAME} website.</p>
      <h2>Customer Details:</h2>
      <p>Name: ${orderData.customerName}</p>
      <p>Email: ${orderData.customerEmail}</p>
      <p>Mobile: ${orderData.mobileCode} ${orderData.mobileNumber}</p>
      ${orderData.whatsappNumber ? `<p>WhatsApp: ${orderData.whatsappCode} ${orderData.whatsappNumber}</p>` : ''}
      <p>Address: ${orderData.address}</p>
      <p>City / District: ${orderData.city}</p>
      <p>State: ${orderData.state}</p>
      <p>Country: ${orderData.country}</p>
      <p>Pincode: ${orderData.pincode}</p>
      
      <h2>Order Items:</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
         <thead style="background-color: #f2f2f2;">
          <tr>
            <th style="text-align: left;">Product</th>
            <th style="text-align: left;">Dimension</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Base Price/Unit</th>
            <th style="text-align: right;">GST/Unit</th>
            <th style="text-align: right;">Total/Unit (Incl. GST)</th>
            <th style="text-align: right;">Subtotal (Incl. GST)</th>
          </tr>
        </thead>
        <tbody>
    `;
    orderData.orderItems.forEach(productGroup => {
        productGroup.variants.forEach(variant => {
            ownerEmailHtml += `
              <tr>
                <td>${productGroup.baseProductName}</td>
                <td>${variant.dimension}</td>
                <td style="text-align: center;">${variant.quantity}</td>
                <td style="text-align: right;">${variant.basePrice.toFixed(2)} Rs</td>
                <td style="text-align: right;">${(variant.basePrice * variant.gstRate).toFixed(2)} Rs (${(variant.gstRate * 100).toFixed(0)}%)</td>
                <td style="text-align: right;">${variant.priceIncGst.toFixed(2)} Rs</td>
                <td style="text-align: right;">${(variant.priceIncGst * variant.quantity).toFixed(2)} Rs</td>
              </tr>
            `;
        });
    });
    ownerEmailHtml += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6" style="text-align: right; font-weight: bold; padding-top: 10px;">Total Order Value:</td>
            <td style="font-weight: bold; text-align: right; padding-top: 10px;">${orderData.totalOrderValue}</td>
          </tr>
        </tfoot>
      </table>
      <p>Please follow up with the customer.</p>
    `;

    const ownerMailOptions = {
      from: `"${COMPANY_NAME} Website" <${SENDER_EMAIL_USER}>`,
      to: OWNER_EMAIL,
      subject: `New Order Inquiry - ${orderData.customerName} (#${Date.now().toString().slice(-6)})`,
      html: ownerEmailHtml
    };

    // --- Send Emails ---
    await Promise.all([
        transporter.sendMail(customerMailOptions),
        transporter.sendMail(ownerMailOptions)
    ]);
    
    console.log('Order emails sent successfully to customer and owner.');
    res.status(200).json({ message: 'Order placed successfully! Confirmation emails have been sent.' });

  } catch (error) {
    console.error('Error processing order or sending email:', error);
    res.status(500).json({ message: 'There was an error processing your order. Please try again later.' });
  }
});

// Test route
app.get('/api/test', (req, res) => {
  console.log("GET request to /api/test received");
  res.json({ message: 'Hello from Gamma Ortho Backend! CORS should be working if you see this from your frontend.' });
});


// --- Start the Server ---
app.listen(port, () => {
  console.log(`${COMPANY_NAME} backend server running on http://localhost:${port} (or Render assigned port)`);
  console.log(`CORS is configured to allow origin: ${FRONTEND_URL}`);
});
```

**Step 3: Commit Changes and Redeploy Backend**

1.  Go to your `gamma-ortho-backend` repository on GitHub.
2.  Edit `server.js` and replace its content with the code above.
3.  Commit the changes with a message like "Update CORS configuration and add logging."
4.  Render.com should automatically detect this change and start a new deployment. Monitor the "Events" and "Logs" on Render.
    * **Check Startup Logs on Render:** Look for the `console.log` messages:
        * `Backend Server Starting...`
        * `Attempting to configure CORS for origin: https://gammaortho.netlify.app` (This should show your correct Netlify URL if the environment variable is set).
        * `SENDER_EMAIL_USER configured: Yes/No`
        * `OWNER_EMAIL configured: Yes/No`
        * `Nodemailer transporter configured successfully.` (or the warning if credentials are missing)
        * `Gamma Ortho Instruments backend server running on ...`
        * `CORS is configured to allow origin: https://gammaortho.netlify.app`

**Step 4: Test Again Thoroughly**

1.  **Test `/api/test`:** Once Render shows your backend is live after the redeployment, first try accessing `https://your-render-backend-url.onrender.com/api/test` directly in your browser. It should work.
2.  **Test from Frontend:**
    * Open your live Netlify website (`https://gammaortho.netlify.app`).
    * Open browser developer tools (F12) -> Network tab and Console tab.
    * Try placing an order.
    * **Network Tab:**
        * You should first see an `OPTIONS` request to `/api/place-order`. It **must** have a `200 OK` or `204 No Content` status. If this fails, CORS is still the issue. Check its response headers for `Access-Control-Allow-Origin`.
        * Then you should see the `POST` request to `/api/place-order`.
    * **Console Tab (Frontend):** Look for any errors.
    * **Logs Tab (Render.com):** Now, you should see logs for the `/api/place-order` request if it reaches the server, including "Received POST request..." and any email sending logs or errors.

**If it still fails:**

* **Share the Render Startup Logs:** The first few lines printed when your server starts on Render are crucial, especially the `CORS Origin configured for:` line.
* **Share Browser Console Errors:** Any new errors.
* **Share Network Request Details:** For the failed `OPTIONS` or `POST` request, share the "Status", "Request Headers", and "Response Headers" (if any).

The `app.options('/api/place-order', cors(corsOptions));` line is added as an extra measure. The general `app.use(cors(corsOptions));` should usually handle preflight requests for all routes that come after it, but sometimes explicit handling can help in tricky situations or with certain hosting platforms.

Let's get those lo
