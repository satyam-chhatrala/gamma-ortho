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
    console.log("Admin Products: req.body received:", req.body); // Log the entire body

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
        // --- Refined Initial Validation ---
        if (!req.body.name || req.body.name.trim() === "") {
            return res.status(400).json({ message: 'Product name is required.' });
        }
        if (!req.body.productType || req.body.productType.trim() === "") {
            // This means the default "-- Select Type --" (with value="") was likely submitted
            return res.status(400).json({ message: 'Product type selection is required.' });
        }
        
        let finalProductType = req.body.productType.trim().toLowerCase();
        if (finalProductType === 'other') {
            if (!req.body.newProductType || req.body.newProductType.trim() === '') {
                return res.status(400).json({ message: 'Please specify the new product type when "Other" is selected.' });
            }
            finalProductType = req.body.newProductType.trim().toLowerCase().replace(/\s+/g, '-');
        }
        
        let parsedDimensions = [];
        try {
            let i = 0;
            while(req.body[`dimensions[${i}][dimensionName]`] !== undefined) { 
                const dimName = req.body[`dimensions[${i}][dimensionName]`];
                const dimPrice = req.body[`dimensions[${i}][basePrice]`];

                if (dimName && dimName.trim() !== "" && dimPrice && !isNaN(parseFloat(dimPrice))) {
                    parsedDimensions.push({
                        dimensionName: dimName.trim(),
                        basePrice: parseFloat(dimPrice)
                    });
                } else if (dimName || dimPrice) { 
                    throw new Error(`Incomplete or invalid data for dimension at index ${i}. Both name and a valid price are required.`);
                }
                i++;
            }

            if (parsedDimensions.length === 0) {
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
        
        const newProductData = {
            name: req.body.name,
            description: req.body.description,
            productType: finalProductType, // Use the derived finalProductType
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
    console.log("Admin Products: Update req.body:", req.body);

    if (req.fileValidationError) {
        return res.status(400).json({ message: req.fileValidationError });
    }

    if ((req.files && (req.files.baseImage || req.files.additionalImages)) && !isGCSInitialized) {
        console.error("Admin Products: Attempted image update, but GCS is not initialized.");
        return res.status(503).json({ message: 'Image Storage Service (GCS) is not properly initialized on the server. Please check backend logs and configuration.' });
    }

    try {
        const updateData = { ...req.body }; 
        // Remove raw dimensions from body to avoid conflicts if they are not being updated or parsed correctly
        // We will re-add `updateData.dimensions` only if new valid dimension data is parsed.
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
                } else if (dimName || dimPrice) { 
                    throw new Error(`Incomplete or invalid data for dimension at index ${i} during update. Both name and a valid price are required.`);
                }
                i++;
            }
            if (parsedDimensions.length > 0) {
                updateData.dimensions = parsedDimensions;
            } else if (i > 0 && parsedDimensions.length === 0) { 
                return res.status(400).json({ message: 'If dimensions are provided for update, at least one must be complete and valid.' });
            }
        } else if (req.body.dimensions && Array.isArray(req.body.dimensions)) {
             updateData.dimensions = req.body.dimensions.map(d => ({
                dimensionName: d.dimensionName,
                basePrice: parseFloat(d.basePrice)
            })).filter(d => d.dimensionName && d.dimensionName.trim() !== "" && d.basePrice && !isNaN(d.basePrice));
            if (req.body.dimensions.length > 0 && updateData.dimensions.length === 0) {
                 return res.status(400).json({ message: 'Provided dimensions array was empty or contained invalid data.' });
            }
        }
        // If 'updateData.dimensions' is not set here, Mongoose $set will not modify existing dimensions.


        // Handle Base Image Update
        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Updating base image in GCS...");
            const baseImageResultUrl = await uploadFileToGCS(req.files.baseImage[0].buffer, req.files.baseImage[0].originalname, "gamma_ortho_products/base_images/");
            updateData.baseImageURL = baseImageResultUrl;
            console.log("Base image updated:", updateData.baseImageURL);
        } else if (req.body.hasOwnProperty('baseImageURL') && (req.body.baseImageURL === '' || req.body.baseImageURL === null || req.body.baseImageURL === "null")) { 
            // If frontend explicitly sends empty or null string to remove image
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
            // This replaces existing. For merging, fetch product, merge URLs, then save.
            updateData.additionalImageURLs = additionalImageResults; 
            console.log("Additional images updated/added:", updateData.additionalImageURLs);
        } else if (req.body.additionalImageURLs && Array.isArray(req.body.additionalImageURLs)) {
            updateData.additionalImageURLs = req.body.additionalImageURLs.map(url => String(url).trim()).filter(url => url && url !== 'null');
        } else if (req.body.hasOwnProperty('additionalImageURLs') && (req.body.additionalImageURLs === '' || req.body.additionalImageURLs === null)) {
            updateData.additionalImageURLs = [];
        }
        
        // Handle productType update
        if (req.body.productTypeSelect) { // Check if productTypeSelect is sent
            if (req.body.productTypeSelect === 'other') {
                updateData.productType = req.body.newProductType ? req.body.newProductType.trim().toLowerCase().replace(/\s+/g, '-') : '';
                if (!updateData.productType) {
                    return res.status(400).json({ message: 'New product type cannot be empty if "Other" is selected for update.' });
                }
            } else {
                updateData.productType = req.body.productTypeSelect.trim().toLowerCase();
            }
        }
        // If productTypeSelect is not in req.body, productType in updateData will not be set,
        // and existing productType will remain unchanged by $set unless explicitly set to null.
        
        if (updateData.hasOwnProperty('isActive')) {
            updateData.isActive = String(updateData.isActive).toLowerCase() === 'true' || updateData.isActive === true;
        }
        if (updateData.hasOwnProperty('gstRate')) {
            updateData.gstRate = parseFloat(updateData.gstRate);
        }

        // Remove fields that shouldn't be directly set if they are empty in the form but might exist in updateData
        if (updateData.name !== undefined && updateData.name.trim() === "") delete updateData.name; 
        // Add similar checks for other fields if empty strings should not overwrite existing data with empty strings.
        // However, for productType, it's handled above.

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
