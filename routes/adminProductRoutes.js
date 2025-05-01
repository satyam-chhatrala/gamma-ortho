// routes/adminProductRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Product = require('../models/Product'); 
// Import the GCS upload service and initialization status flag
const { uploadFileToGCS, isGCSInitialized } = require('../services/imageUploadService'); 

// --- Multer Configuration ---
// Store files in memory as buffers, good for passing to GCS/Cloudinary directly
const storage = multer.memoryStorage(); 
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
    fileFilter: function (req, file, cb) {
        // Accept images only
        if (!file.mimetype.startsWith('image/')) {
            req.fileValidationError = 'Only image files are allowed!';
            // To reject this file pass `false`, like so:
            return cb(null, false);
        }
        // To accept the file pass `true`, like so:
        cb(null, true);
    }
});

// POST /api/admin/products - Create a new product
router.post('/', upload.fields([
    { name: 'baseImage', maxCount: 1 },         // Matches the 'name' attribute in your admin.html form
    { name: 'additionalImages', maxCount: 5 }  // Matches the 'name' attribute in your admin.html form
]), async (req, res) => {
    console.log("Admin Products: Received POST request to create product");

    if (req.fileValidationError) {
        console.error("Admin Products: File validation error:", req.fileValidationError);
        return res.status(400).json({ message: req.fileValidationError });
    }

    // Check if GCS is initialized before attempting to process files if any files were sent
    if ((req.files && (req.files.baseImage || req.files.additionalImages)) && !isGCSInitialized) {
        console.error("Admin Products: Attempted image upload, but GCS is not initialized.");
        return res.status(503).json({ message: 'Image Storage Service (GCS) is not properly initialized on the server. Please check backend logs and configuration.' });
    }

    try {
        // Basic validation for required text fields (name and productTypeSelect)
        // The check for dimensions will happen after parsing them.
        if (!req.body.name || !req.body.productTypeSelect) {
            return res.status(400).json({ message: 'Missing required fields: name and productType are mandatory.' });
        }
        
        let parsedDimensions = [];
        try {
            let i = 0;
            // Loop as long as a dimensionName for the current index exists
            while(req.body[`dimensions[${i}][dimensionName]`] !== undefined) { 
                const dimName = req.body[`dimensions[${i}][dimensionName]`];
                const dimPrice = req.body[`dimensions[${i}][basePrice]`];

                // Only add dimension if both name and price are provided and valid
                if (dimName && dimName.trim() !== "" && dimPrice && !isNaN(parseFloat(dimPrice))) {
                    parsedDimensions.push({
                        dimensionName: dimName.trim(),
                        basePrice: parseFloat(dimPrice)
                    });
                } else if (dimName || dimPrice) { 
                    // If one is provided but not the other for a given entry, it's an error
                    // Or if price is not a number
                    throw new Error(`Incomplete or invalid data for dimension at index ${i}. Both name and a valid price are required.`);
                }
                i++;
            }

            if (parsedDimensions.length === 0) {
                // This check is now more robust as it ensures valid dimensions were actually parsed.
                return res.status(400).json({ message: 'At least one complete and valid dimension (name and price) is required.' });
            }
        } catch (parseError) {
            console.error("Error parsing dimensions:", parseError);
            return res.status(400).json({ message: 'Invalid dimensions data format. ' + parseError.message });
        }

        let baseImageURL = null; 
        let additionalImageURLs = [];

        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Uploading base image to GCS...");
            baseImageURL = await uploadFileToGCS(
                req.files.baseImage[0].buffer, 
                req.files.baseImage[0].originalname, 
                "gamma_ortho_products/base_images/" 
            );
            console.log("Base image uploaded to GCS:", baseImageURL);
        }

        if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
            console.log(`Uploading ${req.files.additionalImages.length} additional images to GCS...`);
            const uploadPromises = req.files.additionalImages.map(file => 
                uploadFileToGCS(
                    file.buffer, 
                    file.originalname, 
                    "gamma_ortho_products/additional_images/" 
                )
            );
            additionalImageURLs = await Promise.all(uploadPromises);
            console.log("Additional images uploaded to GCS:", additionalImageURLs);
        }
        
        let finalProductType = req.body.productTypeSelect;
        if (req.body.productTypeSelect === 'other') {
            finalProductType = req.body.newProductType ? req.body.newProductType.trim().toLowerCase().replace(/\s+/g, '-') : '';
            if (!finalProductType) { 
                 return res.status(400).json({ message: 'New product type cannot be empty if "Other" is selected.' });
            }
        }

        const newProductData = {
            name: req.body.name,
            description: req.body.description,
            productType: finalProductType,
            baseImageURL: baseImageURL,
            additionalImageURLs: additionalImageURLs,
            dimensions: parsedDimensions,
            gstRate: parseFloat(req.body.gstRate) || 0.12, 
            isActive: req.body.isActive === 'true' || req.body.isActive === true 
        };
        
        const newProduct = new Product(newProductData);
        const savedProduct = await newProduct.save();
        console.log("Admin Products: Product saved successfully:", savedProduct._id);
        res.status(201).json(savedProduct);

    } catch (error) {
        console.error("Admin Products: Error creating product:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: "Validation Error", errors: error.errors });
        }
        res.status(500).json({ message: error.message || 'Error creating product' });
    }
});

// GET /api/admin/products - Get all products (for admin view)
router.get('/', async (req, res) => {
    console.log("Admin Products: Received GET request to list all products");
    try {
        const products = await Product.find().sort({ createdAt: -1 }); 
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
router.put('/:id', upload.fields([ 
    { name: 'baseImage', maxCount: 1 },
    { name: 'additionalImages', maxCount: 5 }
]), async (req, res) => {
    console.log(`Admin Products: Received PUT request to update product ID: ${req.params.id}`);

    if (req.fileValidationError) {
        return res.status(400).json({ message: req.fileValidationError });
    }

    if ((req.files && (req.files.baseImage || req.files.additionalImages)) && !isGCSInitialized) {
        console.error("Admin Products: Attempted image update, but GCS is not initialized.");
        return res.status(503).json({ message: 'Image Storage Service (GCS) is not properly initialized on the server. Please check backend logs and configuration.' });
    }

    try {
        const updateData = { ...req.body }; 
        delete updateData.dimensions; 

        let parsedDimensions = [];
        let i = 0;
        // Check if new dimension data is being sent by looking for the first dimension name
        if (req.body[`dimensions[${i}][dimensionName]`] !== undefined) { 
            while(req.body[`dimensions[${i}][dimensionName]`] !== undefined) {
                 const dimName = req.body[`dimensions[${i}][dimensionName]`];
                 const dimPrice = req.body[`dimensions[${i}][basePrice]`];
                 if (dimName && dimName.trim() !== "" && dimPrice && !isNaN(parseFloat(dimPrice))) {
                    parsedDimensions.push({
                        dimensionName: dimName.trim(),
                        basePrice: parseFloat(dimPrice)
                    });
                } else if (dimName || dimPrice) { // Only throw error if partial data for a dimension is given
                    throw new Error(`Incomplete or invalid data for dimension at index ${i} during update. Both name and a valid price are required.`);
                }
                i++;
            }
            // Only update dimensions if new valid dimension data was actually parsed
            if (parsedDimensions.length > 0) {
                updateData.dimensions = parsedDimensions;
            } else if (i > 0 && parsedDimensions.length === 0) { 
                // This means dimension fields were sent but were all invalid/empty
                return res.status(400).json({ message: 'If dimensions are provided for update, at least one must be complete and valid.' });
            }
        } else if (req.body.dimensions && Array.isArray(req.body.dimensions)) {
            // If dimensions are sent as a pre-parsed array (e.g., from JSON, not typical for FormData from browser)
             updateData.dimensions = req.body.dimensions.map(d => ({
                dimensionName: d.dimensionName,
                basePrice: parseFloat(d.basePrice)
            })).filter(d => d.dimensionName && d.dimensionName.trim() !== "" && d.basePrice && !isNaN(d.basePrice));
            if (req.body.dimensions.length > 0 && updateData.dimensions.length === 0) {
                 return res.status(400).json({ message: 'Provided dimensions array was empty or contained invalid data.' });
            }
        }
        // If no new dimension data is sent via FormData keys or as req.body.dimensions, 
        // updateData.dimensions will remain undefined, and Mongoose $set will not modify the existing dimensions.


        // Handle Base Image Update
        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Updating base image in GCS...");
            const baseImageResultUrl = await uploadFileToGCS(req.files.baseImage[0].buffer, req.files.baseImage[0].originalname, "gamma_ortho_products/base_images/");
            updateData.baseImageURL = baseImageResultUrl;
            console.log("Base image updated:", updateData.baseImageURL);
        } else if (req.body.hasOwnProperty('baseImageURL') && (req.body.baseImageURL === '' || req.body.baseImageURL === null)) { 
            updateData.baseImageURL = null; 
            // TODO: Delete old image from GCS if product had one
        }


        // Handle Additional Images Update
        if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
            console.log(`Uploading ${req.files.additionalImages.length} new additional images to GCS...`);
            const uploadPromises = req.files.additionalImages.map(file => 
                uploadFileToGCS(file.buffer, file.originalname, "gamma_ortho_products/additional_images/")
            );
            const additionalImageResults = await Promise.all(uploadPromises);
            updateData.additionalImageURLs = additionalImageResults; 
            console.log("Additional images updated/added:", updateData.additionalImageURLs);
        } else if (req.body.additionalImageURLs && Array.isArray(req.body.additionalImageURLs)) {
            updateData.additionalImageURLs = req.body.additionalImageURLs.map(url => String(url).trim()).filter(url => url && url !== 'null');
        } else if (req.body.hasOwnProperty('additionalImageURLs') && (req.body.additionalImageURLs === '' || req.body.additionalImageURLs === null)) {
            updateData.additionalImageURLs = [];
        }
        
        if (req.body.productTypeSelect === 'other' && req.body.newProductType) {
            updateData.productType = req.body.newProductType.trim().toLowerCase().replace(/\s+/g, '-');
             if (!updateData.productType) {
                 return res.status(400).json({ message: 'New product type cannot be empty if "Other" is selected for update.' });
            }
        } else if (req.body.productTypeSelect && req.body.productTypeSelect !== 'other') {
            updateData.productType = req.body.productTypeSelect;
        }
        
        if (updateData.hasOwnProperty('isActive')) {
            updateData.isActive = String(updateData.isActive).toLowerCase() === 'true' || updateData.isActive === true;
        }
        if (updateData.hasOwnProperty('gstRate')) {
            updateData.gstRate = parseFloat(updateData.gstRate);
        }


        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id, 
            { $set: updateData }, 
            { new: true, runValidators: true } 
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
        res.status(500).json({ message: error.message || 'Error updating product' });
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
        
        console.log("Admin Products: Product deleted successfully:", product._id);
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error(`Admin Products: Error deleting product ID ${req.params.id}:`, error);
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
});


module.exports = router;
