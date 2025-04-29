// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors'); // Import CORS package
const app = express();

// Environment variables should be used for sensitive data in production
const port = process.env.PORT || 3001; 
const SENDER_EMAIL_USER = process.env.SENDER_EMAIL_USER; // e.g., your_app_email@gmail.com
const SENDER_EMAIL_PASS = process.env.SENDER_EMAIL_PASS; // Your email app password
const OWNER_EMAIL = process.env.OWNER_EMAIL;       // e.g., amit_chhatrala@yahoo.com
const COMPANY_NAME = 'Gamma Ortho Instruments';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:your_frontend_port'; // Your deployed frontend URL

// Middleware to parse JSON request bodies
app.use(express.json());

// Configure CORS
// For development, you might use app.use(cors());
// For production, restrict it to your frontend's domain:
app.use(cors({
  origin: FRONTEND_URL 
}));


// Nodemailer Transporter Configuration
let transporter;
if (SENDER_EMAIL_USER && SENDER_EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail', // Or your configured email provider
      auth: {
        user: SENDER_EMAIL_USER,
        pass: SENDER_EMAIL_PASS 
      }
    });
} else {
    console.warn("Email credentials not found in environment variables. Email sending will be disabled.");
    // Create a dummy transporter if no credentials to avoid crashing, but emails won't send
    transporter = {
        sendMail: () => Promise.resolve({ messageId: 'dummy-id-no-email-sent' }) // Mock sendMail
    };
}


// API Endpoint to Handle New Orders
app.post('/api/place-order', async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData || !orderData.orderItems || !orderData.customerEmail || !orderData.customerName) {
      return res.status(400).json({ message: 'Missing required order data.' });
    }
    if (!SENDER_EMAIL_USER || !SENDER_EMAIL_PASS) {
        console.error('Email service not configured. Cannot send order emails.');
        // Still save to DB if implemented, but inform client about email issue
        // For now, as DB is not implemented, we can just return an error or a specific message
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
      subject: `Your Order Confirmation from ${COMPANY_NAME} (#${Date.now().toString().slice(-6)})`, // Add a pseudo order ID
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

// --- Start the Server ---
app.listen(port, () => {
  console.log(`${COMPANY_NAME} backend server running on http://localhost:${port}`);
});
