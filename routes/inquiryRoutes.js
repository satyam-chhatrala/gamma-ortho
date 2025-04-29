// routes/inquiryRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const emailService = require('../services/emailService'); // Adjust path if necessary

// Configure multer for memory storage (good for attaching directly to emails)
const storage = multer.memoryStorage();
// Increase file size limit if needed, e.g., 5MB per file
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit per file
}); 

// POST /api/inquiry/submit
// 'contact-files' should match the name attribute of your file input in the HTML form
router.post('/submit', upload.array('contact-files[]', 5), async (req, res) => { 
    // upload.array can take a second argument for max number of files
  console.log("Inquiry route: Received POST request on /api/inquiry/submit");
  console.log("Inquiry route: Form data (req.body):", req.body);
  console.log("Inquiry route: Files received:", req.files ? `${req.files.length} files` : "No files");

  try {
    const inquiryData = req.body; // Text fields
    const files = req.files;       // Uploaded files (array)

    if (!inquiryData['contact-name'] || !inquiryData['contact-email'] || !inquiryData['contact-message'] || !inquiryData['contact-category']) {
        console.error("Inquiry route: Validation Error - Missing required inquiry data.");
        return res.status(400).json({ message: 'Missing required inquiry data (name, email, category, message).' });
    }
    
    // --- TODO: Optionally save inquiry to database here ---

    await emailService.sendInquiryEmail(inquiryData, files);
    
    console.log('Inquiry route: Inquiry email initiated successfully.');
    res.status(200).json({ message: 'Inquiry submitted successfully! We will get back to you soon.' });

  } catch (error) {
    console.error('Inquiry route: Error processing inquiry or sending email:', error);
     if (error.message === "Email service misconfiguration." || error.message.includes("currently unavailable")) {
        return res.status(503).json({ message: error.message });
    }
    res.status(500).json({ message: 'There was an error submitting your inquiry. Please try again later.' });
  }
});

module.exports = router;
