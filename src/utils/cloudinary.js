import {v2 as cloudinary} from "cloudinary"
import fs from "fs"
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null
        //upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        // file has been uploaded successfull
        console.log("file is uploaded on cloudinary ", response.url);
        // once the file is uploaded on cloudinary successfully, we can remove the file from local storage as it's no longer needed
        fs.unlinkSync(localFilePath)
        return response;

    } catch (error) {
        console.error("Error uploading file on cloudinary ", error);
        if (localFilePath) {
            fs.unlinkSync(localFilePath) // remove the locally saved temporary file as the upload operation got failed
        }
        throw error;
    }
}

const deleteFromCloudinary = async (publicId) => {
    try {
        const response = await cloudinary.uploader.destroy(publicId);
        console.log("File deleted from cloudinary ", response);
        return response;
    } catch (error) {
        console.error("Error deleting file from cloudinary ", error);
        return null;
    }
}

export {uploadOnCloudinary, deleteFromCloudinary};