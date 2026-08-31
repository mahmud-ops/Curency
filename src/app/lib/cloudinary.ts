import config from "../config";
import { v2 as Cloudinary } from "cloudinary";

// Return "https" URLs by setting secure: true
Cloudinary.config({
  cloud_name: config.cloudinary_cloud_name,
  api_key: config.cloudinary_api_key,
  api_secret: config.cloudinary_api_secret,
});

// Log the configuration
console.log(Cloudinary.config());

export const cloudinary = Cloudinary
