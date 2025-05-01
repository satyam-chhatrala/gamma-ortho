// models/Product.js 

const mongoose = require('mongoose');

// Define a sub-schema for product dimensions
const dimensionSchema = new mongoose.Schema({
    dimensionName: {
        type: String,
        required: [true, 'Dimension name is required.'], 
        trim: true 
    },
    basePrice: {
        type: Number,
        required: [true, 'Base price for the dimension is required.'],
        min: [0, 'Price cannot be negative.'] 
    }
    // SKU was removed previously
});

// Define the main product schema
const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required.'],
        trim: true, 
        index: true 
    },
    description: {
        type: String,
        required: [true, 'Product description is required.'],
        trim: true
    },
    productType: {
        type: String,
        required: [true, 'Product type is required.'],
        trim: true,
        lowercase: true, 
        // REMOVED enum: to allow any new product type string
        index: true
    },
    baseImageURL: { 
        type: String,
        trim: true
    },
    additionalImageURLs: [{ 
        type: String,
        trim: true
    }],
    dimensions: { 
        type: [dimensionSchema],
        validate: [v => Array.isArray(v) && v.length > 0, 'Product must have at least one dimension.'] 
    },
    gstRate: {
        type: Number,
        required: [true, 'GST rate is required.'],
        default: 0.12, 
        min: [0, 'GST rate cannot be negative.'],
        max: [1, 'GST rate cannot be more than 1 (100%).'] 
    },
    isActive: { 
        type: Boolean,
        default: true, 
        index: true
    }
}, {
    timestamps: true 
});

productSchema.index({ name: 'text', description: 'text', productType: 'text' });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
