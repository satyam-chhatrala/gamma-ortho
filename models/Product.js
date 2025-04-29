// models/Product.js 

const mongoose = require('mongoose');

// Define a sub-schema for product dimensions
// This allows each product to have multiple dimension options with their own prices.
const dimensionSchema = new mongoose.Schema({
    dimensionName: {
        type: String,
        required: [true, 'Dimension name is required.'], // Makes this field mandatory
        trim: true // Removes any leading or trailing whitespace
    },
    basePrice: {
        type: Number,
        required: [true, 'Base price for the dimension is required.'], // Mandatory
        min: [0, 'Price cannot be negative.'] // Ensures price is not negative
    },
    dimensionSKU: { // Optional Stock Keeping Unit for this specific variant/dimension
        type: String,
        trim: true,
        // unique: true, // Usually SKU is unique across all products, or at least within a product type.
                       // If unique across all, it should be at the top-level productSchema or managed differently.
                       // For now, keeping it non-unique at this sub-document level.
    }
    // You could add other dimension-specific fields here, e.g., stock quantity for this dimension
    // stock: { type: Number, default: 0 }
});

// Define the main product schema
const productSchema = new mongoose.Schema({
    // Mongoose automatically creates an _id field (ObjectId) which is the primary key.
    // If you need a custom human-readable productId (like a SKU for the base product), you can add it:
    // customProductId: { type: String, unique: true, sparse: true, trim: true },

    name: {
        type: String,
        required: [true, 'Product name is required.'],
        trim: true, 
        index: true // Creates an index on this field for faster searching/querying
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
        lowercase: true, // Ensures consistency, e.g., "wire-pin" instead of "Wire-Pin"
        enum: { // Defines the allowed values for productType
            values: ['wire-pin', 'ao-fixator', 'jess-fixator', 'ring-fixator', 'rail-fixator', 'other'],
            message: '{VALUE} is not a supported product type.' // Custom error message
        },
        index: true // Good for filtering products by type
    },
    baseImageURL: { // URL for the main product image (e.g., from Cloudinary or S3)
        type: String,
        trim: true
        // Consider adding a default placeholder image URL if none is provided
        // default: 'https://placehold.co/600x400/374151/9ca3af?text=No+Image' 
    },
    additionalImageURLs: [{ // An array to store URLs of additional product images
        type: String,
        trim: true
    }],
    dimensions: { // Array of dimension sub-documents
        type: [dimensionSchema],
        validate: [v => Array.isArray(v) && v.length > 0, 'Product must have at least one dimension.'] // Ensures at least one dimension is provided
    },
    gstRate: {
        type: Number,
        required: [true, 'GST rate is required.'],
        default: 0.12, // Default to 12% if not provided
        min: [0, 'GST rate cannot be negative.'],
        max: [1, 'GST rate cannot be more than 1 (100%).'] // Store as a decimal (e.g., 0.12 for 12%)
    },
    isActive: { // To control visibility on the customer-facing site
        type: Boolean,
        default: true, // New products are active by default
        index: true
    }
    // Timestamps are automatically added by Mongoose if you enable them (see options below)
}, {
    timestamps: true // Automatically adds `createdAt` and `updatedAt` fields to your documents
});

// Create a text index for more efficient searching on name, description, and productType.
// This allows for searching parts of words or multiple words across these fields.
productSchema.index({ name: 'text', description: 'text', productType: 'text' });


// Create the Product model from the schema.
// The first argument is the singular name of the collection your model is for.
// Mongoose automatically looks for the plural, lowercased version of your model name
// in your MongoDB database. So, for 'Product', the model will interact with a collection named 'products'.
const Product = mongoose.model('Product', productSchema);

module.exports = Product;

