import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

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

export {registerUser, loginUser};