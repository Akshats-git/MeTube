import jwt from "jsonwebtoken";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const verifyJWT = asyncHandler(async (req, _, next) => {
    const token = req.cookies.accessToken || req.headers.authorization?.split(" ")[1]; // Check for token in cookies or Authorization header
    if (!token) {
        throw new ApiError(401, "Access token is missing");
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken._id).select("-password -refreshToken");
        if (!user) {
            throw new ApiError(401, "User not found");
        }

        req.user = user; // Attach user information to the request object
        next();
    } catch (error) {
        throw new ApiError(401, "Invalid or expired access token");
    }
})