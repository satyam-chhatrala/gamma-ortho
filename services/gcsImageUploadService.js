// services/gcsImageUploadService.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const { format } = require('util'); // Used for formatting public URL

// Initialize GCS Storage client
// This will automatically use credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON
// or GOOGLE_APPLICATION_CREDENTIALS environment variables if set.
let storage;
let bucket;
const bucketName = process.env.GCS_BUCKET_NAME;

try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        storage = new Storage({ credentials });
        console.log("GCS Service: Configured using JSON credentials from env var.");
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
        console.log("GCS Service: Configured using keyFile from env var.");
    } else {
        // Fallback or error if no credentials found
        console.error("FATAL ERROR: Google Cloud Storage credentials not found in environment variables (GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS).");
        // To prevent crashes, you could implement a dummy storage here for local dev without GCS,
        // but for production, credentials are a must.
        throw new Error("GCS credentials missing.");
    }

    if (!bucketName) {
        console.error("FATAL ERROR: GCS_BUCKET_NAME environment variable is not set.");
        throw new Error("GCS_BUCKET_NAME missing.");
    }
    bucket = storage.bucket(bucketName);
    console.log(`GCS Service: Successfully connected to bucket: ${bucketName}`);

} catch (error) {
    console.error("GCS Service: Initialization failed - ", error.message);
    // Implement a fallback or ensure the application handles this gracefully if GCS is critical
    bucket = { // Dummy bucket object to prevent crashes if initialization fails
        file: () => ({
            createWriteStream: () => {
                const stream = require('stream');
                const passThrough = new stream.PassThrough();
                passThrough.on = (event, cb) => { if (event === 'error') cb(new Error('GCS not initialized')); return passThrough; };
                passThrough.end = () => {};
                return passThrough;
            }
        })
    };
}


/**
 * Uploads a file buffer to Google Cloud Storage.
 * @param {Buffer} buffer - The file buffer from multer.
 * @param {string} originalFilename - The original name of the file.
 * @param {string} destinationFolder - The folder path within the GCS bucket (e.g., 'products/base_images').
 * @returns {Promise<string>} - A promise that resolves with the public URL of the uploaded file.
 */
const uploadFileToGCS = (buffer, originalFilename, destinationFolder) => {
    return new Promise((resolve, reject) => {
        if (!bucket || !bucketName) { // Check if bucket was initialized
            console.error("GCS Service: Bucket not initialized. Cannot upload file.");
            return reject(new Error("GCS Bucket not available."));
        }

        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(originalFilename)}`;
        const filePath = destinationFolder ? `${destinationFolder}/${uniqueFilename}` : uniqueFilename;
        const file = bucket.file(filePath);

        const stream = file.createWriteStream({
            metadata: {
                contentType: 'auto', // Automatically detect content type
            },
            resumable: false, // Good for smaller files; for larger files, consider resumable uploads
            public: true // Make the file publicly readable by default
        });

        stream.on('error', (err) => {
            console.error(`GCS Service: Error uploading ${filePath}:`, err);
            reject(err);
        });

        stream.on('finish', () => {
            // The public URL can be constructed using the bucket name and file name.
            // Ensure your bucket has public access configured for this to work directly.
            // Otherwise, you might need to generate signed URLs.
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
            // For more robust public URL generation, especially if using uniform bucket-level access:
            // const publicUrl = format(`https://storage.googleapis.com/${bucket.name}/${file.name}`);
            console.log(`GCS Service: File ${filePath} uploaded successfully. Public URL: ${publicUrl}`);
            resolve(publicUrl);
        });

        stream.end(buffer);
    });
};

module.exports = {
    uploadFileToGCS
};
