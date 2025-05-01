// services/imageUploadService.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const { format } = require('util'); // For formatting public URL

// --- Initialize Google Cloud Storage ---
let storage;
let bucket;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        storage = new Storage({ credentials });
        console.log("Google Cloud Storage configured using JSON credentials from env var.");
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // This path would be relevant if the key file was on the server's filesystem
        storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
        console.log("Google Cloud Storage configured using keyFile from env var.");
    } else {
        // Tries to use default ADC if available, might not work on all platforms without explicit setup.
        // This is less likely to work reliably on platforms like Render without explicit service account setup.
        storage = new Storage(); 
        console.warn("Google Cloud Storage attempting to use default application credentials. Ensure this is configured on the platform if not using explicit credentials.");
    }

    if (!GCS_BUCKET_NAME) {
        throw new Error("GCS_BUCKET_NAME environment variable is not set.");
    }
    bucket = storage.bucket(GCS_BUCKET_NAME);
    console.log(`Connected to GCS bucket: ${GCS_BUCKET_NAME}`);

} catch (error) {
    console.error("FATAL ERROR: Could not initialize Google Cloud Storage. Check credentials and bucket name.", error);
    // Fallback to a dummy storage object to prevent crashes if GCS is essential for app flow
    // and allow the app to start, though uploads will fail.
    bucket = {
        file: () => ({
            createWriteStream: (options) => {
                const stream = require('stream').PassThrough();
                // Immediately emit an error on the dummy stream
                process.nextTick(() => {
                     stream.emit('error', new Error("GCS Not Initialized or Bucket Name Missing. Upload will fail."));
                });
                stream.end = () => {}; // Mock end function
                return stream;
            }
        })
    };
    console.error("Image uploads will fail due to GCS initialization error.");
}


/**
 * Uploads a file buffer to Google Cloud Storage.
 * @param {Buffer} buffer - The file buffer to upload.
 * @param {string} originalFilename - The original name of the file.
 * @param {string} destinationPath - The path/folder within the bucket (e.g., "products/images/").
 * @returns {Promise<string>} A promise that resolves with the public URL of the uploaded file.
 */
const uploadFileToGCS = (buffer, originalFilename, destinationPath) => {
    return new Promise((resolve, reject) => {
        if (!bucket || !GCS_BUCKET_NAME) { // Check if bucket was initialized
            console.error("GCS bucket not available for upload.");
            return reject(new Error("Google Cloud Storage bucket not initialized."));
        }

        // Create a unique filename to avoid overwriting
        const uniqueFilename = `${destinationPath}${Date.now()}-${originalFilename.replace(/\s+/g, '_')}`;
        const file = bucket.file(uniqueFilename);

        const stream = file.createWriteStream({
            metadata: {
                contentType: 'auto', // Automatically detect content type
            },
            resumable: false, // Good for smaller files; for larger files, consider resumable uploads
            public: true // Make the file publicly readable by default
        });

        stream.on('error', (err) => {
            console.error(`Error uploading ${originalFilename} to GCS:`, err);
            reject(err);
        });

        stream.on('finish', () => {
            // The file is now publicly readable. Construct the public URL.
            // The public URL format is `https://storage.googleapis.com/[BUCKET_NAME]/[OBJECT_NAME]`
            const publicUrl = format(`https://storage.googleapis.com/${GCS_BUCKET_NAME}/${uniqueFilename}`);
            console.log(`${originalFilename} uploaded to GCS: ${publicUrl}`);
            resolve(publicUrl);
        });

        stream.end(buffer);
    });
};

module.exports = {
    uploadFileToGCS
};
