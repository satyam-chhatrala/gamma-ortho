// models/Order.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-schema for individual items within an order
const orderItemVariantSchema = new mongoose.Schema({
    variantId: { type: String, required: true }, // e.g., "P001-2.5mmx4mm"
    dimension: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    basePrice: { type: Number, required: true }, // Price per unit before GST
    gstRate: { type: Number, required: true },   // GST rate applied (e.g., 0.12)
    priceIncGst: { type: Number, required: true } // Price per unit including GST
}, {_id: false}); // Don't create a separate _id for each variant item in the order

const orderProductGroupSchema = new mongoose.Schema({
    baseProductId: { type: String, required: true }, // Corresponds to Product._id or customProductId
    baseProductName: { type: String, required: true },
    variants: [orderItemVariantSchema]
}, {_id: false}); // Don't create a separate _id for each product group in the order


const orderSchema = new mongoose.Schema({
    // Order ID: Mongoose automatically creates an _id. 
    // You can add a custom human-readable order number if needed.
    // customOrderId: { type: String, unique: true, required: true },

    // Customer Information (snapshot at the time of order)
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, required: true, trim: true, lowercase: true },
    customerMobileCode: { type: String, required: true },
    customerMobileNumber: { type: String, required: true, trim: true },
    customerWhatsappCode: { type: String },
    customerWhatsappNumber: { type: String, trim: true },
    
    // Shipping Address
    shippingAddress: {
        address: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        country: { type: String, required: true, trim: true },
        pincode: { type: String, required: true, trim: true }
    },

    // Order Items: An array of product groups, each containing variants
    orderItems: [orderProductGroupSchema], 

    // Order Totals
    totalOrderValue: { // String like "1344.00 Rs" - consider storing as number for calculations
        type: String, 
        required: true 
    },
    // It might be better to store totalOrderValue as a Number and currency separately:
    // totalAmount: { type: Number, required: true },
    // currency: { type: String, required: true, default: 'INR' },


    // Order Status
    status: {
        type: String,
        enum: ['Pending Confirmation', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'],
        default: 'Pending Confirmation'
    },
    
    // Payment Details (can be expanded)
    paymentMethod: { type: String }, // e.g., "UPI", "Card", "Net Banking", "Pay Later"
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    // paymentTransactionId: { type: String }, // If you integrate a payment gateway

    // Notes
    // adminNotes: { type: String },
    // customerNotes: { type: String } // If you add a notes field in the order form

}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Index for faster querying by customer email or status
orderSchema.index({ customerEmail: 1 });
orderSchema.index({ status: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
