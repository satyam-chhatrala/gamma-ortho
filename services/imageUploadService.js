// services/imageUploadService.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const { format } = require('util'); // For formatting public URL

console.log("--- imageUploadService.js: Initializing Google Cloud Storage ---");

// --- Log raw environment variables ---
console.log("Raw GCS_BUCKET_NAME from env:", process.env.GCS_BUCKET_NAME);
const rawGcsCredentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
if (rawGcsCredentialsJson) {
    console.log("Raw GOOGLE_APPLICATION_CREDENTIALS_JSON from env is SET (length):", rawGcsCredentialsJson.length);
    if (rawGcsCredentialsJson.trim().startsWith("{") && rawGcsCredentialsJson.trim().endsWith("}")) {
        console.log("GOOGLE_APPLICATION_CREDENTIALS_JSON appears to be in JSON format.");
    } else {
        console.warn("WARNING: GOOGLE_APPLICATION_CREDENTIALS_JSON does NOT appear to be in JSON format.");
    }
} else {
    console.warn("WARNING: GOOGLE_APPLICATION_CREDENTIALS_JSON from env is NOT SET or is empty.");
}
console.log("Raw GOOGLE_APPLICATION_CREDENTIALS file path from env:", process.env.GOOGLE_APPLICATION_CREDENTIALS);


// --- Initialize Google Cloud Storage ---
let storage;
let bucket;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
let isGCSInitialized = false; // Flag to track successful initialization

try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        let credentials;
        try {
            credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
            console.log("Successfully parsed GOOGLE_APPLICATION_CREDENTIALS_JSON.");
        } catch (e) {
            console.error("ERROR parsing GOOGLE_APPLICATION_CREDENTIALS_JSON:", e.message);
            throw new Error("Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable.");
        }
        storage = new Storage({ credentials });
        console.log("Google Cloud Storage configured using JSON credentials from env var GOOGLE_APPLICATION_CREDENTIALS_JSON.");
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
        console.log("Google Cloud Storage configured using keyFile path from env var GOOGLE_APPLICATION_CREDENTIALS.");
    } else {
        storage = new Storage(); 
        console.warn("Google Cloud Storage attempting to use default application credentials. Ensure this is configured on the platform if not using explicit credentials.");
    }

    if (!GCS_BUCKET_NAME) {
        throw new Error("GCS_BUCKET_NAME environment variable is not set. Cannot initialize GCS bucket.");
    }
    if (!storage) { 
        throw new Error("Storage client failed to initialize before bucket access.");
    }
    bucket = storage.bucket(GCS_BUCKET_NAME);
    console.log(`GCS Service: Successfully initialized and connected to GCS bucket: ${GCS_BUCKET_NAME}`);
    isGCSInitialized = true; 

} catch (error) {
    console.error("FATAL ERROR during GCS Initialization in imageUploadService.js:", error.message);
    console.error("Full GCS Initialization Error:", error);
    bucket = { 
        file: (filename) => ({
            createWriteStream: (options) => {
                const stream = require('stream').PassThrough();
                process.nextTick(() => {
                     stream.emit('error', new Error("GCS Not Initialized or Bucket Name Missing. Upload will fail. Filename: " + filename));
                });
                stream.end = (buffer) => { stream.emit('finish'); }; 
                return stream;
            },
            delete: () => { // Add a dummy delete method to the fallback
                console.error("Dummy GCS bucket: delete called, but GCS is not initialized.");
                return Promise.reject(new Error("GCS Not Initialized. Cannot delete file."));
            }
        })
    };
    console.error("Image uploads and deletions will fail due to GCS initialization error.");
}


/**
 * Uploads a file buffer to Google Cloud Storage.
 * @param {Buffer} buffer - The file buffer to upload.
 * @param {string} originalFilename - The original name of the file (used for extension and naming).
 * @param {string} destinationFolderPath - The path/folder within the bucket (e.g., "products/images/"). Must end with a slash.
 * @returns {Promise<string>} A promise that resolves with the public URL of the uploaded file.
 */
const uploadFileToGCS = (buffer, originalFilename, destinationFolderPath) => {
    return new Promise((resolve, reject) => {
        if (!isGCSInitialized || !bucket || typeof bucket.file !== 'function') { 
            console.error("GCS service not properly initialized. Cannot upload file.");
            return reject(new Error("Image Storage Service (GCS) is not properly initialized on the server. Please check backend logs and configuration."));
        }

        const ext = path.extname(originalFilename);
        const baseName = path.basename(originalFilename, ext);
        const uniqueFilename = `${destinationFolderPath}${baseName.replace(/\s+/g, '_')}-${Date.now()}${ext}`;
        
        const file = bucket.file(uniqueFilename);

        const stream = file.createWriteStream({
            metadata: {
                contentType: 'auto', 
            },
            resumable: false, 
            public: true    
        });

        stream.on('error', (err) => {
            console.error(`Error uploading ${originalFilename} to GCS path ${uniqueFilename}:`, err);
            reject(err);
        });

        stream.on('finish', () => {
            const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${uniqueFilename}`;
            console.log(`${originalFilename} uploaded to GCS. Public URL: ${publicUrl}`);
            resolve(publicUrl);
        });

        stream.end(buffer);
    });
};

/**
 * Deletes a file from Google Cloud Storage based on its public URL.
 * @param {string} fileUrl - The public URL of the file to delete (e.g., https://storage.googleapis.com/your-bucket/path/to/file.jpg).
 * @returns {Promise<void>} A promise that resolves when deletion is attempted.
 */
const deleteFileFromGCS = async (fileUrl) => {
    if (!isGCSInitialized || !bucket || typeof bucket.file !== 'function') {
        console.error("GCS service not properly initialized. Cannot delete file.");
        // Optionally throw an error or just log and return
        return Promise.reject(new Error("Image Storage Service (GCS) is not properly initialized."));
    }
    if (!fileUrl || typeof fileUrl !== 'string') {
        console.warn("deleteFileFromGCS: Invalid or empty fileUrl provided.");
        return Promise.resolve(); // Nothing to delete
    }

    try {
        // Extract the object name from the URL.
        // Example URL: https://storage.googleapis.com/BUCKET_NAME/OBJECT_NAME
        const prefix = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/`;
        if (!fileUrl.startsWith(prefix)) {
            console.warn(`deleteFileFromGCS: URL "${fileUrl}" does not match expected GCS public URL prefix.`);
            return Promise.resolve(); // Not a GCS URL from our bucket
        }
        const objectName = fileUrl.substring(prefix.length);

        if (!objectName) {
            console.warn(`deleteFileFromGCS: Could not extract object name from URL "${fileUrl}".`);
            return Promise.resolve();
        }

        console.log(`Attempting to delete GCS object: ${objectName}`);
        await bucket.file(objectName).delete();
        console.log(`Successfully deleted GCS object: ${objectName}`);
        return Promise.resolve();
    } catch (error) {
        // GCS delete() throws an error if the file doesn't exist, which is often acceptable.
        if (error.code === 404) { // Not Found
            console.warn(`deleteFileFromGCS: File not found in GCS (or already deleted): ${fileUrl}. Error code: ${error.code}`);
            return Promise.resolve(); // Consider this a success in terms of cleanup
        }
        console.error(`Error deleting file from GCS (${fileUrl}):`, error);
        // We might not want to reject the promise here to allow other operations to continue,
        // but log the error. Depending on requirements, you might re-throw.
        return Promise.reject(error); 
    }
};


module.exports = {
    uploadFileToGCS,
    deleteFileFromGCS, // Export the new function
    isGCSInitialized 
};
