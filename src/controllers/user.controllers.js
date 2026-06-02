import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import mongoose, { Mongoose } from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        if(!user) {
            throw new ApiError(404, "User not found");
        }
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
    
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false}); // we can skip validation as we are not updating any user input fields here, just saving the generated refresh token
    
        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(500, "Failed to generate access and refresh tokens");
    }
}

const registerUser = asyncHandler(async (req, res) => {
    // registration logic will be here
    const {fullName, username, email, password} = req.body;

    // validation
    if([fullName, username, email, password].some((field) => !field || field.trim() === "")) {
        throw new ApiError(400, "All fields are required and must not be empty");
    }

    const existedUser = await User.findOne({$or: [{email}, {username}]});

    if(existedUser){
        throw new ApiError(409, "User with the same email or username already exists");
    }
    console.warn(req.files);

    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar is missing");
    }

    // const avatar = await uploadToCloudinary(avatarLocalPath, "avatars");
    // let coverImage = "";
    // if(coverImageLocalPath) {
    //     coverImage = await uploadToCloudinary(coverImageLocalPath, "coverImages");
    // }

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        console.log("Avatar uploaded successfully", avatar);
    } catch (error) {
        console.log("Error uploading avatar to cloudinary ", error);
        throw new ApiError(500, "Failed to upload avatar");
    }

    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverImageLocalPath)
        console.log("Cover image uploaded successfully", coverImage);
    } catch (error) {
        console.log("Error uploading cover image to cloudinary ", error);
        throw new ApiError(500, "Failed to upload cover image");
    }

    try {
        const user = await User.create({
            fullName,
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            username: username.toLowerCase(),
            email,
            password
        })
    
        const createdUser = await User.findById(user._id).select("-password -refreshToken");
        if(!createdUser) {
            throw new ApiError(500, "User registration failed");
        }
    
        return res
            .status(201)
            .json(
                new ApiResponse(201, createdUser, "User registered successfully")
            )
    } catch (error) {
        console.error("Error during user registration ", error);
        // If avatar or cover image was uploaded successfully but user creation failed, we should clean up the uploaded images from cloudinary
        if(avatar?.public_id) {
            await deleteFromCloudinary(avatar.public_id);
        }
        if(coverImage?.public_id) {
            await deleteFromCloudinary(coverImage.public_id);
        }
        throw new ApiError(500, "User registration failed");
    }
})

const loginUser = asyncHandler(async  (req,res) => {
    const {email, username, password} = req.body;

    if(!email) {
        throw new ApiError(400, "Email is required");
    }
    const user = await User.findOne({email});

    if(!user) {
        throw new ApiError(404, "User not found");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if(!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials");
    }
    
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    if(!loggedInUser) {
        throw new ApiError(500, "Login failed");
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // set secure flag in production
    }

    return res
    .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, {user: loggedInUser, accessToken, refreshToken}, "User logged in successfully")
        );
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {refreshToken: undefined}
        },
        {new: true}
    )
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // set secure flag in production
    }
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, null, "User logged out successfully")
        );
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if(!incomingRefreshToken) {
        throw new ApiError(400, "Refresh token is required");
    }

    try {
        const decodedToken =jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id);

        if(!user || user?.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, "Invalid refresh token");
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // set secure flag in production
        }

        const {accessToken, refreshToken: newRefreshToken} = await generateAccessAndRefreshTokens(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(200, {accessToken, refreshToken: newRefreshToken}, "Access token refreshed successfully")
            );

    } catch (error) {
        console.error("Error refreshing access token ", error);
        throw new ApiError(500, "Failed to refresh access token");
    } 
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id)

    const isPasswordValid = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordValid) {
        throw new ApiError(401, "Old password is incorrect");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false}); // we can skip validation as we are not updating any user input fields here, just saving the new password

    return res
        .status(200)
        .json(
            new ApiResponse(200, null, "Password changed successfully")
        );
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(
            new ApiResponse(200, req.user, "Current user fetched successfully")
        );
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullName, email} = req.body;

    if(!fullName && !email) {
        throw new ApiError(400, "At least one field (fullName or email) is required to update");
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                fullName: fullName || req.user.fullName,
                email: email || req.user.email
            }
        },
        {new: true}
    )
    .select("-password -refreshToken")

    if(!user) {
        throw new ApiError(500, "Failed to update account details");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Account details updated successfully")
        );
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar image file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if(!avatar.url) {
        throw new ApiError(500, "Failed to upload avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {avatar: avatar.url}
        },
        {new: true}
    )
    .select("-password -refreshToken")

    if(!user) {
        throw new ApiError(500, "Cannot find user. Failed to update avatar");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Avatar updated successfully")
        );
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;

    if(!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is required");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!coverImage.url) {
        throw new ApiError(500, "Failed to upload cover image");
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {coverImage: coverImage.url}
        },
        {new: true}
    )
    .select("-password -refreshToken")

    if(!user) {
        throw new ApiError(500, "Cannot find user. Failed to update cover image");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Cover image updated successfully")
        );
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const {username} = req.params;

    if(!username?.trim()) {
        throw new ApiError(400, "Username is required");
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {$size: "$subscribers"},
                subscribedToCount: {$size: "$subscribedTo"},
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                email: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                subscribedToCount: 1,
                isSubscribed: 1
            }
        }
    ])

    if(!channel || channel.length === 0) {
        throw new ApiError(404, "Channel not found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, channel[0], "Channel profile fetched successfully")
        );
})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchedVideos",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {$arrayElemAt: ["$owner", 0]} // since owner will be an array after lookup, we need to get the first element of that array
                        }
                    }
                ]
            }
        }
    ])

    if(!user || user.length === 0) {
        throw new ApiError(404, "User not found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, user[0]?.watchedVideos, "Watch history fetched successfully")
        );
})

export {registerUser, loginUser, refreshAccessToken, logoutUser, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage, getUserChannelProfile, getWatchHistory};