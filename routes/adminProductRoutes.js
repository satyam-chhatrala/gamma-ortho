// routes/adminProductRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Product = require('../models/Product'); 
const { bucket } = require('../services/imageUploadService'); // Import GCS bucket
const { format } = require('util'); // For formatting public URL

// --- Multer Configuration ---
const storage = multer.memoryStorage(); 
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            req.fileValidationError = 'Only image files are allowed!';
            return cb(null, false); // Pass false instead of new Error for multer to handle gracefully
        }
        cb(null, true);
    }
});

// Helper function to upload a single file buffer to GCS
const uploadToGCS = (fileBuffer, originalFilename, folderName) => {
    return new Promise((resolve, reject) => {
        if (!bucket) {
            console.error("GCS bucket is not initialized. Cannot upload file.");
            return reject(new Error("GCS bucket not initialized. Check server configuration and GCS_BUCKET_NAME."));
        }

        const uniqueFilename = `${folderName}/${Date.now()}-${originalFilename.replace(/\s+/g, '_')}`;
        const blob = bucket.file(uniqueFilename);
        const blobStream = blob.createWriteStream({
            resumable: false,
            contentType: fileBuffer.mimetype // Pass mimetype for correct GCS object metadata
        });

        blobStream.on('error', (err) => {
            console.error("GCS upload stream error:", err);
            reject(err);
        });

        blobStream.on('finish', async () => {
            // Make the file public (if your bucket permissions allow or are set for public reads)
            // For more secure access, consider using signed URLs.
            try {
                await blob.makePublic();
                const publicUrl = format(`https://storage.googleapis.com/${bucket.name}/${blob.name}`);
                console.log("GCS Upload successful, public URL:", publicUrl);
                resolve({ publicUrl: publicUrl, gcsName: blob.name }); // Return GCS name for potential deletion
            } catch (publicError) {
                console.error("GCS makePublic error:", publicError);
                // If makePublic fails, still resolve with a non-public URL or handle as an error
                // For now, we'll just log and continue, but this needs careful consideration for access control.
                // The file is uploaded, but might not be publicly accessible.
                // A common pattern is to use signed URLs for controlled access instead of making files broadly public.
                resolve({ publicUrl: `gs://${bucket.name}/${blob.name}`, gcsName: blob.name, needsSignedUrl: true });
            }
        });
        blobStream.end(fileBuffer.buffer); // multer memory storage gives us a buffer
    });
};


// POST /api/admin/products - Create a new product
router.post('/', upload.fields([
    { name: 'baseImage', maxCount: 1 },
    { name: 'additionalImages', maxCount: 5 } 
]), async (req, res) => {
    console.log("Admin Products: Received POST request to create product");
    if (req.fileValidationError) {
        return res.status(400).json({ message: req.fileValidationError });
    }
    if (!bucket) {
         return res.status(503).json({ message: "Image storage service is not available. Please contact support." });
    }

    try {
        if (!req.body.name || !req.body.productType || !req.body['dimensions[0][dimensionName]']) { // Check if at least one dimension name is present
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

        let baseImageURL = null;
        let additionalImageURLs = [];

        // Handle Base Image Upload
        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Uploading base image to GCS...");
            const baseImageResult = await uploadToGCS(req.files.baseImage[0], req.files.baseImage[0].originalname, "gamma_ortho_products/base_images");
            baseImageURL = baseImageResult.publicUrl;
            console.log("Base image uploaded to GCS:", baseImageURL);
        }

        // Handle Additional Images Upload
        if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
            console.log(`Uploading ${req.files.additionalImages.length} additional images to GCS...`);
            const uploadPromises = req.files.additionalImages.map(file => 
                uploadToGCS(file, file.originalname, "gamma_ortho_products/additional_images")
            );
            const additionalImageResults = await Promise.all(uploadPromises);
            additionalImageURLs = additionalImageResults.map(result => result.publicUrl);
            console.log("Additional images uploaded to GCS:", additionalImageURLs);
        }
        
        const newProductData = {
            name: req.body.name,
            description: req.body.description,
            productType: req.body.productType,
            baseImageURL: baseImageURL,
            additionalImageURLs: additionalImageURLs,
            dimensions: parsedDimensions,
            gstRate: parseFloat(req.body.gstRate) || 0.12,
            isActive: req.body.isActive === 'true' || req.body.isActive === true 
        };
        
        if (req.body.productTypeSelect === 'other' && req.body.newProductType) {
            newProductData.productType = req.body.newProductType.toLowerCase().replace(/\s+/g, '-');
        }

        const newProduct = new Product(newProductData);
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
     if (!bucket) {
         return res.status(503).json({ message: "Image storage service is not available. Please contact support." });
    }

    try {
        const updateData = { ...req.body }; 
        delete updateData.dimensions; // Remove raw dimensions string if sent

        // Parse dimensions if they are sent in the update
        let parsedDimensions;
        if (req.body['dimensions[0][dimensionName]']) { 
            parsedDimensions = [];
            let i = 0;
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
            // If dimensions are sent as a pre-parsed array (e.g., from JSON, though form usually won't do this for PUT with FormData)
            updateData.dimensions = req.body.dimensions;
        }


        // Handle Base Image Update
        if (req.files && req.files.baseImage && req.files.baseImage[0]) {
            console.log("Updating base image in GCS...");
            const baseImageResult = await uploadToGCS(req.files.baseImage[0], req.files.baseImage[0].originalname, "gamma_ortho_products/base_images");
            updateData.baseImageURL = baseImageResult.publicUrl;
            // TODO: Delete old baseImage from GCS if product.baseImageURL existed and is different.
            // You'd need to parse the old GCS object name from the URL to delete it.
            console.log("Base image updated:", updateData.baseImageURL);
        } else if (req.body.baseImageURL === '' || req.body.baseImageURL === 'null') { 
            // If an empty string or "null" string is sent for baseImageURL, it means remove/clear the existing one
            updateData.baseImageURL = null; 
            // TODO: Delete old baseImage from GCS here
        }


        // Handle Additional Images Update
        if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
            console.log(`Uploading ${req.files.additionalImages.length} new additional images to GCS...`);
            const uploadPromises = req.files.additionalImages.map(file => 
                uploadToGCS(file, file.originalname, "gamma_ortho_products/additional_images")
            );
            const additionalImageResults = await Promise.all(uploadPromises);
            // This replaces existing additional images. For merging or selective deletion, more complex logic is needed.
            updateData.additionalImageURLs = additionalImageResults.map(result => result.publicUrl); 
            console.log("Additional images updated/added:", updateData.additionalImageURLs);
        } else if (req.body.removeAdditionalImages === 'true') { // Add a way to signal removal of all additional images
            updateData.additionalImageURLs = [];
            // TODO: Delete all existing additional images from GCS
        }
        // Note: Handling specific deletions from additionalImageURLs array is more complex with FormData
        // and typically requires sending a list of URLs to keep or IDs of images to delete.

        
        if (req.body.productTypeSelect === 'other' && req.body.newProductType) {
            updateData.productType = req.body.newProductType.toLowerCase().replace(/\s+/g, '-');
        } else if (req.body.productTypeSelect && req.body.productTypeSelect !== 'other') {
            updateData.productType = req.body.productTypeSelect;
        }

        if (updateData.hasOwnProperty('isActive')) {
            updateData.isActive = String(updateData.isActive).toLowerCase() === 'true';
        }
        if (updateData.gstRate) {
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
        res.status(500).json({ message: 'Error updating product', error: error.message });
    }
});

// DELETE /api/admin/products/:id - Delete a product
router.delete('/:id', async (req, res) => {
    console.log(`Admin Products: Received DELETE request for product ID: ${req.params.id}`);
    if (!bucket) {
         return res.status(503).json({ message: "Image storage service is not available for deleting images. Please contact support." });
    }
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) {
            console.log(`Admin Products: Product not found for delete with ID: ${req.params.id}`);
            return res.status(404).json({ message: 'Product not found' });
        }
        
        // Attempt to delete images from GCS
        const GCS_BASE_URL = `https://storage.googleapis.com/${bucket.name}/`;
        const deletePromises = [];

        if (product.baseImageURL && product.baseImageURL.startsWith(GCS_BASE_URL)) {
            const gcsFileName = product.baseImageURL.substring(GCS_BASE_URL.length);
            console.log(`Attempting to delete base image from GCS: ${gcsFileName}`);
            deletePromises.push(bucket.file(gcsFileName).delete().catch(err => console.error(`Failed to delete base image ${gcsFileName} from GCS:`, err)));
        }
        if (product.additionalImageURLs && product.additionalImageURLs.length > 0) {
            product.additionalImageURLs.forEach(url => {
                if (url && url.startsWith(GCS_BASE_URL)) {
                    const gcsFileName = url.substring(GCS_BASE_URL.length);
                    console.log(`Attempting to delete additional image from GCS: ${gcsFileName}`);
                    deletePromises.push(bucket.file(gcsFileName).delete().catch(err => console.error(`Failed to delete additional image ${gcsFileName} from GCS:`, err)));
                }
            });
        }
        await Promise.all(deletePromises);
        console.log("Associated GCS images (if any) deletion process initiated.");

        console.log("Admin Products: Product deleted successfully from DB:", product._id);
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error(`Admin Products: Error deleting product ID ${req.params.id}:`, error);
        res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
});


module.exports = router;
