// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3001; // Port for your backend server

// Middleware to parse JSON request bodies from the frontend
app.use(express.json());

// --- Nodemailer Transporter Configuration ---
// IMPORTANT: For production, use a dedicated email service (SendGrid, Mailgun, etc.)
// Using Gmail for demonstration purposes only.
// You'll need to enable "Less secure app access" in your Gmail settings
// or, preferably, use an "App Password" if you have 2-Step Verification enabled.
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or your email provider
  auth: {
    user: 'YOUR_EMAIL@gmail.com',    // Your email address to send from
    pass: 'YOUR_EMAIL_PASSWORD_OR_APP_PASSWORD' // Your email password or App Password
  }
});

const OWNER_EMAIL = 'amit_chhatrala@yahoo.com'; // Owner's email address to receive notifications
const COMPANY_NAME = 'Gamma Ortho Instruments';

// --- API Endpoint to Handle New Orders ---
app.post('/api/place-order', async (req, res) => {
  try {
    const orderData = req.body;
    // Expected orderData structure from frontend:
    // {
    //   orderItems: [ { baseProductId, baseProductName, variants: [ {variantId, dimension, quantity, basePrice, gstRate, priceIncGst }, ... ] }, ... ],
    //   customerName, customerEmail, mobileCode, mobileNumber, whatsappCode, whatsappNumber,
    //   address, city, state, country, pincode,
    //   totalOrderValue // This should be the final total including GST
    // }

    if (!orderData || !orderData.orderItems || !orderData.customerEmail || !orderData.customerName) {
      return res.status(400).json({ message: 'Missing required order data.' });
    }

    // --- TODO: In a real application, save orderData to your database here ---

    // --- Prepare Email for Customer ---
    let customerEmailHtml = `
      <h1>Thank you for your order, ${orderData.customerName}!</h1>
      <p>We've received your order inquiry from ${COMPANY_NAME}. We will contact you shortly to confirm the details and proceed with your order.</p>
      <h2>Order Summary:</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th>Product</th>
            <th>Dimension</th>
            <th>Qty</th>
            <th>Base Price/Unit</th>
            <th>GST/Unit</th>
            <th>Total/Unit (Incl. GST)</th>
            <th>Subtotal (Incl. GST)</th>
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
                <td>${variant.quantity}</td>
                <td>${variant.basePrice.toFixed(2)} Rs</td>
                <td>${(variant.basePrice * variant.gstRate).toFixed(2)} Rs (${(variant.gstRate * 100).toFixed(0)}%)</td>
                <td>${variant.priceIncGst.toFixed(2)} Rs</td>
                <td>${(variant.priceIncGst * variant.quantity).toFixed(2)} Rs</td>
              </tr>
            `;
        });
    });
    customerEmailHtml += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6" style="text-align: right; font-weight: bold;">Total Order Value:</td>
            <td style="font-weight: bold;">${orderData.totalOrderValue} Rs</td>
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
      from: `"${COMPANY_NAME}" <YOUR_EMAIL@gmail.com>`,
      to: orderData.customerEmail,
      subject: `Your Order Confirmation from ${COMPANY_NAME}`,
      html: customerEmailHtml
    };

    // --- Prepare Email for Owner/Manager ---
    let ownerEmailHtml = `
      <h1>New Order Received!</h1>
      <p>A new order inquiry has been placed on the ${COMPANY_NAME} website.</p>
      <h2>Customer Details:</h2>
      <p>Name: ${orderData.customerName}</p>
      <p>Email: ${orderData.customerEmail}</p>
      <p>Mobile: ${orderData.mobileCode} ${orderData.mobileNumber}</p>
      ${orderData.whatsappNumber ? `<p>WhatsApp: ${orderData.whatsappCode} ${orderData.whatsappNumber}</p>` : ''}
      <p>Address: ${orderData.address}</p>
      <p>City/District: ${orderData.city}</p>
      <p>State: ${orderData.state}</p>
      <p>Country: ${orderData.country}</p>
      <p>Pincode: ${orderData.pincode}</p>
      
      <h2>Order Items:</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th>Product</th>
            <th>Dimension</th>
            <th>Qty</th>
            <th>Base Price/Unit</th>
            <th>GST/Unit</th>
            <th>Total/Unit (Incl. GST)</th>
            <th>Subtotal (Incl. GST)</th>
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
                <td>${variant.quantity}</td>
                <td>${variant.basePrice.toFixed(2)} Rs</td>
                <td>${(variant.basePrice * variant.gstRate).toFixed(2)} Rs (${(variant.gstRate * 100).toFixed(0)}%)</td>
                <td>${variant.priceIncGst.toFixed(2)} Rs</td>
                <td>${(variant.priceIncGst * variant.quantity).toFixed(2)} Rs</td>
              </tr>
            `;
        });
    });
    ownerEmailHtml += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6" style="text-align: right; font-weight: bold;">Total Order Value:</td>
            <td style="font-weight: bold;">${orderData.totalOrderValue} Rs</td>
          </tr>
        </tfoot>
      </table>
      <p>Please follow up with the customer.</p>
    `;

    const ownerMailOptions = {
      from: `"${COMPANY_NAME} Website" <YOUR_EMAIL@gmail.com>`,
      to: OWNER_EMAIL,
      subject: `New Order Inquiry - ${orderData.customerName}`,
      html: ownerEmailHtml
    };

    // --- Send Emails ---
    // Use Promise.all to send emails concurrently (optional, but can be slightly more efficient)
    await Promise.all([
        transporter.sendMail(customerMailOptions),
        transporter.sendMail(ownerMailOptions)
    ]);
    
    console.log('Order emails sent successfully to customer and owner.');
    res.status(200).json({ message: 'Order placed successfully! Confirmation emails have been sent.' });

  } catch (error) {
    console.error('Error processing order or sending email:', error);
    // In a real app, you might want to send a more user-friendly error or log it more robustly
    res.status(500).json({ message: 'There was an error processing your order. Please try again later.' });
  }
});

// --- Start the Server ---
app.listen(port, () => {
  console.log(`${COMPANY_NAME} backend server running on http://localhost:${port}`);
});
