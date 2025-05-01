// routes/adminProductRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Product = require('../models/Product'); 
// Import the GCS upload service, initialization status flag, and delete function
const { uploadFileToGCS, deleteFileFromGCS, isGCSInitialized } = require('../services/imageUploadService'); 

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
    console.log("Admin Products: req.body received:", JSON.stringify(req.body, null, 2)); 

    if (req.fileValidationError) {
        console.error("Admin Products: File validation error:", req.fileValidationError);
        return res.status(400).json({ message: req.fileValidationError });
    }

    if ((req.files && (req.files.baseImage || req.files.additionalImages)) && !isGCSInitialized) {
        console.error("Admin Products: Attempted image upload, but GCS is not initialized.");
        return res.status(503).json({ message: 'Image Storage Service (GCS) is not properly initialized on the server. Please check backend logs and configuration.' });
    }

    try {
        if (!req.body.name || req.body.name.trim() === "") {
            return res.status(400).json({ message: 'Product name is required.' });
        }
        if (!req.body.productTypeSelect || req.body.productTypeSelect.trim() === "") {
            return res.status(400).json({ message: 'Product type selection is required.' });
        }
        
        let finalProductType = req.body.productTypeSelect.trim().toLowerCase();
        if (finalProductType === 'other') {
            if (!req.body.newProductType || req.body.newProductType.trim() === '') {
                return res.status(400).json({ message: 'Please specify the new product type when "Other" is selected.' });
            }
            finalProductType = req.body.newProductType.trim().toLowerCase().replace(/\s+/g, '-');
        }
        
        let parsedDimensions = [];
        console.log("Admin Products: Starting dimension parsing loop...");
        if (req.body.dimensions && Array.isArray(req.body.dimensions)) {
            req.body.dimensions.forEach((dim, index) => {
                console.log(`Admin Products: Processing dimension index ${index} from array:`, dim);
                const dimName = dim.dimensionName;
                const dimPrice = dim.basePrice;

                const isDimNameValid = dimName && dimName.trim() !== "";
                const isDimPriceValid = dimPrice !== undefined && String(dimPrice).trim() !== "" && !isNaN(parseFloat(dimPrice));
                
                console.log(`  Dimension index ${index} - Name: '${dimName}', Price: '${dimPrice}'`);
                console.log(`  isDimNameValid: ${isDimNameValid}, isDimPriceValid: ${isDimPriceValid}`);

                if (isDimNameValid && isDimPriceValid) {
                    parsedDimensions.push({
                        dimensionName: dimName.trim(),
                        basePrice: parseFloat(dimPrice)
                    });
                    console.log(`  Dimension index ${index} ADDED.`);
                } else {
                    console.warn(`  Dimension index ${index} SKIPPED due to incomplete/invalid data.`);
                }
            });
        } else {
            console.warn("Admin Products: req.body.dimensions is not an array or is missing. FormData might not be parsed as expected for complex objects/arrays by the middleware if not named correctly on client-side.");
        }
        
        console.log("Admin Products: Dimension parsing finished. Parsed dimensions count:", parsedDimensions.length);
        console.log("Admin Products: Parsed dimensions content:", parsedDimensions);

        if (parsedDimensions.length === 0) {
            return res.status(400).json({ message: 'At least one complete and valid dimension (name and price) is required. Check submitted dimension data.' });
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
    console.log("Admin Products: Update req.body:", JSON.stringify(req.body, null, 2));

    if (req.fileValidationError) {
        return res.status(400).json({ message: req.fileValidationError });
    }

    if ((req.files && (req.files.baseImage || req.files.additionalImages)) && !isGCSInitialized) {
        console.error("Admin Products: Attempted image update, but GCS is not initialized.");
        return res.status(503).json({ message: 'Image Storage Service (GCS) is not properly initialized on the server. Please check backend logs and configuration.' });
    }

    try {
        const updateData = {}; 

        if (req.body.name !== undefined) updateData.name = req.body.name;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        
        if (req.body.productTypeSelect) { 
            if (req.body.productTypeSelect.trim().toLowerCase() === 'other') {
                updateData.productType = req.body.newProductType ? req.body.newProductType.trim().toLowerCase().replace(/\s+/g, '-') : '';
                if (!updateData.productType) {
                    return res.status(400).json({ message: 'New product type cannot be empty if "Other" is selected for update.' });
                }
            } else {
                updateData.productType = req.body.productTypeSelect.trim().toLowerCase();
            }
        }
        
        if (req.body.gstRate !== undefined) updateData.gstRate = parseFloat(req.body.gstRate);
        
        if (Object.prototype.hasOwnProperty.call(req.body, 'isActive')) {
            updateData.isActive = String(req.body.isActive).toLowerCase() === 'true';
        }


        if (req.body.dimensions && Array.isArray(req.body.dimensions)) {
            console.log("Admin Products: Parsing dimensions from req.body.dimensions for PUT request");
            const tempParsedDimensions = req.body.dimensions.map((dim, index) => {
                const dimName = dim.dimensionName;
                const dimPrice = dim.basePrice;
                const isDimNameValid = dimName && dimName.trim() !== "";
                const isDimPriceValid = dimPrice !== undefined && String(dimPrice).trim() !== "" && !isNaN(parseFloat(dimPrice));
                if (isDimNameValid && isDimPriceValid) {
                    return { dimensionName: dimName.trim(), basePrice: parseFloat(dimPrice) };
                }
                console.warn(`  Dimension index ${index} in update data SKIPPED due to incomplete/invalid data.`);
                return null; 
            }).filter(dim => dim !== null); 

            if (req.body.dimensions.length > 0 && tempParsedDimensions.length === 0) {
                return res.status(400).json({ message: 'Provided dimensions array was empty or contained only invalid data.' });
            }
            if (tempParsedDimensions.length > 0 || (req.body.dimensions && req.body.dimensions.length === 0) ) {
                 updateData.dimensions = tempParsedDimensions; 
            }
            console.log("Admin Products: Parsed dimensions for update:", updateData.dimensions);
        }

        const existingProduct = await Product.findById(req.params.id);
        if (!existingProduct) {
             console.log(`Admin Products: Product not found for update with ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Product not found' });
        }

        // Handle Base Image Update
        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Updating base image in GCS...");
            if (existingProduct.baseImageURL && isGCSInitialized) { // Delete old image if it exists
                await deleteFileFromGCS(existingProduct.baseImageURL).catch(err => console.error("Failed to delete old base image from GCS:", err.message));
            }
            const baseImageResultUrl = await uploadFileToGCS(req.files.baseImage[0].buffer, req.files.baseImage[0].originalname, "gamma_ortho_products/base_images/");
            updateData.baseImageURL = baseImageResultUrl;
            console.log("Base image updated:", updateData.baseImageURL);
        } else if (Object.prototype.hasOwnProperty.call(req.body, 'baseImageURL') && (req.body.baseImageURL === '' || req.body.baseImageURL === null || req.body.baseImageURL === "null")) { 
            if (existingProduct.baseImageURL && isGCSInitialized) { // Delete old image if requested
                 await deleteFileFromGCS(existingProduct.baseImageURL).catch(err => console.error("Failed to delete old base image from GCS:", err.message));
            }
            updateData.baseImageURL = null; 
        }


        // Handle Additional Images Update
        if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
            console.log(`Uploading ${req.files.additionalImages.length} new additional images to GCS...`);
            // For simplicity, this replaces all existing additional images.
            // Delete old additional images first
            if (existingProduct.additionalImageURLs && existingProduct.additionalImageURLs.length > 0 && isGCSInitialized) {
                const deletionPromises = existingProduct.additionalImageURLs.map(url => deleteFileFromGCS(url).catch(err => console.error("Failed to delete an old additional image:", err.message)));
                await Promise.allSettled(deletionPromises);
            }
            const uploadPromises = req.files.additionalImages.map(file => 
                uploadFileToGCS(file.buffer, file.originalname, "gamma_ortho_products/additional_images/")
            );
            const additionalImageResults = await Promise.all(uploadPromises);
            updateData.additionalImageURLs = additionalImageResults; 
            console.log("Additional images updated/added:", updateData.additionalImageURLs);
        } else if (Object.prototype.hasOwnProperty.call(req.body, 'additionalImageURLs')) {
            // If frontend sends an array (e.g., to keep some, remove others, or clear all)
            // This assumes req.body.additionalImageURLs is the desired final list of URLs (if any)
            // More complex logic would be needed to compare with existingProduct.additionalImageURLs and delete only those removed.
            // For now, if it's an empty array or string, we clear it.
            if (Array.isArray(req.body.additionalImageURLs)) {
                 updateData.additionalImageURLs = req.body.additionalImageURLs.map(url => String(url).trim()).filter(url => url && url !== 'null');
            } else if (req.body.additionalImageURLs === '' || req.body.additionalImageURLs === null) {
                if (existingProduct.additionalImageURLs && existingProduct.additionalImageURLs.length > 0 && isGCSInitialized) {
                    const deletionPromises = existingProduct.additionalImageURLs.map(url => deleteFileFromGCS(url).catch(err => console.error("Failed to delete an old additional image:", err.message)));
                    await Promise.allSettled(deletionPromises);
                }
                updateData.additionalImageURLs = [];
            }
        }
        
        if (Object.keys(updateData).length === 0 && (!req.files || (!req.files.baseImage && !req.files.additionalImages))) {
            return res.status(400).json({ message: 'No update data provided.' });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id, 
            { $set: updateData }, 
            { new: true, runValidators: true } 
        );

        if (!updatedProduct) {
            // This case should ideally be caught by the findById earlier, but as a safeguard:
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
        const product = await Product.findById(req.params.id); // Find first to get image URLs
        if (!product) {
            console.log(`Admin Products: Product not found for delete with ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Product not found' });
        }
        
        // Attempt to delete images from GCS if GCS is initialized
        if (isGCSInitialized) {
            const imageDeletionPromises = [];
            if (product.baseImageURL) {
                console.log("Deleting base image from GCS:", product.baseImageURL);
                imageDeletionPromises.push(deleteFileFromGCS(product.baseImageURL).catch(err => {
                    console.error(`Failed to delete base image ${product.baseImageURL} from GCS:`, err.message);
                    // Don't let GCS deletion failure stop DB deletion, but log it.
                }));
            }
            if (product.additionalImageURLs && product.additionalImageURLs.length > 0) {
                product.additionalImageURLs.forEach(url => {
                    console.log("Deleting additional image from GCS:", url);
                    imageDeletionPromises.push(deleteFileFromGCS(url).catch(err => {
                        console.error(`Failed to delete additional image ${url} from GCS:`, err.message);
                    }));
                });
            }

            if (imageDeletionPromises.length > 0) {
                await Promise.allSettled(imageDeletionPromises); // Wait for all deletions to attempt
                console.log("Attempted deletion of associated GCS images.");
            }
        } else {
            console.warn("GCS not initialized. Skipping image deletion from GCS for product ID:", product._id);
        }

        // Delete product from MongoDB
        await Product.findByIdAndDelete(req.params.id);
        
        console.log("Admin Products: Product deleted successfully from DB:", product._id);
        res.status(200).json({ message: 'Product deleted successfully from database. Associated images deletion attempted if GCS was available.' });
    } catch (error) {
        console.error(`Admin Products: Error deleting product ID ${req.params.id}:`, error);
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
});


module.exports = router;
