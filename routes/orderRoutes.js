// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService'); // Adjust path if necessary

// POST /api/orders/place-order
router.post('/place-order', async (req, res) => {
  console.log("Order route: Received POST request on /api/orders/place-order");
  console.log("Order route: Request body:", req.body);
  try {
    const orderData = req.body;

    if (!orderData || !orderData.orderItems || !orderData.customerEmail || !orderData.customerName) {
      console.error("Order route: Validation Error - Missing required order data.");
      return res.status(400).json({ message: 'Missing required order data.' });
    }

    // --- TODO: In a real application, save orderData to your database here ---
    // Example: const savedOrder = await OrderModel.create(orderData);
    // For now, we directly proceed to sending emails.

    await emailService.sendOrderConfirmationEmails(orderData);
    
    console.log('Order route: Order emails initiated successfully.');
    res.status(200).json({ message: 'Order placed successfully! Confirmation emails have been sent.' });

  } catch (error) {
    console.error('Order route: Error processing order or sending email:', error);
    // Check if the error is from emailService due to misconfiguration
    if (error.message === "Email service misconfiguration." || error.message.includes("currently unavailable")) {
        return res.status(503).json({ message: error.message });
    }
    res.status(500).json({ message: 'There was an error processing your order. Please try again later.' });
  }
});

module.exports = router;
