// routes/adminProductRoutes.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product'); // Adjust path if your models folder is different

// --- IMPORTANT: Admin Authentication Middleware (To be added later for security) ---
// For now, these routes are open. In a production admin panel, you'd protect these.
// const isAdmin = (req, res, next) => { /* ... your auth logic ... */ };
// router.use(isAdmin); // Apply to all routes in this file

// POST /api/admin/products - Create a new product
router.post('/', async (req, res) => {
    console.log("Admin Products: Received POST request to create product");
    console.log("Admin Products: Request body:", req.body);
    try {
        // Basic validation (Mongoose schema will also validate)
        if (!req.body.name || !req.body.productType || !req.body.dimensions || req.body.dimensions.length === 0) {
            return res.status(400).json({ message: 'Missing required fields: name, productType, and at least one dimension.' });
        }

        // TODO: Handle image uploads here later. For now, assume image URLs might be in req.body or set later.
        
        const newProduct = new Product({
            name: req.body.name,
            description: req.body.description,
            productType: req.body.productType,
            baseImageURL: req.body.baseImageURL, // Will come from image upload service later
            additionalImageURLs: req.body.additionalImageURLs || [], // Optional
            dimensions: req.body.dimensions, // Expecting an array of { dimensionName, basePrice, dimensionSKU? }
            gstRate: req.body.gstRate, // Will use default if not provided
            isActive: req.body.isActive === undefined ? true : req.body.isActive // Default to true
        });

        const savedProduct = await newProduct.save();
        console.log("Admin Products: Product saved successfully:", savedProduct._id);
        res.status(201).json(savedProduct);
    } catch (error) {
        console.error("Admin Products: Error creating product:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: "Validation Error", errors: error.errors });
        }
        res.status(500).json({ message: 'Error creating product', error: error.message });
    }
});

// GET /api/admin/products - Get all products (for admin view)
router.get('/', async (req, res) => {
    console.log("Admin Products: Received GET request to list all products");
    try {
        const products = await Product.find().sort({ createdAt: -1 }); // Sort by newest first
        res.status(200).json(products);
    } catch (error) {
        console.error("Admin Products: Error fetching products:", error);
        res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
});

// GET /api/admin/products/:id - Get a single product by ID (for editing)
router.get('/:id', async (req, res) => {
    console.log(`Admin Products: Received GET request for product ID: ${req.params.id}`);
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            console.log(`Admin Products: Product not found with ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        console.error(`Admin Products: Error fetching product ID ${req.params.id}:`, error);
        res.status(500).json({ message: 'Error fetching product', error: error.message });
    }
});

// PUT /api/admin/products/:id - Update an existing product
router.put('/:id', async (req, res) => {
    console.log(`Admin Products: Received PUT request to update product ID: ${req.params.id}`);
    console.log("Admin Products: Update data:", req.body);
    try {
        // TODO: Handle image updates (deleting old, uploading new) later.
        
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true } // new: true returns the updated document, runValidators: ensures schema validations are run on update
        );

        if (!updatedProduct) {
            console.log(`Admin Products: Product not found for update with ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Product not found' });
        }
        console.log("Admin Products: Product updated successfully:", updatedProduct._id);
        res.status(200).json(updatedProduct);
    } catch (error) {
        console.error(`Admin Products: Error updating product ID ${req.params.id}:`, error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: "Validation Error", errors: error.errors });
        }
        res.status(500).json({ message: 'Error updating product', error: error.message });
    }
});

// DELETE /api/admin/products/:id - Delete a product
router.delete('/:id', async (req, res) => {
    console.log(`Admin Products: Received DELETE request for product ID: ${req.params.id}`);
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            console.log(`Admin Products: Product not found for delete with ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Product not found' });
        }
        
        // TODO: Delete associated images from cloud storage here later.

        console.log("Admin Products: Product deleted successfully:", product._id);
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error(`Admin Products: Error deleting product ID ${req.params.id}:`, error);
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
});


module.exports = router;
