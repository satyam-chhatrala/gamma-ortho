// services/emailService.js
const nodemailer = require('nodemailer');

const SENDER_EMAIL_USER = process.env.SENDER_EMAIL_USER;
const SENDER_EMAIL_PASS = process.env.SENDER_EMAIL_PASS;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const COMPANY_NAME = 'Gamma Ortho Instruments';

let transporter;

if (SENDER_EMAIL_USER && SENDER_EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail', // Or your configured email provider
      auth: {
        user: SENDER_EMAIL_USER,
        pass: SENDER_EMAIL_PASS 
      }
    });
    console.log("Nodemailer transporter configured successfully in emailService.");
} else {
    console.warn("Email credentials not found in emailService. Email sending will be disabled.");
    transporter = { // Dummy transporter if credentials are not set
        sendMail: (mailOptions) => {
            console.error("Dummy transporter: sendMail called, but emails are disabled.", mailOptions.subject);
            return Promise.resolve({ messageId: 'dummy-id-email-disabled' });
        }
    };
}

const sendOrderConfirmationEmails = async (orderData) => {
    if (typeof transporter.sendMail !== 'function') {
        console.error("Email transporter not properly configured. Cannot send order confirmation emails.");
        throw new Error("Email service misconfiguration.");
    }
    // --- Prepare Email for Customer ---
    let customerEmailHtml = `
      <h1>Thank you for your order, ${orderData.customerName}!</h1>
      <p>We've received your order inquiry. We will contact you shortly to confirm the details and proceed with your order.</p>
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
      <h1>New Order Placed! (#${Date.now().toString().slice(-6)})</h1>
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

    await Promise.all([
        transporter.sendMail(customerMailOptions),
        transporter.sendMail(ownerMailOptions)
    ]);
    console.log('Order confirmation mail sent successfully.');
};

const sendInquiryEmail = async (inquiryData, files) => {
    if (typeof transporter.sendMail !== 'function') {
        console.error("Email transporter not properly configured. Cannot send inquiry email.");
        throw new Error("Email service misconfiguration.");
    }

    let inquiryEmailHtml = `
        <h1>New Inquiry Received</h1>
        <h2>Inquiry Details:</h2>
        <p><strong>Name:</strong> ${inquiryData['contact-name'] || 'N/A'}</p>
        <p><strong>Email:</strong> ${inquiryData['contact-email'] || 'N/A'}</p>
        <p><strong>Mobile:</strong> ${inquiryData['contact-mobile'] || 'N/A'}</p>
        ${inquiryData['contact-whatsapp'] ? `<p><strong>WhatsApp:</strong> ${inquiryData['contact-whatsapp']}</p>` : ''}
        ${inquiryData['contact-hospital'] ? `<p><strong>Hospital/Clinic:</strong> ${inquiryData['contact-hospital']}</p>` : ''}
        <p><strong>Category:</strong> ${inquiryData['contact-category'] || 'N/A'}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${inquiryData['contact-message'] || 'N/A'}</p>
    `;

    if (files && files.length > 0) {
        inquiryEmailHtml += `<h2>Attachments:</h2><p>${files.length} file(s) attached.</p>`;
    }

    const mailOptions = {
        from: `"${COMPANY_NAME} Inquiry" <${SENDER_EMAIL_USER}>`,
        to: OWNER_EMAIL,
        subject: `New Inquiry: ${inquiryData['contact-category']} - ${inquiryData['contact-name']}`,
        html: inquiryEmailHtml,
        attachments: files && files.length > 0 ? files.map(file => ({
            filename: file.originalname,
            content: file.buffer,
            contentType: file.mimetype
        })) : []
    };

    await transporter.sendMail(mailOptions);
    console.log('Inquiry email sent successfully to owner.');
};


module.exports = {
    sendOrderConfirmationEmails,
    sendInquiryEmail
};
