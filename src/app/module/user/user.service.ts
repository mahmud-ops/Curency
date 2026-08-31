import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  // Get existing image
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      imagePublicId: true,
    },
  });

  // Upload new image
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ resource_type: "image" }, (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary upload failed"));
          return;
        }

        resolve(result);
      })
      .end(buffer);
  });

  // Update database
  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
    },
    omit: {
      password: true,
    },
  });

  // Delete old image
  if (existingUser?.imagePublicId) {
    await cloudinary.uploader.destroy(existingUser.imagePublicId);
  }

  return updatedUser;
};

export const userServices = {
  uploadProfileImage,
};
