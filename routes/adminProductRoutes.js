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
    // console.log("Admin Products: Request body (text fields):", req.body); // Contains text fields
    // console.log("Admin Products: Files received by multer:", req.files); // Contains file objects { baseImage: [File], additionalImages: [File, File] }

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
        // Basic validation for required text fields
        if (!req.body.name || !req.body.productTypeSelect || !req.body['dimensions[0][dimensionName]']) {
            return res.status(400).json({ message: 'Missing required fields: name, productType, and at least one dimension.' });
        }
        
        let parsedDimensions = [];
        try {
            let i = 0;
            while(req.body[`dimensions[${i}][dimensionName]`]) {
                if (!req.body[`dimensions[${i}][basePrice]`]) {
                     throw new Error(`Base price missing for dimension index ${i}`);
                }
                parsedDimensions.push({
                    dimensionName: req.body[`dimensions[${i}][dimensionName]`],
                    basePrice: parseFloat(req.body[`dimensions[${i}][basePrice]`])
                    // SKU was removed
                });
                i++;
            }
            if (parsedDimensions.length === 0) {
                return res.status(400).json({ message: 'At least one dimension is required.' });
            }
        } catch (parseError) {
            console.error("Error parsing dimensions:", parseError);
            return res.status(400).json({ message: 'Invalid dimensions data format. ' + parseError.message });
        }

        let baseImageURL = null; // Default to null if no image is uploaded
        let additionalImageURLs = [];

        // Handle Base Image Upload to GCS
        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Uploading base image to GCS...");
            baseImageURL = await uploadFileToGCS(
                req.files.baseImage[0].buffer, 
                req.files.baseImage[0].originalname, 
                "gamma_ortho_products/base_images/" // GCS destination folder path
            );
            console.log("Base image uploaded to GCS:", baseImageURL);
        }

        // Handle Additional Images Upload to GCS
        if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
            console.log(`Uploading ${req.files.additionalImages.length} additional images to GCS...`);
            const uploadPromises = req.files.additionalImages.map(file => 
                uploadFileToGCS(
                    file.buffer, 
                    file.originalname, 
                    "gamma_ortho_products/additional_images/" // GCS destination folder path
                )
            );
            additionalImageURLs = await Promise.all(uploadPromises);
            console.log("Additional images uploaded to GCS:", additionalImageURLs);
        }
        
        let finalProductType = req.body.productTypeSelect;
        if (req.body.productTypeSelect === 'other' && req.body.newProductType) {
            finalProductType = req.body.newProductType.trim().toLowerCase().replace(/\s+/g, '-');
            if (!finalProductType) { // Ensure new type is not empty
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
            gstRate: parseFloat(req.body.gstRate) || 0.12, // Use default if not provided or invalid
            isActive: req.body.isActive === 'true' || req.body.isActive === true // FormData sends checkbox 'on' or it's undefined
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
        // Catch errors from uploadFileToGCS if they occur (e.g., GCS service error)
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
        delete updateData.dimensions; // Remove raw dimensions from body if they exist to avoid conflicts

        let parsedDimensions = [];
        let i = 0;
        if (req.body[`dimensions[${i}][dimensionName]`]) { 
            while(req.body[`dimensions[${i}][dimensionName]`]) {
                 if (!req.body[`dimensions[${i}][basePrice]`]) {
                     throw new Error(`Base price missing for dimension index ${i} during update`);
                }
                parsedDimensions.push({
                    dimensionName: req.body[`dimensions[${i}][dimensionName]`],
                    basePrice: parseFloat(req.body[`dimensions[${i}][basePrice]`])
                });
                i++;
            }
            if (parsedDimensions.length > 0) {
                updateData.dimensions = parsedDimensions;
            }
        } else if (req.body.dimensions && Array.isArray(req.body.dimensions)) {
             updateData.dimensions = req.body.dimensions.map(d => ({
                dimensionName: d.dimensionName,
                basePrice: parseFloat(d.basePrice)
            }));
        }


        // Handle Base Image Update
        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Updating base image in GCS...");
            // TODO: Optionally delete old baseImage from GCS before uploading new one
            const baseImageResultUrl = await uploadFileToGCS(req.files.baseImage[0].buffer, req.files.baseImage[0].originalname, "gamma_ortho_products/base_images/");
            updateData.baseImageURL = baseImageResultUrl;
            console.log("Base image updated:", updateData.baseImageURL);
        } else if (req.body.baseImageURL === '' || req.body.baseImageURL === 'null') { 
            updateData.baseImageURL = null; 
            // TODO: Delete old image from GCS if product had one
        }


        // Handle Additional Images Update
        if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
            console.log(`Uploading ${req.files.additionalImages.length} new additional images to GCS...`);
            // This will overwrite existing additionalImageURLs if not handled carefully.
            // For a robust update, you might fetch the product, compare existing URLs,
            // upload new ones, and construct the final array.
            const uploadPromises = req.files.additionalImages.map(file => 
                uploadFileToGCS(file.buffer, file.originalname, "gamma_ortho_products/additional_images/")
            );
            const additionalImageResults = await Promise.all(uploadPromises);
            // If you want to ADD to existing images instead of replacing:
            // const product = await Product.findById(req.params.id);
            // updateData.additionalImageURLs = (product.additionalImageURLs || []).concat(additionalImageResults);
            updateData.additionalImageURLs = additionalImageResults; // This replaces existing
            console.log("Additional images updated/added:", updateData.additionalImageURLs);
        } else if (req.body.additionalImageURLs && Array.isArray(req.body.additionalImageURLs)) {
            // If frontend sends an array of URLs (e.g., to allow removing some by not sending them)
            updateData.additionalImageURLs = req.body.additionalImageURLs.map(url => String(url).trim()).filter(url => url && url !== 'null');
        } else if (req.body.hasOwnProperty('additionalImageURLs') && (req.body.additionalImageURLs === '' || req.body.additionalImageURLs === null)) {
            updateData.additionalImageURLs = [];
            // TODO: Delete all existing additional images from GCS
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
        
        // TODO: Delete associated images from GCS
        // This would involve:
        // 1. Extracting the filename/object name from product.baseImageURL and each URL in product.additionalImageURLs.
        // 2. Calling storage.bucket(GCS_BUCKET_NAME).file(gcsFilename).delete() for each.
        //    (Requires `storage` and `GCS_BUCKET_NAME` to be accessible here, or call a service function)

        console.log("Admin Products: Product deleted successfully:", product._id);
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error(`Admin Products: Error deleting product ID ${req.params.id}:`, error);
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
});


module.exports = router;
