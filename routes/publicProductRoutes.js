// routes/publicProductRoutes.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product'); // Adjust path if your models folder is different

// GET /api/products - Get all active products for customer display
router.get('/', async (req, res) => {
    console.log("Public Products: Received GET request to list all active products");
    try {
        const products = await Product.find({ isActive: true }) // Only fetch active products
            .select('name description productType baseImageURL additionalImageURLs dimensions gstRate') // Select only necessary fields
            .sort({ name: 1 }); // Sort alphabetically by name, or by createdAt: -1 for newest first

        // We need to ensure that the dimensions array for each product only contains
        // dimensionName and basePrice for the frontend, and calculate priceIncGst.
        // The frontend will handle displaying the GST percentage.
        const productsForCustomer = products.map(product => {
            const dimensionsForCustomer = product.dimensions.map(dim => ({
                dimensionName: dim.dimensionName,
                basePrice: dim.basePrice
                // priceIncGst will be calculated on the frontend when adding to cart or displaying
            }));
            return {
                _id: product._id, // Send the ID for "Add to cart" functionality
                name: product.name,
                description: product.description,
                productType: product.productType,
                baseImageURL: product.baseImageURL,
                additionalImageURLs: product.additionalImageURLs,
                dimensions: dimensionsForCustomer, // Send simplified dimensions
                gstRate: product.gstRate // Send GST rate for frontend calculations
            };
        });

        res.status(200).json(productsForCustomer);
    } catch (error) {
        console.error("Public Products: Error fetching active products:", error);
        res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
});

// GET /api/products/:id - Get a single active product by ID (Optional - if you have a dedicated product detail page)
// For now, the main page loads all product details needed.
// router.get('/:id', async (req, res) => {
//     try {
//         const product = await Product.findOne({ _id: req.params.id, isActive: true })
//             .select('name description productType baseImageURL additionalImageURLs dimensions gstRate');
        
//         if (!product) {
//             return res.status(404).json({ message: 'Product not found or not active' });
//         }
//         // Similar mapping for dimensions as in the GET / route if needed
//         res.status(200).json(product);
//     } catch (error) {
//         console.error(`Public Products: Error fetching product ID ${req.params.id}:`, error);
//         res.status(500).json({ message: 'Error fetching product details', error: error.message });
//     }
// });

module.exports = router;
